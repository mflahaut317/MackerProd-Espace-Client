// Prépare l'envoi d'une vidéo sur le compte Vimeo de Mackerprod.
// Le navigateur envoie ensuite le fichier directement à Vimeo (protocole tus) :
// la vidéo ne transite pas par Supabase, même pour plusieurs Go.
// Réservé à l'équipe (is_admin).
// Secret à définir dans Supabase > Edge Functions > Secrets :
//   VIMEO_TOKEN  jeton Vimeo « Authenticated (you) » avec Public, Private, Edit, Upload, Video Files
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

  const { nom, taille } = await req.json().catch(() => ({}));
  if (!Number.isFinite(taille) || taille <= 0) return json({ error: 'Taille de fichier invalide.' }, 400);

  const creer = (privacy: Record<string, unknown>) => fetch(`${VIMEO}/me/videos`, {
    method: 'POST',
    headers: entetes(jeton),
    body: JSON.stringify({
      upload: { approach: 'tus', size: taille },
      name: String(nom || 'Vidéo Mackerprod').slice(0, 128),
      privacy: { download: false, add: false, comments: 'nobody', ...privacy },
    }),
  });

  // 1er essai : « Non répertorié » (formules payantes supérieures). Sinon : mot de passe.
  let mdp: string | null = null;
  let r = await creer({ view: 'unlisted' });
  if (!r.ok && r.status >= 400 && r.status < 500) {
    mdp = motDePasse();
    r = await creer({ view: 'password', password: mdp });
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

  return json({ upload_link: v.upload.upload_link, lien: v.link, mdp });
});
