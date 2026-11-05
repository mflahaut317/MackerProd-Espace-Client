// Agenda de l'équipe Mackerprod au format iCal, à ajouter dans Google Agenda
// (Autres agendas > + > « À partir de l'URL »). Google le relit tout seul, en général
// quelques fois par jour.
// GET  ?cle=…  : le flux (dates des étapes + prochains rendez-vous), sans connexion.
// POST         : réservé à l'équipe (is_admin), renvoie le lien secret du flux.
// La clé est dérivée de la clé service_role : rien à configurer, jamais stockée en clair.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SITE = 'https://mackerprod-espace-client.mflahaut317.workers.dev';
const URL_SB = Deno.env.get('SUPABASE_URL')!;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function cleAgenda() {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('agenda-mackerprod-v1'));
  return Array.from(new Uint8Array(sig).slice(0, 20), (b) => b.toString(16).padStart(2, '0')).join('');
}

// iCal : échappement des textes et lignes de 75 caractères au plus.
const txt = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const plier = (l: string) => l.length <= 74 ? l : l.match(/.{1,73}/gu)!.join('\r\n ');
const jour = (d: string) => d.replaceAll('-', '');
const lendemain = (d: string) => new Date(new Date(d + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10).replaceAll('-', '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (req.method === 'POST') {
    const sb = createClient(URL_SB, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: admin } = await sb.rpc('is_admin');
    if (admin !== true) return Response.json({ error: 'Réservé à l’équipe Mackerprod.' }, { status: 403, headers: CORS });
    return Response.json({ url: `${URL_SB}/functions/v1/agenda?cle=${await cleAgenda()}` }, { headers: CORS });
  }

  if (new URL(req.url).searchParams.get('cle') !== await cleAgenda()) return new Response('Lien d’agenda invalide', { status: 403 });

  const sb = createClient(URL_SB, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const depuis = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const [{ data: projets }, { data: etapes }, { data: noms }] = await Promise.all([
    sb.from('projets').select('id, titre, type, prochain_rdv, prochain_rdv_note, clients(nom, entreprise, email)'),
    sb.from('etapes').select('projet_id, numero, date_prevue, statut').not('date_prevue', 'is', null).gte('date_prevue', depuis),
    sb.from('services_etapes').select('type, numero, libelle'),
  ]);
  const libelle = new Map((noms ?? []).map((n) => [`${n.type}:${n.numero}`, n.libelle]));
  const parId = new Map((projets ?? []).map((p: any) => [p.id, p]));
  const qui = (p: any) => p?.clients?.nom || p?.clients?.entreprise || p?.clients?.email || '';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const evts: string[] = [];
  const ajouter = (uid: string, d: string, titre: string, p: any) => evts.push([
    'BEGIN:VEVENT', `UID:${uid}@mackerprod`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${jour(d)}`, `DTEND;VALUE=DATE:${lendemain(d)}`,
    `SUMMARY:${txt(titre)}`, `DESCRIPTION:${txt(`${p.titre}\n${SITE}/#/projet/${p.id}`)}`,
    `URL:${SITE}/#/projet/${p.id}`, 'TRANSP:TRANSPARENT', 'END:VEVENT',
  ].map(plier).join('\r\n'));

  for (const e of etapes ?? []) {
    const p = parId.get(e.projet_id);
    if (!p) continue;
    const nom = libelle.get(`${p.type}:${e.numero}`) ?? `Étape ${e.numero}`;
    ajouter(`etape-${e.projet_id}-${e.numero}`, e.date_prevue, `${e.statut === 'termine' ? '✓ ' : ''}${nom} · ${qui(p)}`, p);
  }
  for (const p of projets ?? []) {
    if (p.prochain_rdv && p.prochain_rdv >= depuis) ajouter(`rdv-${p.id}`, p.prochain_rdv, `${p.prochain_rdv_note || 'Rendez-vous'} · ${qui(p)}`, p);
  }

  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mackerprod//Espace client//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Mackerprod · projets clients', 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H', ...evts, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
});
