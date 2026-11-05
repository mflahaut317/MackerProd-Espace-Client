// Prépare l'envoi d'une vidéo sur le compte Vimeo de Mackerprod.
// Le navigateur envoie ensuite le fichier directement à Vimeo (protocole tus) :
// la vidéo ne transite pas par Supabase, même pour plusieurs Go.
// Range la vidéo dans un dossier Vimeo au nom du client (créé au besoin).
// action « supprimer » : supprime la vidéo de Vimeo quand l'équipe la retire du site.
// Réservé à l'équipe (is_admin).
// Secret à définir dans Supabase > Edge Functions > Secrets :
//   VIMEO_TOKEN  jeton Vimeo « Authenticated (you) » avec Public, Private, Edit, Upload, Video Files, Delete, Create
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const VIMEO = 'https://api.vimeo.com';
const entetes = (jeton: string) => ({
  Authorization: `bearer ${jeton}`,
  'Content-Type': 'application/json',
  Accept: 'application/vnd.vimeo.*+json;version=3.4',
});

// Mot de passe lisible (sans 0/O, 1/l) pour les formules Vimeo qui n'ont pas « Non répertorié ».
const motDePasse = () => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => a[n % a.length]).join('');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const jeton = Deno.env.get('VIMEO_TOKEN');
  if (!jeton) return json({ error: 'Vimeo n’est pas encore relié : ajoutez le secret VIMEO_TOKEN dans Supabase.' }, 503);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: admin } = await sb.rpc('is_admin');
  if (admin !== true) return json({ error: 'Réservé à l’équipe Mackerprod.' }, 403);

  const { action, nom, taille, projet_id, url } = await req.json().catch(() => ({}));

  if (action === 'supprimer') {
    const id = String(url ?? '').match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    if (!id) return json({ error: 'Ce lien n’est pas une vidéo Vimeo.' }, 400);
    const d = await fetch(`${VIMEO}/videos/${id}`, { method: 'DELETE', headers: entetes(jeton) });
    if (!d.ok && d.status !== 404) return json({ error: d.status === 403 ? 'La clé Vimeo n’a pas le droit Delete.' : `Vimeo a refusé la suppression (${d.status}).` }, 502);
    return json({ ok: true });
  }

  if (!Number.isFinite(taille) || taille <= 0) return json({ error: 'Taille de fichier invalide.' }, 400);

  // Vimeo attend le mot de passe à la racine (« password »), pas dans « privacy ».
  const creer = (view: string, password?: string) => fetch(`${VIMEO}/me/videos`, {
    method: 'POST',
    headers: entetes(jeton),
    body: JSON.stringify({
      upload: { approach: 'tus', size: taille },
      name: String(nom || 'Vidéo Mackerprod').slice(0, 128),
      privacy: { download: false, add: false, comments: 'nobody', view },
      ...(password ? { password } : {}),
    }),
  });

  // 1er essai : « Non répertorié » (formules payantes supérieures). Sinon : mot de passe.
  let mdp: string | null = null;
  let r = await creer('unlisted');
  if (!r.ok && r.status >= 400 && r.status < 500) {
    console.error('Vimeo unlisted refusé', r.status, await r.text());
    mdp = motDePasse();
    r = await creer('password', mdp);
  }
  if (!r.ok) {
    const detail = await r.text();
    console.error('Vimeo', r.status, detail);
    return json({ error: r.status === 401 ? 'Jeton Vimeo refusé : vérifiez VIMEO_TOKEN.' : `Vimeo a refusé l’envoi (${r.status}).` }, 502);
  }
  const v = await r.json();

  // Réglages du lecteur intégré, au mieux : certains dépendent de la formule Vimeo.
  await fetch(`${VIMEO}${v.uri}`, {
    method: 'PATCH',
    headers: entetes(jeton),
    body: JSON.stringify({
      embed: {
        title: { name: 'hide', owner: 'hide', portrait: 'hide' },
        buttons: { like: false, watchlater: false, share: false, embed: false },
        logos: { vimeo: false },
        end_screen: { type: 'empty' },
      },
    }),
  }).catch(() => {});

  // Dossier Vimeo au nom du client, au mieux (nécessite le droit Create pour le créer).
  if (projet_id) {
    try {
      const { data: p } = await sb.from('projets').select('clients(nom, entreprise, email)').eq('id', projet_id).single();
      const c = (p as any)?.clients;
      const dossier = String(c?.nom || c?.entreprise || c?.email || '').trim().slice(0, 128);
      if (dossier) {
        const liste = await fetch(`${VIMEO}/me/projects?per_page=100&fields=uri,name`, { headers: entetes(jeton) }).then((x) => x.json());
        let uri = (liste?.data ?? []).find((f: any) => f.name === dossier)?.uri;
        if (!uri) {
          const cree = await fetch(`${VIMEO}/me/projects`, { method: 'POST', headers: entetes(jeton), body: JSON.stringify({ name: dossier }) });
          if (cree.ok) uri = (await cree.json()).uri;
        }
        if (uri) await fetch(`${VIMEO}${uri}${v.uri}`, { method: 'PUT', headers: entetes(jeton) });
      }
    } catch (e) { console.error('Dossier Vimeo', e); }
  }

  return json({ upload_link: v.upload.upload_link, lien: v.link, mdp });
});
