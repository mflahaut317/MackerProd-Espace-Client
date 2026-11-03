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
const CHAMPS_LANCEMENT = [
  ['objectifs', 'Objectifs du projet'], ['cible', 'Clientèle visée'],
  ['pages_souhaitees', 'Pages souhaitées sur le site'],
  ['references_style', 'Sites ou vidéos qui te plaisent (liens)'],
  ['couleurs_logo', 'Couleurs, logo, charte'], ['contenus_fournis', 'Textes et photos déjà disponibles'],
  ['lieu_tournage', 'Lieu du tournage'], ['dates_tournage', 'Dates possibles pour le tournage'],
  ['contraintes', 'Contraintes (délais, accès, budget…)'],
];
const CATEGORIES = { video: 'Vidéo', photo: 'Photo', document: 'Document', maquette: 'Maquette', autre: 'Autre' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

let etapesRef = [];
let profil = null;

// Démarrage et navigation ------------------------------------------------------
// #/            : accueil (tableau de bord admin ou espace client)
// #/projet/<id> : détail d'un projet

// Supabase interdit d'attendre une autre requête dans ce rappel (blocage) :
// on lance donc le rendu juste après, hors du rappel.
sb.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => demarrer(session).catch(showError), 0);
});
window.addEventListener('hashchange', () => profil && Promise.resolve(router()).catch(showError));
logoutBtn.onclick = () => sb.auth.signOut();

async function demarrer(session) {
  logoutBtn.hidden = !session;
  profil = null;
  if (!session) return renderLogin();

  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) return showError(error);
  profil = data;

  if (!etapesRef.length) {
    const { data: ref } = await sb.from('etapes_ref').select('*').order('numero');
    etapesRef = ref ?? [];
  }
  router();
}

