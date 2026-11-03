// Envoie les alertes en attente (table notifications), regroupées par destinataire.
// Appelée toutes les 5 minutes par pg_cron. Envoi via Resend (offre gratuite : 3 000 e-mails/mois).
// Secrets à définir dans Supabase > Edge Functions > Secrets :
//   RESEND_API_KEY  clé API Resend
//   EMAIL_FROM      ex. « Mackerprod <notifications@mackerprod.fr> » (domaine vérifié chez Resend)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Notif = { id: string; destinataire: string; sujet: string; texte: string; lien: string | null };

function email(notifs: Notif[]) {
  const sujet = notifs.length === 1 ? notifs[0].sujet : `${notifs.length} nouveautés sur votre espace Mackerprod`;
  const items = notifs.map((n) => `
    <tr><td style="padding:18px 0;border-bottom:1px solid #e5ddd3">
      <div style="font:600 11px/1.2 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#941e28">${esc(n.sujet)}</div>
      <div style="font:15px/1.5 Arial,sans-serif;color:#1a2026;margin-top:6px">${esc(n.texte)}</div>
      ${n.lien ? `<a href="${esc(n.lien)}" style="display:inline-block;margin-top:10px;font:600 12px Arial,sans-serif;color:#941e28">Ouvrir l’espace client →</a>` : ''}
    </td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f1ebe3">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1ebe3;padding:24px 12px"><tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;padding:28px">
        <tr><td style="font:600 13px Arial,sans-serif;letter-spacing:4px;color:#1a2026;padding-bottom:12px;border-bottom:2px solid #941e28">MACKERPROD · ESPACE CLIENT</td></tr>
        ${items}
        <tr><td style="padding-top:18px;font:12px/1.5 Arial,sans-serif;color:#9d958c">
          Réponse sous 24 h ouvrées · 07 49 43 73 69 · contact@mackerprod.com
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
  const text = notifs.map((n) => `${n.sujet}\n${n.texte}${n.lien ? `\n${n.lien}` : ''}`).join('\n\n');
  return { sujet, html, text };
}

Deno.serve(async (req) => {
  // Seul pg_cron connaît ce secret (rangé dans le coffre-fort Supabase).
  const { data: secret } = await sb.rpc('secret_notifications');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Non autorisé', { status: 401 });
  }

  await sb.rpc('rappels_24h');

  const cle = Deno.env.get('RESEND_API_KEY');
  if (!cle) return Response.json({ envoye: 0, info: 'RESEND_API_KEY manquante : alertes gardées en attente' });
  const from = Deno.env.get('EMAIL_FROM') ?? 'Mackerprod <onboarding@resend.dev>';

  const { data: attente, error } = await sb.from('notifications')
    .select('id, destinataire, sujet, texte, lien')
    .is('envoye_le', null).is('erreur', null)
    .order('created_at').limit(200);
  if (error) return Response.json({ erreur: error.message }, { status: 500 });

  const parDest = new Map<string, Notif[]>();
  for (const n of attente ?? []) parDest.set(n.destinataire, [...(parDest.get(n.destinataire) ?? []), n]);

  let envoye = 0;
  for (const [dest, notifs] of parDest) {
    const { sujet, html, text } = email(notifs);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [dest], subject: sujet, html, text, reply_to: 'contact@mackerprod.com' }),
    });
    const ids = notifs.map((n) => n.id);
    if (r.ok) {
      await sb.from('notifications').update({ envoye_le: new Date().toISOString() }).in('id', ids);
      envoye++;
    } else {
      await sb.from('notifications').update({ erreur: `${r.status} ${(await r.text()).slice(0, 300)}` }).in('id', ids);
    }
  }
  return Response.json({ envoye });
});
