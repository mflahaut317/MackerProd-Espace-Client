import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const logoutBtn = document.getElementById('logout');

const STATUTS = { a_venir: 'À venir', en_cours: 'En cours', termine: 'Terminé' };
const CHAMPS_FICHE = [
  ['nom', 'Nom et prénom'], ['entreprise', 'Entreprise'], ['telephone', 'Téléphone'],
  ['adresse', 'Adresse'], ['siret', 'SIRET'], ['nom_de_domaine', 'Nom de domaine'],
  ['registrar', 'Domaine enregistré chez (OVH, Gandi…)'], ['reseaux_sociaux', 'Réseaux sociaux'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let etapesRef = [];

// Démarrage -------------------------------------------------------------------

sb.auth.onAuthStateChange((_event, session) => render(session));
logoutBtn.onclick = () => sb.auth.signOut();

async function render(session) {
  logoutBtn.hidden = !session;
  if (!session) return renderLogin();

  const { data: profil, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) return showError(error);

  if (!etapesRef.length) {
    const { data } = await sb.from('etapes_ref').select('*').order('numero');
    etapesRef = data ?? [];
  }

  if (profil.role === 'admin') return renderAdmin();
  if (!profil.client_id) {
    app.innerHTML = `<h1>Bienvenue</h1>
      <p class="notice">Ton compte (${esc(profil.email)}) n'est pas encore rattaché à un dossier.
      Macker Prod le fait sous 24 h ouvrées.</p>`;
    return;
  }
  return renderClient(profil.client_id);
}

function showError(error) {
  app.innerHTML = `<p class="notice">Erreur : ${esc(error.message)}</p>`;
}

// Connexion par lien magique ---------------------------------------------------

function renderLogin() {
  app.innerHTML = `
    <h1>Connexion</h1>
    <form id="login" class="card">
      <label for="email">Ton adresse e-mail</label>
      <input id="email" type="email" required autocomplete="email">
      <button>Recevoir mon lien de connexion</button>
      <p class="muted small">Pas de mot de passe : tu reçois un lien par e-mail.</p>
    </form>`;
  document.getElementById('login').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname },
    });
    e.target.innerHTML = error
      ? `<p>Erreur : ${esc(error.message)}</p>`
      : `<p>Lien envoyé à <strong>${esc(email)}</strong>. Ouvre-le sur cet appareil.</p>`;
  };
}

// Vue client -------------------------------------------------------------------

async function renderClient(clientId) {
  const [{ data: fiche, error }, { data: projets }] = await Promise.all([
    sb.from('clients').select('*').eq('id', clientId).single(),
    sb.from('projets').select('*, etapes(*)').eq('client_id', clientId).order('created_at'),
  ]);
  if (error) return showError(error);

  app.innerHTML = `
    <h1>Bonjour ${esc(fiche.nom || '')}</h1>
    <h2>Tes projets</h2>
    ${(projets ?? []).map((p) => projetHtml(p, false)).join('') || '<p class="muted">Aucun projet pour l’instant.</p>'}
    <h2>Ta fiche</h2>
    <p class="muted small">Remplis-la une seule fois : Macker Prod s’en sert pour toutes les étapes.</p>
    ${ficheFormHtml(fiche)}`;
  bindFicheForm(clientId);
}

function ficheFormHtml(fiche) {
  return `<form id="fiche" class="card"><div class="grid">
    ${CHAMPS_FICHE.map(([k, l]) => `<div><label for="f_${k}">${l}</label>
      <input id="f_${k}" name="${k}" value="${esc(fiche[k])}"></div>`).join('')}
    </div>
    <label for="f_notes">Remarques</label>
    <textarea id="f_notes" name="notes" rows="3">${esc(fiche.notes)}</textarea>
    <button>Enregistrer</button> <span id="fiche_msg" class="muted small"></span>
  </form>`;
}

function bindFicheForm(clientId) {
  const form = document.getElementById('fiche');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const maj = Object.fromEntries(new FormData(form));
    const { error } = await sb.from('clients').update(maj).eq('id', clientId);
    document.getElementById('fiche_msg').textContent = error ? `Erreur : ${error.message}` : 'Enregistré.';
  };
}

function projetHtml(p, admin) {
  const etapes = [...(p.etapes ?? [])].sort((a, b) => a.numero - b.numero);
  return `<div class="card"><strong>${esc(p.titre)}</strong>
    <ol class="steps">${etapes.map((e) => {
      const libelle = etapesRef.find((r) => r.numero === e.numero)?.libelle ?? `Étape ${e.numero}`;
      const ctrl = admin
        ? `<select data-projet="${p.id}" data-numero="${e.numero}">${Object.entries(STATUTS).map(([v, t]) =>
            `<option value="${v}" ${v === e.statut ? 'selected' : ''}>${t}</option>`).join('')}</select>`
        : `<span class="muted small" style="margin-left:auto">${STATUTS[e.statut]}</span>`;
      return `<li class="${e.statut}"><span class="dot"></span>${e.numero}. ${esc(libelle)}${ctrl}</li>`;
    }).join('')}</ol></div>`;
}

// Vue admin (Maxence) ----------------------------------------------------------

async function renderAdmin() {
  const { data: clients, error } = await sb.from('clients')
    .select('*, projets(*, etapes(*))').order('created_at', { ascending: false });
  if (error) return showError(error);

  app.innerHTML = `
    <h1>Tableau de bord</h1>
    <form id="nouveau" class="card">
      <strong>Nouveau client</strong>
      <div class="grid">
        <div><label for="n_email">E-mail (sert à la connexion)</label><input id="n_email" name="email" type="email" required></div>
        <div><label for="n_nom">Nom</label><input id="n_nom" name="nom"></div>
        <div><label for="n_ent">Entreprise</label><input id="n_ent" name="entreprise"></div>
        <div><label for="n_projet">Premier projet</label><input id="n_projet" name="projet" placeholder="Site + vidéo"></div>
      </div>
      <button>Créer</button>
    </form>
    ${(clients ?? []).map((c) => `
      <h2>${esc(c.nom || c.email)} <span class="muted small">${esc(c.entreprise)} · ${esc(c.email)}</span></h2>
      ${(c.projets ?? []).map((p) => projetHtml(p, true)).join('') || '<p class="muted">Aucun projet.</p>'}
      <form class="card ajout-projet" data-client="${c.id}">
        <label>Ajouter un projet</label><input name="titre" required>
        <button>Ajouter</button>
      </form>`).join('')}`;

  document.getElementById('nouveau').onsubmit = async (e) => {
    e.preventDefault();
    const { email, nom, entreprise, projet } = Object.fromEntries(new FormData(e.target));
    const { data: c, error } = await sb.from('clients').insert({ email, nom, entreprise }).select().single();
    if (error) return alert(error.message);
    if (projet) await sb.from('projets').insert({ client_id: c.id, titre: projet });
    renderAdmin();
  };

  app.querySelectorAll('.ajout-projet').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from('projets').insert({ client_id: f.dataset.client, titre: f.titre.value });
    if (error) return alert(error.message);
    renderAdmin();
  }));

  app.querySelectorAll('select[data-projet]').forEach((s) => (s.onchange = async () => {
    const { error } = await sb.from('etapes').update({ statut: s.value })
      .eq('projet_id', s.dataset.projet).eq('numero', Number(s.dataset.numero));
    if (error) return alert(error.message);
    s.closest('li').className = s.value;
  }));
}