function router() {
  const m = location.hash.match(/^#\/projet\/([0-9a-f-]{36})$/);
  if (m) return renderProjet(m[1]);
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

// Accueil client ---------------------------------------------------------------

async function renderClient(clientId) {
  const [{ data: fiche, error }, { data: projets }] = await Promise.all([
    sb.from('clients').select('*').eq('id', clientId).single(),
    sb.from('projets').select('*, etapes(*)').eq('client_id', clientId).order('created_at'),
  ]);
  if (error) return showError(error);

  app.innerHTML = `
    <h1>Bonjour ${esc(fiche.nom || '')}</h1>
    <h2>Tes projets</h2>
    ${(projets ?? []).map((p) => projetResumeHtml(p)).join('') || '<p class="muted">Aucun projet pour l’instant.</p>'}
    <h2>Ta fiche</h2>
    <p class="muted small">Remplis-la une seule fois : Macker Prod s’en sert pour toutes les étapes.</p>
    ${formHtml('fiche', CHAMPS_FICHE, fiche, 'notes', 'Remarques')}`;
  bindForm('fiche', (maj) => sb.from('clients').update(maj).eq('id', clientId));
}

// Petits morceaux réutilisés ---------------------------------------------------

function etapesHtml(etapes, editable, projetId) {
  const triees = [...(etapes ?? [])].sort((a, b) => a.numero - b.numero);
  return `<ol class="steps">${triees.map((e) => {
    const libelle = etapesRef.find((r) => r.numero === e.numero)?.libelle ?? `Étape ${e.numero}`;
    const ctrl = editable
      ? `<select data-projet="${projetId}" data-numero="${e.numero}" aria-label="Statut">${Object.entries(STATUTS).map(([v, t]) =>
          `<option value="${v}" ${v === e.statut ? 'selected' : ''}>${t}</option>`).join('')}</select>`
      : `<span class="muted small" style="margin-left:auto">${STATUTS[e.statut]}</span>`;
    return `<li class="${e.statut}"><span class="dot"></span>${e.numero}. ${esc(libelle)}${ctrl}</li>`;
  }).join('')}</ol>`;
}

function etapeEnCours(etapes) {
  const e = (etapes ?? []).filter((x) => x.statut === 'en_cours').sort((a, b) => a.numero - b.numero)[0];
  if (!e) return (etapes ?? []).every((x) => x.statut === 'termine') ? 'Terminé' : 'À venir';
  return etapesRef.find((r) => r.numero === e.numero)?.libelle ?? '';
}

function projetResumeHtml(p) {
  return `<a class="card projet-lien" href="#/projet/${p.id}">
    <strong>${esc(p.titre)}</strong>
    <span class="muted small">En cours : ${esc(etapeEnCours(p.etapes))}</span>
  </a>`;
}

function formHtml(id, champs, valeurs, champLong, labelLong) {
  return `<form id="${id}" class="card"><div class="grid">
    ${champs.map(([k, l]) => `<div><label for="${id}_${k}">${l}</label>
      <input id="${id}_${k}" name="${k}" value="${esc(valeurs?.[k])}"></div>`).join('')}
    </div>
    ${champLong ? `<label for="${id}_${champLong}">${labelLong}</label>
    <textarea id="${id}_${champLong}" name="${champLong}" rows="3">${esc(valeurs?.[champLong])}</textarea>` : ''}
    <button>Enregistrer</button> <span class="msg muted small"></span>
  </form>`;
}

function bindForm(id, enregistrer) {
  const form = document.getElementById(id);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await enregistrer(Object.fromEntries(new FormData(form)));
    form.querySelector('.msg').textContent = error ? `Erreur : ${error.message}` : 'Enregistré.';
  };
}

function bindStatuts() {
  app.querySelectorAll('select[data-projet]').forEach((s) => (s.onchange = async () => {
    const { error } = await sb.from('etapes').update({ statut: s.value })
      .eq('projet_id', s.dataset.projet).eq('numero', Number(s.dataset.numero));
    if (error) return alert(error.message);
    s.closest('li').className = s.value;
  }));
}

// Détail d'un projet (client et admin) -----------------------------------------

async function renderProjet(id) {
  const admin = profil.role === 'admin';
  const [{ data: p, error }, { data: lancement }, { data: fichiers }, { data: messages }] = await Promise.all([
    sb.from('projets').select('*, etapes(*), clients(nom, entreprise, email)').eq('id', id).single(),
    sb.from('lancements').select('*').eq('projet_id', id).maybeSingle(),
    sb.from('fichiers').select('*').eq('projet_id', id).order('created_at', { ascending: false }),
    sb.from('messages').select('*').eq('projet_id', id).order('created_at'),
  ]);
  if (error) return showError(error);

  app.innerHTML = `
    <p><a href="#/">← Retour</a></p>
    <h1>${esc(p.titre)}</h1>
    ${admin ? `<p class="muted">${esc(p.clients?.nom || '')} · ${esc(p.clients?.entreprise || '')} · ${esc(p.clients?.email)}</p>` : ''}

    <div class="card">${etapesHtml(p.etapes, admin, p.id)}</div>

    <h2>Messages</h2>
    <div class="card">
      <div class="fil">${(messages ?? []).map((m) => `
        <div class="bulle ${m.par_admin ? 'admin' : 'client'}">
          <div class="small muted">${m.par_admin ? 'Macker Prod' : esc(p.clients?.nom || 'Client')} · ${dateFr(m.created_at)}</div>
          <div>${esc(m.contenu).replace(/\n/g, '<br>')}</div>
        </div>`).join('') || '<p class="muted">Aucun message pour l’instant.</p>'}
      </div>
      <form id="nouveau-message">
        <label for="msg_contenu">Ton message</label>
        <textarea id="msg_contenu" name="contenu" rows="3" required></textarea>
        <button>Envoyer</button>
      </form>
    </div>

    <h2>Fichiers et vidéos</h2>
    <div class="card">
      <ul class="fichiers">${(fichiers ?? []).map((f) => `
        <li><span class="tag">${CATEGORIES[f.categorie]}</span>
          <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titre)}</a>
          <span class="muted small">${f.par_admin ? 'Macker Prod' : 'Client'} · ${dateFr(f.created_at)}</span>
          ${admin || f.ajoute_par === profil.id ? `<button class="link" data-suppr="${f.id}">Retirer</button>` : ''}
        </li>`).join('') || '<li class="muted">Aucun fichier.</li>'}
      </ul>
      <form id="nouveau-fichier" class="grid">
        <div><label for="f_titre">Titre</label><input id="f_titre" name="titre" required></div>
        <div><label for="f_cat">Type</label><select id="f_cat" name="categorie">
          ${Object.entries(CATEGORIES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
        <div style="grid-column:1/-1"><label for="f_url">Lien (Drive, WeTransfer, Vimeo, YouTube…)</label>
          <input id="f_url" name="url" type="url" required placeholder="https://"></div>
        <div><button>Ajouter</button></div>
      </form>
      <p class="muted small">Les fichiers restent chez toi (Drive, Vimeo…). Ici on ne garde que les liens.</p>
    </div>

    <h2>Fiche de lancement</h2>
    <p class="muted small">Tout ce qu’il faut pour préparer le tournage et le site. Tes coordonnées sont déjà dans ta fiche, inutile de les redonner.</p>
    ${formHtml('lancement', CHAMPS_LANCEMENT, lancement)}`;

  if (admin) bindStatuts();
  bindForm('lancement', (maj) => sb.from('lancements').upsert({ projet_id: id, ...maj }));

  document.getElementById('nouveau-message').onsubmit = async (e) => {
    e.preventDefault();
    const contenu = e.target.contenu.value.trim();
    if (!contenu) return;
    const { error } = await sb.from('messages').insert({ projet_id: id, contenu });
    if (error) return alert(error.message);
    renderProjet(id);
  };

  document.getElementById('nouveau-fichier').onsubmit = async (e) => {
    e.preventDefault();
    const { titre, url, categorie } = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.from('fichiers').insert({ projet_id: id, titre, url, categorie });
    if (error) return alert(error.message);
    renderProjet(id);
  };

  app.querySelectorAll('[data-suppr]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Retirer ce lien ? Le fichier lui-même n’est pas supprimé.')) return;
    const { error } = await sb.from('fichiers').delete().eq('id', b.dataset.suppr);
    if (error) return alert(error.message);
    renderProjet(id);
  }));

  const fil = app.querySelector('.fil');
  fil.scrollTop = fil.scrollHeight;
}

// Tableau de bord admin (Maxence) ---------------------------------------------

async function renderAdmin() {
  const [{ data: clients, error }, { data: derniers }] = await Promise.all([
    sb.from('clients').select('*, projets(*, etapes(*))').order('created_at', { ascending: false }),
    sb.from('messages').select('projet_id, par_admin, created_at').order('created_at', { ascending: false }).limit(500),
  ]);
  if (error) return showError(error);

  // Projets dont le dernier message vient du client : il attend une réponse.
  const dernierParProjet = {};
  for (const m of derniers ?? []) dernierParProjet[m.projet_id] ??= m;
  const attente = (pid) => {
    const m = dernierParProjet[pid];
    return m && !m.par_admin ? m : null;
  };

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
      ${(c.projets ?? []).map((p) => {
        const m = attente(p.id);
        return `<a class="card projet-lien" href="#/projet/${p.id}">
          <strong>${esc(p.titre)}</strong>
          <span class="muted small">En cours : ${esc(etapeEnCours(p.etapes))}</span>
          ${m ? `<span class="alerte small">Message client du ${dateFr(m.created_at)} en attente</span>` : ''}
        </a>`;
      }).join('') || '<p class="muted">Aucun projet.</p>'}
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
}
