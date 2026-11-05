import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AVIS_GOOGLE_URL } from './config.js';
import { SERVICES, EQUIPE, serviceDe } from './services.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// « Voir comme le client » : l'équipe parcourt l'espace d'un client, en lecture seule.
// Toute écriture est bloquée ici, avant d'atteindre Supabase.
let vueClient = null;
try { vueClient = sessionStorage.getItem('vue-client'); } catch {}
const APERCU = 'Vous regardez l’espace comme le client : rien n’est enregistré.';
const bloque = () => {
  const res = { data: null, error: { message: APERCU } };
  const q = new Proxy(() => {}, { get: (_, k) => (k === 'then' ? (ok) => ok(res) : () => q) });
  return q;
};
const fromReel = sb.from.bind(sb);
sb.from = (table) => {
  const q = fromReel(table);
  if (vueClient) for (const k of ['insert', 'update', 'upsert', 'delete']) q[k] = bloque;
  return q;
};
const rpcReel = sb.rpc.bind(sb);
sb.rpc = (nom, args) => (vueClient && nom !== 'livraison_publique' ? bloque() : rpcReel(nom, args));
const estAdmin = () => profil?.role === 'admin' && !vueClient;
const clientCourant = () => vueClient || profil?.client_id;
function changerVue(id, retour) {
  vueClient = id;
  try { id ? sessionStorage.setItem('vue-client', id) : sessionStorage.removeItem('vue-client'); } catch {}
  if (location.hash === retour) router(); else location.hash = retour;
}
const app = document.getElementById('app');
const logoutBtn = document.getElementById('logout');
const who = document.getElementById('who');
const side = document.getElementById('side');
const nav = document.getElementById('nav');
const tabbar = document.getElementById('tabbar');
const topbar = document.getElementById('topbar');

// Menu (à gauche sur ordinateur, onglets en bas sur téléphone) -------------------
const ICONES = {
  jour: '<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="3"/>',
  projets: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4-2.5z"/>',
  clients: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><circle cx="17" cy="8" r="2.4"/><path d="M16 13.6c2.2.2 3.8 1.6 4.5 4"/>',
  accueil: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>',
  infos: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>',
};
const ico = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[k]}</svg>`;
function menu() {
  const admin = estAdmin();
  const items = admin
    ? [['#/', 'jour', 'Aujourd’hui'], ['#/projets', 'projets', 'Projets'], ['#/clients', 'clients', 'Clients']]
    : [['#/', 'accueil', 'Accueil'], ['#/projets', 'projets', 'Mes projets'], ['#/infos', 'infos', 'Mes infos']];
  const h = location.hash || '#/';
  const actif = (href) => href === '#/' ? (h === '#/' || h === '' || h === '#')
    : h.startsWith(href) || (href === '#/projets' && h.startsWith('#/projet/')) || (href === '#/clients' && h.startsWith('#/client/'));
  const lien = ([href, k, t]) => `<a href="${href}" data-k="${k}" ${actif(href) ? 'aria-current="page"' : ''}>${ico(k)}<span>${t}</span></a>`;
  nav.innerHTML = items.map(lien).join('');
  tabbar.innerHTML = items.map(lien).join('');
  side.hidden = tabbar.hidden = topbar.hidden = !profil;
}
// Pastille rouge sur un élément du menu (nombre de choses à faire).
function pastille(k, n) {
  document.querySelectorAll(`[data-k="${k}"]`).forEach((a) => {
    a.querySelector('.n')?.remove();
    if (n) a.insertAdjacentHTML('beforeend', `<span class="n">${n}</span>`);
  });
}

// Contenu ----------------------------------------------------------------------

const STATUTS = { a_venir: 'À venir', en_cours: 'En cours', termine: 'Terminé' };
const CHAMPS_FICHE = [
  ['nom', 'Nom et prénom'], ['entreprise', 'Entreprise'], ['telephone', 'Téléphone'],
  ['adresse', 'Adresse'], ['siret', 'SIRET', 'Si vous êtes une entreprise'],
  ['reseaux_sociaux', 'Réseaux sociaux', 'Liens Instagram, Facebook…'],
];
const FICHE_ESSENTIEL = ['nom', 'telephone', 'adresse'];
const REVUE = ['video', 'maquette', 'script'];
const CATEGORIES = { video: 'Vidéo', photo: 'Photo', document: 'Document', maquette: 'Maquette', script: 'Script', autre: 'Autre' };

// Outils -----------------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = (d) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const jourFr = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const jourCourt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const equipeHtml = (ids) => `<div class="equipe">${ids.map((k) => EQUIPE[k]).map((m) => `
  <figure><img src="${m.photo}" alt="${esc(m.nom)}" loading="lazy"><figcaption><b>${esc(m.nom)}</b><span>${esc(m.role)}</span></figcaption></figure>`).join('')}</div>`;
const aujourdhui = () => new Date().toLocaleDateString('sv-SE');
const DEMANDES = { parrainage: 'Parrainage', tirages: 'Tirages photo', album: 'Album', nouveau_projet: 'Nouveau projet' };
const rempli = (v) => v != null && String(v).trim() !== '';
const tri = (etapes) => [...(etapes ?? [])].sort((a, b) => a.numero - b.numero);

function etapeCourante(etapes) {
  const t = tri(etapes);
  return t.find((e) => e.statut === 'en_cours') ?? t.find((e) => e.statut === 'a_venir') ?? t[t.length - 1];
}

// Un projet attend une réponse de l'autre partie si le dernier message vient d'elle.
function dernierMessage(messages, projetId) {
  return (messages ?? []).filter((m) => m.projet_id === projetId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

let profil = null;

// Démarrage et navigation ------------------------------------------------------
// #/                       accueil (tableau de bord ou espace client)
// #/projet/<id>[/<onglet>] page projet

// Supabase interdit d'attendre une autre requête dans ce rappel (blocage) :
// on lance donc le rendu juste après, hors du rappel.
sb.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => demarrer(session).catch(showError), 0);
});
window.addEventListener('hashchange', () => {
  const partage = location.hash.match(/^#\/partage\/([0-9a-f-]{36})$/);
  if (partage) return renderPartage(partage[1]).catch(showError);
  if (profil) Promise.resolve(router()).catch(showError);
});
logoutBtn.onclick = () => { vueClient = null; try { sessionStorage.removeItem('vue-client'); } catch {} sb.auth.signOut(); };

async function demarrer(session) {
  logoutBtn.hidden = !session;
  profil = null;
  const partage = location.hash.match(/^#\/partage\/([0-9a-f-]{36})$/);
  if (!session) { menu(); return partage ? renderPartage(partage[1]) : renderLogin(); }

  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) return showError(error);
  profil = data;
  if (profil.role !== 'admin') vueClient = null;
  who.textContent = profil.role === 'admin' ? 'Équipe Mackerprod' : profil.email;
  return router();
}

function router() {
  window.scrollTo(0, 0);
  menu();
  document.body.classList.add('sombre');
  bandeauVue();
  const pt = location.hash.match(/^#\/partage\/([0-9a-f-]{36})$/);
  if (pt) return renderPartage(pt[1]);
  const lv = location.hash.match(/^#\/projet\/([0-9a-f-]{36})\/livraison$/);
  if (lv) return renderLivraison(lv[1]);
  const r = location.hash.match(/^#\/projet\/([0-9a-f-]{36})\/revue\/([0-9a-f-]{36})$/);
  if (r) return renderRevue(r[1], r[2]);
  const m = location.hash.match(/^#\/projet\/([0-9a-f-]{36})(?:\/(\w+))?$/);
  if (m) return estAdmin() ? renderProjet(m[1], m[2]) : renderProjetClient(m[1], m[2]);
  const fc = location.hash.match(/^#\/client\/([0-9a-f-]{36})$/);
  if (fc && estAdmin()) return renderFicheClient(fc[1]);
  if (estAdmin()) {
    if (location.hash === '#/projets') return renderProjetsAdmin();
    if (location.hash === '#/clients') return renderClientsAdmin();
    return renderAdmin();
  }
  if (!clientCourant()) {
    app.innerHTML = `
      <p class="label rule">Bienvenue</p>
      <h1 class="h-l">Votre espace est <em>presque prêt</em></h1>
      <p class="notice section">Votre compte (${esc(profil.email)}) n’est pas encore relié à un dossier.
      Mackerprod s’en occupe sous 24 h ouvrées.</p>`;
    return;
  }
  if (location.hash === '#/infos') return renderInfosClient(clientCourant());
  if (location.hash === '#/projets') return renderProjetsClient(clientCourant());
  return renderClient(clientCourant());
}

// Bandeau en haut de page tant que l'équipe regarde l'espace d'un client.
function bandeauVue() {
  let b = document.getElementById('vue-client');
  if (!(vueClient && profil?.role === 'admin')) return b?.remove();
  if (!b) {
    b = document.createElement('div');
    b.id = 'vue-client';
    b.className = 'bandeau-vue';
    b.innerHTML = `<span>Vous voyez l’espace comme le client · lecture seule</span><button type="button" class="btn btn-sm">Quitter</button>`;
    b.querySelector('button').onclick = () => changerVue(null, `#/client/${vueClient}`);
    document.body.prepend(b);
  }
}

function showError(error) {
  app.innerHTML = `<p class="notice">Une erreur est survenue : ${esc(error.message)}</p>`;
}

// Connexion par lien magique ---------------------------------------------------

function renderLogin() {
  app.innerHTML = `
    <div class="login">
      <img class="login-logo" src="logo-mackerprod.png" alt="Mackerprod">
      <p class="label">Espace client</p>
      <h1 class="h-l">Suivez votre projet, de la signature à la livraison</h1>
      <p class="lead">Avancement, vidéos à valider, échanges et fichiers : tout est réuni ici.</p>
      <form id="login" class="card">
        <label for="email">Votre adresse e-mail</label>
        <input id="email" type="email" required autocomplete="email" placeholder="vous@exemple.fr">
        <div class="form-foot"><button class="btn" style="width:100%">Recevoir mon lien de connexion</button></div>
        <p class="muted small" style="margin-top:16px">Pas de mot de passe : vous recevez un lien par e-mail, il suffit de cliquer dessus.</p>
      </form>
    </div>`;
  document.getElementById('login').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname },
    });
    e.target.innerHTML = error
      ? `<p class="msg err">${esc(messageErreur(error))}</p>`
      : `<p class="h-m">Vérifiez votre boîte mail</p>
         <p class="lead">Un lien de connexion a été envoyé à <strong>${esc(email)}</strong>.
         Ouvrez-le sur cet appareil. Pensez à regarder dans les indésirables.</p>`;
  };
}

// Accueil client ---------------------------------------------------------------

async function renderClient(clientId) {
  const [{ data: fiche, error }, { data: projets }, { data: lancements }, { data: messages }, { data: fichiers }, { data: retours }] = await Promise.all([
    sb.from('clients').select('*').eq('id', clientId).single(),
    sb.from('projets').select('*, etapes(*)').eq('client_id', clientId).order('created_at'),
    sb.from('lancements').select('projet_id, reponses'),
    sb.from('messages').select('projet_id, par_admin, created_at').order('created_at', { ascending: false }).limit(200),
    sb.from('fichiers').select('id, projet_id, titre, categorie, par_admin, livrable, created_at, url'),
    sb.from('retours').select('fichier_id, type, par_admin'),
  ]);
  if (error) return showError(error);
  const { data: demandes } = await sb.from('demandes').select('*').order('created_at', { ascending: false });

  // Ce que le client doit faire maintenant, du plus important au moins important.
  const todo = [];
  for (const p of projets ?? []) {
    if ((fichiers ?? []).some((x) => x.projet_id === p.id && x.livrable)) {
      todo.unshift({ href: `#/projet/${p.id}/livraison`, titre: serviceDe(p).livraison, sub: `${p.titre} · découvrez votre livraison` });
    }
    for (const vs of groupesVersions((fichiers ?? []).filter((x) => x.projet_id === p.id && !x.livrable))) {
      const f = vs.at(-1);
      if (!(retours ?? []).some((r) => r.fichier_id === f.id && (r.type === 'validation' || !r.par_admin))) {
        todo.push({ href: `#/projet/${p.id}/revue/${f.id}`, titre: f.categorie === 'script' ? `Lire et valider le script « ${f.titre} »` : `Regarder la V${vs.length} de « ${f.titre} »`, sub: `${p.titre} · commentez puis validez` });
      }
    }
    if (p.prochain_rdv && p.prochain_rdv >= aujourdhui()) {
      todo.push({ href: `#/projet/${p.id}`, titre: `${p.prochain_rdv_note || 'Prochain rendez-vous'} · ${jourFr(p.prochain_rdv)}`, sub: `${p.titre} · on se retrouve bientôt` });
    }
    const m = dernierMessage(messages, p.id);
    if (m?.par_admin) todo.push({ href: `#/projet/${p.id}/messages`, titre: 'Nouveau message de Mackerprod', sub: `${p.titre} · ${dateFr(m.created_at)}` });
    const e = etapeCourante(p.etapes);
    const lanc = (lancements ?? []).find((l) => l.projet_id === p.id);
    if (e && e.numero >= 3 && e.numero <= 4 && !(serviceDe(p).masquer ?? []).includes(3) && !Object.values(lanc?.reponses ?? {}).some(rempli)) {
      todo.push({ href: `#/projet/${p.id}/lancement`, titre: 'Remplir la fiche de préparation', sub: `${p.titre} · pour que tout soit prêt le jour du tournage` });
    }
  }
  // Après-vente : visible dès qu'un projet est livré ou arrive au bout.
  const livres = (projets ?? []).filter((p) => (fichiers ?? []).some((x) => x.projet_id === p.id && x.livrable) || (etapeCourante(p.etapes)?.numero ?? 0) >= 6);
  const avecPhotos = livres.some((p) => ['mariage', 'evenement', 'seance_photo'].includes(p.type));
  const carteApres = (type, titre, texte, champs, bouton) => `
    <details class="apres-carte">
      <summary><span class="label bronze">${titre}</span><span class="apres-texte">${texte}</span><span class="btn btn-line btn-sm">${bouton}</span></summary>
      <form class="demande" data-type="${type}">${champs}
        <div class="form-foot"><button class="btn btn-sm">Envoyer</button><span class="msg" role="status"></span></div></form>
    </details>`;
  const apresHtml = livres.length ? `
    <section class="section" id="apres">
      <p class="label">Et après ?</p>
      <p class="panel-intro">Votre projet est livré, mais on reste là. Une envie, une question, quelqu’un à nous présenter : c’est ici.</p>
      <div class="apres">
        ${carteApres('parrainage', 'Parrainer un proche', 'Un ami, un collègue, un couple qui se marie ? Présentez-nous, on prendra soin d’eux comme de vous.', `
          <div class="grid"><div><label>Son nom</label><input name="nom" required></div>
          <div><label>E-mail ou téléphone</label><input name="contact" required></div>
          <div class="full"><label>Quelques mots sur son projet</label><textarea name="message" rows="2"></textarea></div></div>`, 'Recommander')}
        ${avecPhotos ? carteApres('tirages', 'Tirages & albums', 'Vos plus belles images sur papier : tirages d’art, cadres ou album à feuilleter.', `
          <div class="grid"><div><label>Ce qui vous ferait plaisir</label><select name="choix"><option value="tirages">Des tirages ou des cadres</option><option value="album">Un album</option></select></div>
          <div class="full"><label>Formats, quantités, photos préférées…</label><textarea name="message" rows="2"></textarea></div></div>`, 'Commander') : ''}
        ${carteApres('nouveau_projet', 'Un nouveau projet', 'Un lancement, un anniversaire, une nouvelle saison de contenus : parlons-en.', `
          <div><label>Votre idée</label><textarea name="message" rows="2" required></textarea></div>`, 'En parler')}
      </div>
      ${(demandes ?? []).length ? `<ul class="demandes">${demandes.map((x) => `<li><span class="tag">${DEMANDES[x.type]}</span>
        <span>${esc(x.details?.nom || x.details?.message || '')}</span><span class="meta">${dateFr(x.created_at)}</span>
        <span class="badge ${x.traitee ? 'ok' : 'line'}">${x.traitee ? 'Traitée' : 'Reçue'}</span></li>`).join('')}</ul>` : ''}
    </section>` : '';

  const manquants = FICHE_ESSENTIEL.filter((k) => !rempli(fiche[k]));
  if (manquants.length) todo.push({ href: '#fiche', titre: 'Compléter vos coordonnées', sub: `${manquants.length} information${manquants.length > 1 ? 's' : ''} manquante${manquants.length > 1 ? 's' : ''} · une seule fois pour tous vos projets` });

  pastille('accueil', todo.length);
  const [premier, ...suite] = todo;
  const prenom = (fiche.nom || '').split(' ')[0];
  app.innerHTML = `
    <p class="label">Espace client Mackerprod</p>
    <h1 class="h-l">Bonjour${prenom ? ` ${esc(prenom)}` : ''}</h1>
    ${premier ? `<a class="urgence" href="${premier.href}"><small>À faire en priorité</small><b>${esc(premier.titre)}</b><small>${esc(premier.sub)}</small><span class="cta">J’y vais →</span></a>`
      : `<div class="urgence calme"><small>Tout est à jour</small><b>Rien ne vous attend pour le moment</b><small>On vous prévient par e-mail dès qu’il y a du nouveau.</small></div>`}

    ${suite.length ? `<section class="section">
      <p class="label">Ensuite</p>
      <div class="liste">${suite.map((t) => `<a class="ligne" href="${t.href}"><span class="dot b"></span><span><b>${esc(t.titre)}</b><small>${esc(t.sub)}</small></span><span></span><span class="btn btn-line btn-sm">Ouvrir</span></a>`).join('')}</div>
    </section>` : ''}

    <section class="section">
      <p class="label">Vos projets</p>
      <div class="vignettes">${(projets ?? []).map((p) => vignetteProjet(p, fichiers, { sous: serviceDe(p).label })).join('') || '<p class="empty">Aucun projet pour l’instant.</p>'}</div>
    </section>

    <section class="section">
      <p class="label">Votre équipe</p>
      ${equipeHtml([...new Set((projets ?? []).flatMap((p) => serviceDe(p).equipe))].length ? [...new Set((projets ?? []).flatMap((p) => serviceDe(p).equipe))] : Object.keys(EQUIPE))}
    </section>

    ${apresHtml}`;
  app.querySelectorAll('form.demande').forEach((f) => (f.onsubmit = async (ev) => {
    ev.preventDefault();
    const { choix, ...details } = Object.fromEntries(new FormData(f));
    const type = choix || f.dataset.type;
    const { error } = await sb.from('demandes').insert({ client_id: clientId, projet_id: livres.at(-1)?.id ?? null, type, details });
    if (error) return alert(messageErreur(error));
    renderClient(clientId);
  }));
}

// Mes infos (client) : coordonnées une seule fois, et export complet du dossier.
async function renderInfosClient(clientId) {
  const { data: fiche, error } = await sb.from('clients').select('*').eq('id', clientId).single();
  if (error) return showError(error);
  app.innerHTML = `
    <p class="label">Mes infos</p>
    <h1 class="h-l">Vos coordonnées</h1>
    <p class="lead">À remplir une seule fois : Mackerprod les réutilise pour tous vos projets.</p>
    <section class="section">${formHtml('fiche', CHAMPS_FICHE, fiche, ['notes', 'Remarques'])}</section>
    <section class="section">
      <p class="label">Vos données</p>
      <div class="card export">
        <p>Téléchargez à tout moment l’intégralité de votre dossier : coordonnées, projets, liens vers vos fichiers, échanges et validations. Tout vous appartient.</p>
        <div class="form-foot"><button class="btn btn-line" id="exporter">Télécharger mon dossier</button></div>
      </div>
    </section>`;
  document.getElementById('exporter').onclick = () => exporterDossier(clientId);
  bindForm('fiche', (maj) => sb.from('clients').update(maj).eq('id', clientId), () => renderInfosClient(clientId));
}

// Mes projets (client) : tous les projets en vignettes.
async function renderProjetsClient(clientId) {
  const [{ data: projets, error }, { data: fichiers }] = await Promise.all([
    sb.from('projets').select('*, etapes(*)').eq('client_id', clientId).order('created_at', { ascending: false }),
    sb.from('fichiers').select('projet_id, categorie, url, created_at'),
  ]);
  if (error) return showError(error);
  app.innerHTML = `
    <p class="label">Mes projets</p>
    <h1 class="h-l">Vos projets avec Mackerprod</h1>
    <section class="section"><div class="vignettes">${(projets ?? []).map((p) => {
      const e = etapeCourante(p.etapes);
      return vignetteProjet(p, fichiers, { sous: serviceDe(p).label, st: e?.statut === 'termine' ? 'Terminé' : serviceDe(p).etapes[e?.numero]?.titre, stCls: e?.statut === 'termine' ? 'ok' : '' });
    }).join('') || '<p class="empty">Aucun projet pour l’instant.</p>'}</div></section>`;
}

// Morceaux réutilisés ----------------------------------------------------------

// Vignette d'un projet : image de sa dernière vidéo (YouTube, Vimeo) ou de sa dernière photo,
// sinon un dégradé propre à la prestation avec les initiales du projet.
const DEGRADES = {
  corporate: ['#30343c', '#8b8fa0'], immobilier: ['#3d566c', '#b39470'], frame2: ['#2f3d34', '#9fb18a'],
  site_web: ['#25313b', '#6d8796'], mariage: ['#5b4636', '#d9b48c'], evenement: ['#4a3a44', '#c7a1a8'], seance_photo: ['#3a3340', '#b49fb8'],
};
function imageDe(url) {
  const l = analyserLien(url ?? '', 'video');
  if (l.type === 'youtube') return `https://img.youtube.com/vi/${l.id}/hqdefault.jpg`;
  if (l.type === 'vimeo') return `https://vumbnail.com/${l.id}.jpg`;
  if (l.type === 'image') return url;
  return null;
}
function progression(p) {
  const vs = etapesVisibles(p);
  const e = etapeCourante(p.etapes);
  if (e?.statut === 'termine' && e.numero === 7) return 100;
  const i = vs.findIndex((x) => x.numero >= (e?.numero ?? 2));
  return Math.round((100 * Math.max(0, i)) / Math.max(1, vs.length));
}
function vignetteProjet(p, fichiers, { st = '', stCls = '', tc = '', sous = '' } = {}) {
  const img = (fichiers ?? []).filter((f) => f.projet_id === p.id && f.url && ['video', 'photo'].includes(f.categorie))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((f) => imageDe(f.url)).find(Boolean);
  const [c1, c2] = DEGRADES[p.type] ?? DEGRADES.site_web;
  const mono = (p.titre || '?').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return `<a class="vignette" href="#/projet/${p.id}">
    <span class="th" style="background:linear-gradient(150deg, ${c1}, ${c2})">${img ? `<img src="${esc(img)}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : ''}
      ${img ? '' : `<span class="mono">${esc(mono)}</span>`}${st ? `<span class="st ${stCls}">${esc(st)}</span>` : ''}${tc ? `<span class="tc">${esc(tc)}</span>` : ''}</span>
    <b>${esc(p.titre)}</b><small>${esc(sous)}</small>
    <span class="bar"><i style="width:${progression(p)}%"></i></span>
  </a>`;
}

function parcoursHtml(p, editable = false) {
  const projetId = p.id, svc = serviceDe(p);
  const etapes = editable ? tri(p.etapes) : etapesVisibles(p);
  return `<ol class="parcours" style="--n:${etapes.length}">${etapes.map((e, i) => `
    <li class="${e.statut}">
      <span class="n">${editable ? e.numero : i + 1}</span>
      <span class="t">${esc(svc.etapes[e.numero]?.titre)}</span>
      ${editable
        ? (e.statut === 'en_cours' ? '<span class="s">En cours</span>'
          : `<button class="aller" data-aller="${e.numero}" title="Passer le projet à cette étape">${e.statut === 'termine' ? 'Terminé · revenir ici' : 'Passer ici'}</button>`)
        : `<span class="s">${e.statut === 'en_cours' ? 'En cours' : e.statut === 'termine' ? 'Terminé' : e.date_prevue ? jourCourt(e.date_prevue) : ''}</span>`}
      ${editable ? `<input type="date" class="date-etape" data-projet="${projetId}" data-numero="${e.numero}" value="${e.date_prevue ?? ''}" aria-label="Date prévue de l’étape ${e.numero}">` : ''}
    </li>`).join('')}</ol>`;
}

function formHtml(id, champs, valeurs, long) {
  const tous = [...champs, ...(long ? [[long[0]]] : [])];
  const nb = tous.filter(([k]) => rempli(valeurs?.[k])).length;
  return `<form id="${id}" class="card">
    <div class="progress"><span>${nb} / ${tous.length} rempli${nb > 1 ? 's' : ''}</span><i><b style="width:${Math.round(100 * nb / tous.length)}%"></b></i></div>
    <div class="grid">
    ${champs.map(([k, l, h]) => `<div><label for="${id}_${k}">${l}${h ? `<span class="hint">${h}</span>` : ''}</label>
      <input id="${id}_${k}" name="${k}" value="${esc(valeurs?.[k])}"></div>`).join('')}
    ${long ? `<div class="full"><label for="${id}_${long[0]}">${long[1]}</label>
      <textarea id="${id}_${long[0]}" name="${long[0]}" rows="3">${esc(valeurs?.[long[0]])}</textarea></div>` : ''}
    </div>
    <div class="form-foot"><button class="btn">Enregistrer</button><span class="msg" role="status"></span></div>
  </form>`;
}

function bindForm(id, enregistrer, apres) {
  const form = document.getElementById(id);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const out = form.querySelector('.msg');
    const { error } = await enregistrer(Object.fromEntries(new FormData(form)));
    out.className = error ? 'msg err' : 'msg';
    out.textContent = error ? messageErreur(error) : 'Enregistré ✓';
    if (!error && apres) setTimeout(apres, 900);
  };
}

// Page projet (client et admin) ------------------------------------------------

async function renderProjet(id, onglet) {
  const admin = estAdmin();
  const [{ data: p, error }, { data: lancement }, { data: fichiers }, { data: messages }] = await Promise.all([
    sb.from('projets').select('*, etapes(*), clients(nom, entreprise, email, telephone)').eq('id', id).single(),
    sb.from('lancements').select('*').eq('projet_id', id).maybeSingle(),
    sb.from('fichiers').select('*').eq('projet_id', id).order('created_at', { ascending: false }),
    sb.from('messages').select('*').eq('projet_id', id).order('created_at'),
  ]);
  if (error) return showError(error);
  const { data: retours } = await sb.from('retours').select('fichier_id, type, traite, created_at').eq('projet_id', id);
  const revueInfo = (fid) => {
    const rs = (retours ?? []).filter((r) => r.fichier_id === fid);
    return { aTraiter: rs.filter((r) => !r.traite).length, valide: rs.find((r) => r.type === 'validation') };
  };

  const e = etapeCourante(p.etapes);
  const svc = serviceDe(p);
  const info = svc.etapes[e?.numero] ?? {};
  const reponses = { ...(lancement?.reponses ?? {}) };
  const coches = new Set(reponses._guide ?? []);
  const dernier = (messages ?? []).at(-1);
  const attendReponse = dernier && dernier.par_admin !== admin;
  const lancementVide = !svc.fiche.some(([k]) => rempli(reponses[k]));
  const onglets = [
    ['avancement', 'Projet'],
    ['messages', 'Messages', messages?.length, attendReponse],
    ['fichiers', 'Fichiers', fichiers?.length, admin && (retours ?? []).some((r) => !r.traite)],
    ...(admin ? [] : [['lancement', 'Fiche de préparation', null, lancementVide && e?.numero >= 3]]),
  ];
  // Réglages et fiche de préparation : accessibles, mais hors des onglets pour garder l'écran simple.
  const actif = onglets.some(([k]) => k === onglet) || (admin && ['reglages', 'lancement'].includes(onglet)) ? onglet : 'avancement';
  const nomClient = p.clients?.nom || p.clients?.email || 'Client';

  app.innerHTML = `
    <a class="back" href="#/projets">← Projets</a>
    <p class="label rule" style="margin-top:28px">${esc(svc.label)}${admin ? ` · <a href="#/client/${p.client_id}">${esc(nomClient)}${p.clients?.entreprise ? ' · ' + esc(p.clients.entreprise) : ''}</a>` : ''}</p>
    <div class="hello"><h1 class="h-l">${esc(p.titre)}</h1>
      ${admin ? `<span class="liens-sec"><a class="btn-txt" href="#/projet/${id}/lancement">Réponses du client${lancementVide ? '' : ' ✓'}</a><a class="btn-txt" href="#/projet/${id}/reglages">Réglages</a></span>` : ''}</div>

    ${(fichiers ?? []).some((f) => f.livrable) ? `<a class="livraison-banniere" href="#/projet/${id}/livraison">
      <span><span class="label bronze">Livraison</span><strong>${esc(svc.livraison)}</strong></span><span class="go">${admin ? 'Voir la page client' : 'Découvrir'} →</span></a>` : ''}

    <nav class="tabs" role="tablist">
      ${onglets.map(([k, t, n, alerte]) => `<button role="tab" data-tab="${k}" aria-selected="${k === actif}">${t}${
        alerte ? '<span class="count alert">!</span>' : n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}
    </nav>

    <section class="panel" data-panel="avancement">
      <div class="focus">
        <span class="big">${e?.numero ?? ''}</span>
        <div>
          <p class="label red">${e?.statut === 'termine' ? 'Projet terminé' : 'Étape en cours'}</p>
          <h3>${esc(info.titre)}</h3>
          <p>${esc(info.texte)}</p>
          ${e?.date_prevue ? `<p class="quand">Prévu le ${esc(jourFr(e.date_prevue))}</p>` : ''}
          ${admin ? (() => {
            const fini = e?.statut === 'termine';
            let n = (e?.numero ?? 0) + 1;
            while ((svc.masquer ?? []).includes(n)) n++;
            const suivante = fini ? null : n <= 7 ? svc.etapes[n]?.titre : 'Projet terminé';
            return fini ? '<p class="quand">Toutes les étapes sont terminées.</p>' : `<div class="form-foot avancer">
              <button class="btn" data-aller="${n}">${n <= 7 ? `Étape suivante : ${esc(suivante)} →` : 'Terminer le projet ✓'}</button>
              <span class="muted small">Le client est prévenu par e-mail.</span></div>`;
          })() : ''}
          ${admin ? '' : `<p class="attendu">De votre côté : ${esc(info.attendu)}${info.onglet ? ` <a href="#/projet/${id}/${info.onglet}">C’est ici →</a>` : ''}</p>`}
        </div>
      </div>
      ${!admin && p.prochain_rdv && p.prochain_rdv >= aujourdhui() ? `<div class="rdv"><p class="label bronze">Prochain rendez-vous</p>
        <p class="h-m">${esc(p.prochain_rdv_note || 'On se retrouve')} <em>${esc(jourFr(p.prochain_rdv))}</em></p></div>` : ''}
      ${admin ? `<div class="actions-rapides">
        <a class="btn btn-line" href="#/projet/${id}/fichiers" data-ouvrir="ajout">+ Déposer une version</a>
        <a class="btn btn-line" href="#/projet/${id}/messages">Écrire au client</a>
        <a class="btn-txt" href="#/client/${p.client_id}" data-libre>Fiche de ${esc(nomClient)}</a>
      </div>
      <p class="muted small" style="margin-top:18px">Préparation côté client : ${coches.size} / ${svc.guide.length} point${svc.guide.length > 1 ? 's' : ''} coché${coches.size > 1 ? 's' : ''}${lancementVide ? ', fiche pas encore remplie' : ', fiche remplie'}.</p>` : ''}
    </section>

    ${admin ? `<section class="panel" data-panel="reglages">
      <a class="btn-txt" href="#/projet/${id}/avancement">← Retour au projet</a>
      <div class="section" style="margin-top:18px">
        <p class="label">Étapes et dates · « Passer ici » déplace le projet</p>
        ${parcoursHtml(p, admin)}
      </div>
      <div class="section"><p class="label">Mot de l’équipe pour la livraison</p>
        <form id="mot-livraison"><textarea name="mot" rows="3" placeholder="Merci pour votre confiance…">${esc(p.mot_livraison)}</textarea>
        <div class="form-foot"><button class="btn btn-line btn-sm">Enregistrer</button><span class="msg" role="status"></span></div></form>
        <p class="muted small" style="margin-top:6px">Affiché en haut de la page de livraison. Cochez « Livrable final » sur les fichiers à livrer dans l’onglet Fichiers.</p></div>
      <div class="section"><p class="label">Prochain rendez-vous</p>
        <form id="prochain-rdv" class="grid" style="max-width:640px">
          <div><label for="rdv_date">Date</label><input id="rdv_date" type="date" name="prochain_rdv" value="${esc(p.prochain_rdv)}"></div>
          <div><label for="rdv_note">Quoi</label><input id="rdv_note" name="prochain_rdv_note" value="${esc(p.prochain_rdv_note)}" placeholder="Prochain tournage Frame²"></div>
          <div class="full form-foot"><button class="btn btn-line btn-sm">Enregistrer</button><span class="msg" role="status"></span></div></form>
        <p class="muted small" style="margin-top:6px">Le client le voit dans son espace et reçoit un rappel 7 jours avant (vous aussi).</p></div>
      <div class="section"><p class="label">Prestation</p>
        <select id="changer-type" style="max-width:420px">${Object.entries(SERVICES).map(([k, v]) =>
          `<option value="${k}" ${k === (p.type || 'site_web') ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        <p class="muted small" style="margin-top:6px">Change les noms des étapes et la fiche de préparation de ce projet.</p></div>
    </section>` : ''}

    <section class="panel" data-panel="messages">
      <p class="panel-intro">${admin ? 'Échanges avec le client sur ce projet.' : 'Posez vos questions et donnez vos retours ici. Réponse sous 24 h ouvrées.'}</p>
      <div class="fil">${(messages ?? []).map((m) => {
        const moi = m.par_admin === admin;
        return `<div class="bulle ${moi ? 'moi' : ''}">
          <div class="qui"><b>${moi ? 'Vous' : m.par_admin ? 'Mackerprod' : esc(nomClient)}</b> · ${dateFr(m.created_at)}</div>
          <div>${esc(m.contenu).replace(/\n/g, '<br>')}</div>
        </div>`;
      }).join('') || '<p class="empty">Aucun message pour l’instant.</p>'}
      </div>
      <form id="nouveau-message" class="ecrire">
        <label for="msg_contenu">Votre message</label>
        <textarea id="msg_contenu" name="contenu" rows="3" required placeholder="${admin ? 'Écrire au client…' : 'Écrire à Mackerprod…'}"></textarea>
        <div class="form-foot"><button class="btn">Envoyer</button></div>
      </form>
    </section>

    <section class="panel" data-panel="fichiers">
      <p class="panel-intro">Vos fichiers restent où vous les avez mis (Google Drive, WeTransfer, Vimeo…). Ici, on garde seulement les liens pour tout retrouver. Les vidéos et maquettes se commentent directement : à la seconde près pour une vidéo, à l’endroit précis pour une maquette.</p>
      <ul class="fichiers">${(fichiers ?? []).map((f) => `
        <li><span class="tag">${CATEGORIES[f.categorie]}</span>
          ${f.categorie === 'script' ? `<a href="#/projet/${id}/revue/${f.id}">${esc(f.titre)}</a>` : `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titre)}</a>`}
          <span class="meta">${f.par_admin ? 'Mackerprod' : esc(nomClient)} · ${dateFr(f.created_at)}</span>
          ${REVUE.includes(f.categorie) ? (() => { const ri = revueInfo(f.id); return `
            ${ri.valide ? '<span class="badge ok">Validé</span>' : ''}
            ${admin && ri.aTraiter ? `<span class="badge red">${ri.aTraiter} retour${ri.aTraiter > 1 ? 's' : ''} à traiter</span>` : ''}
            <a class="btn btn-line btn-sm" href="#/projet/${id}/revue/${f.id}">${admin ? 'Voir les retours' : ri.valide ? 'Revoir' : 'Commenter et valider'} →</a>`; })() : ''}
          ${admin ? `<label class="check livrable"><input type="checkbox" data-livrable="${f.id}" ${f.livrable ? 'checked' : ''}> Livrable final</label>` : f.livrable ? '<span class="badge ok">Livré</span>' : ''}
          ${admin || f.ajoute_par === profil.id ? `<button class="btn-txt" data-suppr="${f.id}">Retirer</button>` : ''}
        </li>`).join('') || '<li><span class="empty">Aucun fichier pour l’instant.</span></li>'}
      </ul>
      <details class="ajout" ${fichiers?.length ? '' : 'open'}>
        <summary class="btn btn-line">+ Ajouter un lien</summary>
        <form id="nouveau-fichier" class="card grid">
          <div><label for="f_titre">Nom du fichier</label><input id="f_titre" name="titre" required placeholder="Photos de l’équipe"></div>
          <div><label for="f_cat">Type</label><select id="f_cat" name="categorie">
            ${Object.entries(CATEGORIES).filter(([v]) => v !== 'script').map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
          <div class="full"><label for="f_url">Lien<span class="hint">Vidéo : Vimeo, YouTube non répertorié ou MP4. Photos : lien de la galerie Pic-Time. Même nom qu’une vidéo existante = nouvelle version (V2, V3…).</span></label>
            <input id="f_url" name="url" required placeholder="https://vimeo.com/…, code d’intégration Vimeo ou https://….pic-time.com/…"></div>
          <div class="full form-foot"><button class="btn">Ajouter</button></div>
        </form>
      </details>
      ${admin ? `<details class="ajout">
        <summary class="btn btn-line">+ Écrire un script à faire valider</summary>
        <form id="nouveau-script" class="card">
          <label for="s_titre">Titre</label><input id="s_titre" name="titre" required placeholder="Script · film de présentation">
          <label for="s_texte">Script<span class="hint">Séparez les passages par une ligne vide : le client peut commenter chaque passage.</span></label>
          <textarea id="s_texte" name="texte" rows="12" required></textarea>
          <div class="form-foot"><button class="btn">Déposer et prévenir le client</button></div>
        </form>
      </details>` : ''}
    </section>

    <section class="panel" data-panel="lancement">
      ${admin ? `<p style="margin-bottom:14px"><a class="btn-txt" href="#/projet/${id}/avancement">← Retour au projet</a></p>` : ''}
      <p class="panel-intro">Tout ce qu’il nous faut pour préparer ${svc.cible === 'particulier' ? 'ce grand moment' : 'le tournage'}. Vos coordonnées sont déjà enregistrées, inutile de les redonner. Vous pouvez remplir en plusieurs fois.</p>
      ${formHtml('lancement', svc.fiche, reponses)}
    </section>`;

  // Onglets
  const montrer = (k) => {
    app.querySelectorAll('[data-panel]').forEach((s) => (s.hidden = s.dataset.panel !== k));
    app.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === k));
    history.replaceState(null, '', `#/projet/${id}/${k}`);
    if (k === 'messages') { const f = app.querySelector('.fil'); f.scrollTop = f.scrollHeight; }
  };
  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => montrer(b.dataset.tab)));
  app.querySelectorAll(`a[href^="#/projet/${id}/"]`).forEach((a) => (a.onclick = (ev) => {
    ev.preventDefault(); montrer(a.getAttribute('href').split('/').pop());
    if (a.dataset.ouvrir) { const d = app.querySelector('[data-panel="fichiers"] details.ajout'); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }
  }));
  montrer(actif);

  const motForm = document.getElementById('mot-livraison');
  if (motForm) bindForm('mot-livraison', ({ mot }) => sb.from('projets').update({ mot_livraison: mot || null }).eq('id', id));
  if (document.getElementById('prochain-rdv')) bindForm('prochain-rdv', ({ prochain_rdv, prochain_rdv_note }) =>
    sb.from('projets').update({ prochain_rdv: prochain_rdv || null, prochain_rdv_note: prochain_rdv_note || null }).eq('id', id));
  app.querySelectorAll('[data-livrable]').forEach((c) => (c.onchange = async () => {
    const { error } = await sb.from('fichiers').update({ livrable: c.checked }).eq('id', c.dataset.livrable);
    if (error) return alert(messageErreur(error));
    renderProjet(id, 'fichiers');
  }));
  const changerType = document.getElementById('changer-type');
  if (changerType) changerType.onchange = async () => {
    const { error } = await sb.from('projets').update({ type: changerType.value }).eq('id', id);
    if (error) return alert(messageErreur(error));
    renderProjet(id, 'avancement');
  };
  if (admin && document.getElementById('exporter')) document.getElementById('exporter').onclick = () => exporterDossier(p.client_id);
  if (admin) {
    app.querySelectorAll('[data-aller]').forEach((b) => (b.onclick = async (ev) => {
      ev.preventDefault();
      const { error } = await sb.rpc('aller_etape', { p: id, n: Number(b.dataset.aller) });
      if (error) return alert(messageErreur(error));
      renderProjet(id, 'avancement');
    }));
  }

  bindForm('lancement', (maj) => { Object.assign(reponses, maj); return sb.from('lancements').upsert({ projet_id: id, reponses }); });

  app.querySelectorAll('[data-guide]').forEach((c) => (c.onchange = async () => {
    const i = Number(c.dataset.guide);
    c.checked ? coches.add(i) : coches.delete(i);
    reponses._guide = [...coches].sort((a, b) => a - b);
    document.getElementById('guide-compte').textContent = `${coches.size} / ${svc.guide.length} prêt${coches.size > 1 ? 's' : ''}`;
    const { error } = await sb.from('lancements').upsert({ projet_id: id, reponses });
    if (error) alert(messageErreur(error));
  }));

  app.querySelectorAll('.date-etape').forEach((d) => (d.onchange = async () => {
    const { error } = await sb.from('etapes').update({ date_prevue: d.value || null })
      .eq('projet_id', d.dataset.projet).eq('numero', Number(d.dataset.numero));
    if (error) alert(messageErreur(error));
  }));

  document.getElementById('nouveau-message').onsubmit = async (ev) => {
    ev.preventDefault();
    const contenu = ev.target.contenu.value.trim();
    if (!contenu) return;
    const { error } = await sb.from('messages').insert({ projet_id: id, contenu });
    if (error) return alert(messageErreur(error));
    renderProjet(id, 'messages');
  };

  zoneVimeo(document.getElementById('f_url'), () => document.getElementById('f_titre').value.trim());
  document.getElementById('nouveau-fichier').onsubmit = async (ev) => {
    ev.preventDefault();
    const { titre, url: brut, categorie } = Object.fromEntries(new FormData(ev.target));
    const url = nettoyerLien(brut);
    const { error } = await sb.from('fichiers').insert({ projet_id: id, titre, url, categorie });
    if (error) return alert(messageErreur(error));
    renderProjet(id, 'fichiers');
  };
  const formScript = document.getElementById('nouveau-script');
  if (formScript) formScript.onsubmit = async (ev) => {
    ev.preventDefault();
    const { titre, texte } = Object.fromEntries(new FormData(formScript));
    const { data: nv, error } = await sb.from('fichiers').insert({ projet_id: id, titre: titre.trim(), texte, categorie: 'script' }).select('id').single();
    if (error) return alert(messageErreur(error));
    location.hash = `#/projet/${id}/revue/${nv.id}`;
  };

  app.querySelectorAll('[data-suppr]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Retirer ce lien ? Le fichier lui-même n’est pas supprimé.')) return;
    const { error } = await sb.from('fichiers').delete().eq('id', b.dataset.suppr);
    if (error) return alert(messageErreur(error));
    renderProjet(id, 'fichiers');
  }));
}

// Refonte : page projet côté client ---------------------------------------------
// Une seule page qui se lit de haut en bas : où en est le projet, ce qu'on attend de vous,
// ce qui est à regarder et valider, le carnet de ce qui s'est passé, puis les échanges.

const estPicTime = (u) => /(^|\.|\/\/)pic-time\.com/i.test(u ?? '');
const KIND = { video: 'Vidéo', maquette: 'Maquette', script: 'Script' };

// Les versions successives d'un même livrable partagent catégorie et titre : V1, V2…
function groupesVersions(fichiers) {
  const g = new Map();
  for (const f of [...(fichiers ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    if (!REVUE.includes(f.categorie) || !f.par_admin) continue;
    const k = `${f.categorie}|${f.titre.trim().toLowerCase()}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(f);
  }
  return [...g.values()];
}

// Étapes que le client voit : après la signature, sans celles qui ne concernent pas sa prestation.
function etapesVisibles(p) {
  const svc = serviceDe(p);
  return tri(p.etapes).filter((e) => e.numero >= 2 && !(svc.masquer ?? []).includes(e.numero));
}

function etatPiece(f, retours) {
  const rs = (retours ?? []).filter((r) => r.fichier_id === f.id);
  const val = rs.find((r) => r.type === 'validation');
  if (val) return { cls: 'ok', txt: `Validé le ${jourCourt(val.created_at.slice(0, 10))}` };
  const miens = rs.filter((r) => r.type === 'commentaire' && !r.par_admin);
  if (miens.length && miens.some((r) => !r.traite)) return { cls: 'line', txt: `${miens.length} retour${miens.length > 1 ? 's' : ''} envoyé${miens.length > 1 ? 's' : ''} · on s’en occupe` };
  if (miens.length) return { cls: 'line', txt: 'Retours pris en compte' };
  return { cls: 'red', txt: f.categorie === 'script' ? 'À lire et valider' : 'À regarder et valider', aFaire: true };
}

async function renderProjetClient(id, ancre) {
  const [{ data: p, error }, { data: lancement }, { data: fichiers }, { data: messages }, { data: retours }] = await Promise.all([
    sb.from('projets').select('*, etapes(*)').eq('id', id).single(),
    sb.from('lancements').select('*').eq('projet_id', id).maybeSingle(),
    sb.from('fichiers').select('*').eq('projet_id', id).order('created_at'),
    sb.from('messages').select('*').eq('projet_id', id).order('created_at'),
    sb.from('retours').select('fichier_id, type, traite, par_admin, created_at').eq('projet_id', id),
  ]);
  if (error) return showError(error);

  const svc = serviceDe(p);
  const visibles = etapesVisibles(p);
  const e = etapeCourante(p.etapes);
  const fini = e?.statut === 'termine' && e.numero === 7;
  const courante = visibles.find((v) => v.numero >= (e?.numero ?? 2)) ?? visibles.at(-1);
  const rang = visibles.indexOf(courante);
  const info = svc.etapes[courante?.numero] ?? {};

  const groupes = groupesVersions(fichiers);
  const pieces = groupes.map((vs) => ({ f: vs.at(-1), v: vs.length, etat: etatPiece(vs.at(-1), retours) }));
  const aValider = pieces.filter((x) => x.etat.aFaire);
  const livres = (fichiers ?? []).filter((f) => f.livrable);
  const galeries = (fichiers ?? []).filter((f) => f.categorie === 'photo' && estPicTime(f.url));
  const autres = (fichiers ?? []).filter((f) => !REVUE.includes(f.categorie) && !galeries.includes(f));
  const reponses = { ...(lancement?.reponses ?? {}) };
  const coches = new Set(reponses._guide ?? []);
  const ficheUtile = !(svc.masquer ?? []).includes(3);
  const ficheVide = !svc.fiche.some(([k]) => rempli(reponses[k]));
  // La préparation ne s'affiche qu'avant et pendant le tournage (étapes 2 à 4).
  const prepUtile = !fini && (e?.numero ?? 1) >= 2 && (e?.numero ?? 1) <= 4;

  // Action principale : ce qui débloque le projet maintenant.
  const cta = aValider[0]
    ? { href: `#/projet/${id}/revue/${aValider[0].f.id}`, txt: aValider[0].f.categorie === 'script' ? 'Lire le script' : `Regarder la V${aValider[0].v}` }
    : livres.length ? { href: `#/projet/${id}/livraison`, txt: 'Découvrir votre livraison' }
    : prepUtile && ficheUtile && ficheVide && (e?.numero ?? 0) >= 3 ? { href: '#preparation', txt: 'Remplir la fiche' } : null;
  const titreEtat = fini ? 'Projet terminé, merci !'
    : aValider[0] ? (aValider[0].f.categorie === 'script' ? 'Votre script vous attend' : 'Une nouvelle version vous attend')
    : livres.length ? svc.livraison : info.titre;

  // Carnet du projet : tout ce qui a bougé, du plus récent au plus ancien.
  const vNum = new Map(groupes.flatMap((vs) => vs.map((f, i) => [f.id, i + 1])));
  const carnet = [
    ...tri(p.etapes).filter((x) => x.statut !== 'a_venir' && visibles.includes(x)).map((x) => ({
      d: x.updated_at, txt: x.statut === 'termine' ? `<b>${esc(svc.etapes[x.numero]?.titre)}</b> : étape terminée.` : `<b>${esc(svc.etapes[x.numero]?.titre)}</b> : c’est parti.` })),
    ...(fichiers ?? []).filter((f) => f.par_admin).map((f) => ({
      d: f.created_at, txt: REVUE.includes(f.categorie)
        ? `<b>Mackerprod</b> a déposé ${f.categorie === 'script' ? 'le script' : f.categorie === 'video' ? 'la vidéo' : 'la maquette'} « ${esc(f.titre)} » (V${vNum.get(f.id)}).`
        : `<b>Mackerprod</b> a ajouté « ${esc(f.titre)} ».` })),
    ...(retours ?? []).filter((r) => r.type === 'validation').map((r) => {
      const f = (fichiers ?? []).find((x) => x.id === r.fichier_id);
      return { d: r.created_at, txt: `<b>Vous</b> avez validé « ${esc(f?.titre ?? '')} »${vNum.get(r.fichier_id) ? ` (V${vNum.get(r.fichier_id)})` : ''}.` };
    }),
  ].filter((x) => x.d).sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 14);

  const dernier = (messages ?? []).at(-1);

  app.innerHTML = `
    <a class="back" href="#/projets">← Mes projets</a>

    <section class="pj-tete">
      <p class="label red">${esc(svc.label)}${fini ? '' : ` · Étape ${rang + 1} sur ${visibles.length}<span class="mobile-seul"> · ${esc(svc.etapes[visibles[rang]?.numero]?.titre ?? '')}</span>`}</p>
      <h1 class="h-l">${esc(p.titre)}</h1>
      <div class="pj-etat">
        <div>
          <p class="pj-etat-t">${esc(titreEtat)}</p>
          <p class="pj-etat-d">${esc(fini ? 'Toutes les étapes sont terminées. On reste là pour la suite.' : info.texte)}</p>
          ${!fini && courante?.date_prevue && courante.statut !== 'termine' ? `<p class="quand">Prévu le ${esc(jourFr(courante.date_prevue))}</p>` : ''}
          ${!fini && !cta && info.attendu ? `<p class="attendu">De votre côté : ${esc(info.attendu)}</p>` : ''}
        </div>
        ${cta ? `<a class="btn" href="${cta.href}">${esc(cta.txt)} →</a>` : ''}
      </div>
    </section>

    <ol class="suivi" aria-label="Avancement du projet">${visibles.map((x, i) => {
      const cls = fini || i < rang ? 'done' : i === rang ? 'now' : 'next';
      const quand = cls === 'done' ? jourCourt(x.updated_at.slice(0, 10)) : x.date_prevue ? `Prévu le ${jourCourt(x.date_prevue)}` : cls === 'now' ? 'En cours' : '';
      return `<li class="${cls}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(svc.etapes[x.numero]?.titre)}</span><span class="d">${esc(quand)}</span></li>`;
    }).join('')}</ol>

    ${livres.length ? `<a class="livraison-banniere" href="#/projet/${id}/livraison">
      <span><span class="label bronze">Livraison</span><strong>${esc(svc.livraison)}</strong></span><span class="go">Découvrir →</span></a>` : ''}

    ${pieces.length ? `<section class="section">
      <p class="label">À regarder, lire et valider</p>
      <div class="pieces">${pieces.map(({ f, v, etat }) => `
        <a class="piece ${etat.aFaire ? 'a-faire' : ''}" href="#/projet/${id}/revue/${f.id}">
          <span class="piece-kind">${KIND[f.categorie]}${f.categorie === 'script' && v === 1 ? '' : ` · V${v}`}</span>
          <strong class="piece-titre">${esc(f.titre)}</strong>
          <span class="badge ${etat.cls}">${esc(etat.txt)}</span>
          <span class="go">${f.categorie === 'script' ? 'Lire' : f.categorie === 'video' ? 'Regarder' : 'Voir'} →</span>
        </a>`).join('')}</div>
    </section>` : ''}

    ${prepUtile ? `    <section class="section" id="preparation">
      <div>
        <p class="label">${svc.cible === 'particulier' ? 'Pour que tout soit parfait' : 'Pour le jour du tournage'}</p>
        <p class="panel-intro">Cochez au fur et à mesure : on voit votre avancement de notre côté aussi.</p>
        <ul class="guide">${svc.guide.map((g, i) => `<li><label class="check"><input type="checkbox" data-guide="${i}" ${coches.has(i) ? 'checked' : ''}> <span>${esc(g)}</span></label></li>`).join('')}</ul>
        <p class="muted small" id="guide-compte">${coches.size} / ${svc.guide.length} prêt${coches.size > 1 ? 's' : ''}</p>
        ${ficheUtile ? `<details class="fiche-prep" ${ficheVide && (e?.numero ?? 0) >= 3 ? 'open' : ''}>
          <summary class="btn btn-line btn-sm">${ficheVide ? 'Remplir la fiche de préparation' : 'Revoir la fiche de préparation'}</summary>
          <p class="panel-intro" style="margin-top:16px">Vos coordonnées sont déjà enregistrées, inutile de les redonner. Vous pouvez remplir en plusieurs fois.</p>
          ${formHtml('lancement', svc.fiche, reponses)}
        </details>` : ''}
      </div>
    </section>` : ''}

    <nav class="tabs" role="tablist">
      <button role="tab" data-tab="messages">Échanges${(messages ?? []).length ? `<span class="count">${messages.length}</span>` : ''}</button>
      <button role="tab" data-tab="fichiers">Fichiers & galeries${galeries.length + autres.length ? `<span class="count">${galeries.length + autres.length}</span>` : ''}</button>
      <button role="tab" data-tab="carnet">Historique</button>
    </nav>
    <div class="panel" data-panel="messages">
      <section id="messages">
        <p class="panel-intro">Une question, une idée ? Écrivez-nous ici. Réponse sous 24 h ouvrées.</p>
        <div class="fil">${(messages ?? []).map((m) => `<div class="bulle ${m.par_admin ? '' : 'moi'}">
            <div class="qui"><b>${m.par_admin ? 'Mackerprod' : 'Vous'}</b> · ${dateFr(m.created_at)}</div>
            <div>${esc(m.contenu).replace(/\n/g, '<br>')}</div></div>`).join('') || '<p class="empty">Aucun message pour l’instant.</p>'}
        </div>
        ${dernier && !dernier.par_admin ? '<p class="muted small" style="margin-top:8px">Message reçu. On vous répond sous 24 h ouvrées.</p>' : ''}
        <form id="nouveau-message" class="ecrire">
          <label for="msg_contenu">Votre message</label>
          <textarea id="msg_contenu" name="contenu" rows="3" required placeholder="Écrire à Mackerprod…"></textarea>
          <div class="form-foot"><button class="btn">Envoyer</button></div>
        </form>
      </section>
    </div>
    <div class="panel" data-panel="fichiers">
    ${galeries.length ? `<section class="section">
      <p class="label">Vos galeries photo</p>
      <div class="galeries">${galeries.map((g) => `
        <a class="galerie-carte" href="${esc(g.url)}" target="_blank" rel="noopener">
          <span class="label bronze">Galerie privée</span>
          <strong>${esc(g.titre)}</strong>
          <span class="sub">Regardez, mettez vos préférées en favori et téléchargez en haute définition.</span>
          <span class="go">Ouvrir la galerie ↗</span>
        </a>`).join('')}</div>
    </section>` : ''}
    <section id="fichiers">
      <p class="panel-intro">Vos fichiers restent où vous les avez mis (Google Drive, WeTransfer…). Ici, on garde les liens pour tout retrouver.</p>
      <ul class="fichiers">${autres.map((f) => `
        <li><span class="tag">${CATEGORIES[f.categorie]}</span>
          <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titre)}</a>
          <span class="meta">${f.par_admin ? 'Mackerprod' : 'Vous'} · ${dateFr(f.created_at)}</span>
          ${f.livrable ? '<span class="badge ok">Livré</span>' : ''}
          ${f.ajoute_par === profil.id ? `<button class="btn-txt" data-suppr="${f.id}">Retirer</button>` : ''}
        </li>`).join('') || '<li><span class="empty">Aucun fichier pour l’instant.</span></li>'}
      </ul>
      <details class="ajout">
        <summary class="btn btn-line btn-sm">+ Nous envoyer un lien</summary>
        <form id="nouveau-fichier" class="card grid">
          <div><label for="f_titre">Nom du fichier</label><input id="f_titre" name="titre" required placeholder="Logo, photos du bien…"></div>
          <div><label for="f_cat">Type</label><select id="f_cat" name="categorie">
            ${['photo', 'video', 'document', 'autre'].map((v) => `<option value="${v}">${CATEGORIES[v]}</option>`).join('')}</select></div>
          <div class="full"><label for="f_url">Lien</label><input id="f_url" name="url" type="url" required placeholder="https://drive.google.com/…"></div>
          <div class="full form-foot"><button class="btn">Envoyer</button></div>
        </form>
      </details>
    </section>
    </div>
    <div class="panel" data-panel="carnet">
      <section id="carnet">
        <p class="panel-intro">Tout ce qui avance, au moment où ça avance.</p>
        <ol class="carnet">${carnet.map((x) => `<li><time>${dateFr(x.d)}</time><span>${x.txt}</span></li>`).join('')
          || '<li><span class="empty">Le carnet se remplit dès le lancement.</span></li>'}</ol>
      </section>
    </div>`;

  // Onglets du bas : échanges, fichiers & galeries, historique.
  const montrer = (k) => {
    app.querySelectorAll('[data-panel]').forEach((x) => (x.hidden = x.dataset.panel !== k));
    app.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === k));
  };
  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => montrer(b.dataset.tab)));
  montrer(ancre === 'fichiers' || ancre === 'carnet' ? ancre : 'messages');
  const cible = { messages: 'messages', fichiers: 'fichiers', lancement: 'preparation', avancement: null }[ancre];
  if (cible) setTimeout(() => document.getElementById(cible)?.scrollIntoView({ block: 'start' }), 0);
  const fil = app.querySelector('.fil'); if (fil) fil.scrollTop = fil.scrollHeight;
  app.querySelectorAll('a[href="#preparation"]').forEach((a) => (a.onclick = (ev) => {
    ev.preventDefault(); const d = app.querySelector('.fiche-prep'); if (d) d.open = true;
    document.getElementById('preparation').scrollIntoView({ behavior: 'smooth' });
  }));

  if (document.getElementById('lancement')) bindForm('lancement', (maj) => { Object.assign(reponses, maj); return sb.from('lancements').upsert({ projet_id: id, reponses }); });
  app.querySelectorAll('[data-guide]').forEach((c) => (c.onchange = async () => {
    const i = Number(c.dataset.guide);
    c.checked ? coches.add(i) : coches.delete(i);
    reponses._guide = [...coches].sort((a, b) => a - b);
    document.getElementById('guide-compte').textContent = `${coches.size} / ${svc.guide.length} prêt${coches.size > 1 ? 's' : ''}`;
    const { error } = await sb.from('lancements').upsert({ projet_id: id, reponses });
    if (error) alert(messageErreur(error));
  }));
  document.getElementById('nouveau-message').onsubmit = async (ev) => {
    ev.preventDefault();
    const contenu = ev.target.contenu.value.trim();
    if (!contenu) return;
    const { error } = await sb.from('messages').insert({ projet_id: id, contenu });
    if (error) return alert(messageErreur(error));
    renderProjetClient(id, 'messages');
  };
  document.getElementById('nouveau-fichier').onsubmit = async (ev) => {
    ev.preventDefault();
    const { titre, url: brut, categorie } = Object.fromEntries(new FormData(ev.target));
    const url = nettoyerLien(brut);
    const { error } = await sb.from('fichiers').insert({ projet_id: id, titre, url, categorie });
    if (error) return alert(messageErreur(error));
    renderProjetClient(id, 'fichiers');
  };
  app.querySelectorAll('[data-suppr]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Retirer ce lien ? Le fichier lui-même n’est pas supprimé.')) return;
    const { error } = await sb.from('fichiers').delete().eq('id', b.dataset.suppr);
    if (error) return alert(messageErreur(error));
    renderProjetClient(id, 'fichiers');
  }));
}

// Tableau de bord admin (Maxence) : priorités, atelier par étape, clients ----------

const PHASES = [
  ['Avant le tournage', [1, 2, 3]],
  ['Tournage', [4]],
  ['Post-production', [5]],
  ['Livré · suivi', [6, 7]],
];
const initiales = (c) => (c.nom || c.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
const optionsServices = () => Object.entries(SERVICES).map(([k, v]) => `<option value="${k}">${esc(v.label)} (${v.cible === 'pro' ? 'pro' : 'particulier'})</option>`).join('');

// Les 30 prochains jours : rendez-vous fixés et anniversaires de mariage.
function aVenir(lignes) {
  const auj = aujourdhui();
  const dans30 = new Date(Date.now() + 30 * 864e5).toLocaleDateString('sv-SE');
  return lignes.flatMap(({ c, p }) => {
    const out = [];
    if (p.prochain_rdv && p.prochain_rdv >= auj && p.prochain_rdv <= dans30) out.push({ d: p.prochain_rdv, c, p, quoi: p.prochain_rdv_note || 'Rendez-vous' });
    for (const e of p.etapes ?? []) {
      if (e.date_prevue && e.statut !== 'termine' && e.date_prevue >= auj && e.date_prevue <= dans30) {
        out.push({ d: e.date_prevue, c, p, quoi: serviceDe(p).etapes[e.numero]?.titre });
      }
    }
    const jourJ = p.type === 'mariage' && (p.etapes ?? []).find((e) => e.numero === 4)?.date_prevue;
    if (jourJ && jourJ < auj) {
      let an = Number(auj.slice(0, 4));
      let d = `${an}${jourJ.slice(4)}`;
      if (d < auj) d = `${++an}${jourJ.slice(4)}`;
      const n = an - Number(jourJ.slice(0, 4));
      if (d <= dans30) out.push({ d, c, p, quoi: `${n} an${n > 1 ? 's' : ''} de mariage` });
    }
    return out;
  }).sort((a, b) => a.d.localeCompare(b.d));
}

// Données communes aux écrans de l'équipe : clients, projets, et ce qui attend une action.
async function chargerAtelier() {
  const [{ data: clients, error }, { data: messages }, { data: retours }, { data: demandes }, { data: fichiers }] = await Promise.all([
    sb.from('clients').select('*, projets(*, etapes(*))').order('created_at', { ascending: false }),
    sb.from('messages').select('projet_id, par_admin, created_at').order('created_at', { ascending: false }).limit(500),
    sb.from('retours').select('projet_id, fichier_id, type, traite, par_admin, created_at'),
    sb.from('demandes').select('*, clients(nom, email), projets(titre)').eq('traitee', false).order('created_at'),
    sb.from('fichiers').select('id, projet_id, titre, categorie, url, livrable, par_admin, created_at'),
  ]);
  if (error) throw error;
  const lignes = (clients ?? []).flatMap((c) => (c.projets ?? []).map((p) => {
    const m = dernierMessage(messages, p.id);
    const e = etapeCourante(p.etapes);
    return { c, p, e, m, aRepondre: m && !m.par_admin,
      retours: (retours ?? []).filter((r) => r.projet_id === p.id && !r.traite && !r.par_admin && r.type === 'commentaire').length,
      valide: (retours ?? []).some((r) => r.projet_id === p.id && r.type === 'validation' && !(fichiers ?? []).some((f) => f.projet_id === p.id && f.livrable)),
      livre: (fichiers ?? []).some((f) => f.projet_id === p.id && f.livrable),
      fini: e?.statut === 'termine' && e.numero === 7 };
  }));
  const nom = (c) => c.nom || c.email;
  const prio = [
    ...lignes.filter((l) => l.retours).map((l) => ({ dot: '', tag: 'Retours', href: `#/projet/${l.p.id}/fichiers`, action: 'Voir',
      titre: `${nom(l.c)} a laissé ${l.retours} retour${l.retours > 1 ? 's' : ''}`, sub: l.p.titre })),
    ...lignes.filter((l) => l.aRepondre).map((l) => ({ dot: '', tag: 'Message', href: `#/projet/${l.p.id}/messages`, action: 'Répondre',
      titre: `${nom(l.c)} attend une réponse`, sub: `${l.p.titre} · ${dateFr(l.m.created_at)}` })),
    ...lignes.filter((l) => l.valide).map((l) => ({ dot: 'g', tag: 'Validé', href: `#/projet/${l.p.id}/fichiers`, action: 'Livrer',
      titre: `${nom(l.c)} a validé une version`, sub: `${l.p.titre} · prêt à livrer` })),
    ...(demandes ?? []).map((x) => ({ dot: 'b', tag: DEMANDES[x.type], demande: x.id, href: `#/client/${x.client_id}`,
      titre: `${x.clients?.nom || x.clients?.email}${x.type === 'parrainage' ? ` recommande ${x.details?.nom || 'un proche'}` : x.type === 'nouveau_projet' ? ' a un nouveau projet' : ' souhaite ' + (x.type === 'album' ? 'un album' : 'des tirages')}`,
      sub: [x.details?.contact, x.details?.message].filter(Boolean).join(' · ') || dateFr(x.created_at) })),
  ];
  return { clients: clients ?? [], lignes, prio, fichiers: fichiers ?? [], avenir: aVenir(lignes) };
}

// Étiquette d'une vignette côté équipe : ce qui demande une action d'abord.
function etatVignette(l) {
  if (l.retours) return { st: `${l.retours} retour${l.retours > 1 ? 's' : ''}`, stCls: 'r' };
  if (l.aRepondre) return { st: 'À répondre', stCls: 'r' };
  if (l.valide) return { st: 'Validé', stCls: 'ok' };
  if (l.fini) return { st: 'Terminé', stCls: 'ok' };
  if (l.livre) return { st: 'Livré', stCls: 'ok' };
  return { st: serviceDe(l.p).etapes[l.e?.numero]?.titre ?? '', stCls: '' };
}
function vignetteEquipe(l, fichiers) {
  const date = l.e?.date_prevue && l.e.statut !== 'termine' ? l.e.date_prevue : l.p.prochain_rdv;
  return vignetteProjet(l.p, fichiers, { ...etatVignette(l), tc: date ? jourCourt(date) : '', sous: `${l.c.nom || l.c.email} · ${serviceDe(l.p).label}` });
}
const urgence = (l) => (l.retours || l.aRepondre ? 0 : l.valide ? 1 : l.fini ? 9 : 2);

// Aujourd'hui (équipe) : ce qui attend une action, la semaine, les projets en production.
async function renderAdmin() {
  const { lignes, prio, fichiers, avenir } = await chargerAtelier();
  pastille('jour', prio.length);
  const heure = new Date().getHours();
  const auj = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const enCours = lignes.filter((l) => !l.fini).sort((a, b) => urgence(a) - urgence(b));
  const semaine = avenir.filter((a) => a.d <= new Date(Date.now() + 7 * 864e5).toLocaleDateString('sv-SE'));

  app.innerHTML = `
    <div class="hello">
      <div><p class="label">${esc(auj.charAt(0).toUpperCase() + auj.slice(1))}</p>
        <h1 class="h-l">${heure < 18 ? 'Bonjour' : 'Bonsoir'}</h1></div>
      <a class="btn" href="#/clients">+ Nouveau client</a>
    </div>
    ${semaine.length ? `<p class="semaine"><span class="label">Cette semaine</span>${semaine.map((a) =>
      `<a class="puce" href="#/projet/${a.p.id}"><b>${esc(jourCourt(a.d))}</b> ${esc(a.quoi)} · ${esc(a.c.nom || a.c.email)}</a>`).join('')}</p>` : ''}

      <section class="liste" style="margin-top:22px">
        <div class="liste-titre"><span class="label ${prio.length ? 'red' : ''}">À faire</span></div>
        ${prio.length ? prio.map((t) => `<div class="ligne"><span class="dot ${t.dot}"></span>
            <a href="${t.href}" style="text-decoration:none;min-width:0"><b>${esc(t.titre)}</b><small>${esc(t.sub)}</small></a>
            <span class="badge ${t.dot === 'g' ? 'ok' : t.dot === 'b' ? 'line' : 'red'}">${esc(t.tag)}</span>
            ${t.demande ? `<button class="btn btn-line btn-sm" data-traitee="${t.demande}">Traitée</button>` : `<a class="btn btn-sm" href="${t.href}">${t.action}</a>`}</div>`).join('')
          : '<div class="ligne vide"><span class="dot g"></span><span><b>Tout est à jour</b><small>Aucun message, retour ou demande en attente.</small></span></div>'}
      </section>

    <p class="muted small" style="margin-top:16px">${enCours.length} projet${enCours.length > 1 ? 's' : ''} en cours · <a href="#/projets">Voir les projets</a></p>`;

  app.querySelectorAll('[data-traitee]').forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from('demandes').update({ traitee: true }).eq('id', b.dataset.traitee);
    if (error) return alert(messageErreur(error));
    renderAdmin();
  }));
}

// Projets (équipe) : toutes les vignettes, filtrées par phase.
const FILTRES = [['tous', 'Tous', () => true], ['avant', 'Avant le tournage', (l) => l.e?.numero <= 3], ['tournage', 'Tournage', (l) => l.e?.numero === 4],
  ['montage', 'Montage', (l) => l.e?.numero === 5], ['livre', 'Livrés', (l) => l.e?.numero >= 6]];
let filtreProjets = 'tous';
async function renderProjetsAdmin() {
  const { lignes, prio, fichiers } = await chargerAtelier();
  pastille('jour', prio.length);
  const tri2 = [...lignes].sort((a, b) => urgence(a) - urgence(b));
  const dessiner = () => {
    const f = FILTRES.find((x) => x[0] === filtreProjets) ?? FILTRES[0];
    app.querySelector('.filtres').innerHTML = FILTRES.map(([k, t, fn]) => `<button type="button" data-f="${k}" aria-pressed="${k === f[0]}">${t}<i>${lignes.filter(fn).length}</i></button>`).join('');
    app.querySelector('.vignettes').innerHTML = tri2.filter(f[2]).map((l) => vignetteEquipe(l, fichiers)).join('') || '<p class="empty">Aucun projet ici.</p>';
    app.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filtreProjets = b.dataset.f; dessiner(); }));
  };
  app.innerHTML = `
    <div class="hello"><div><p class="label">Projets</p><h1 class="h-l">Tous les projets</h1></div>
      <a class="btn" href="#/clients">+ Nouveau client</a></div>
    <section class="section"><div class="filtres"></div><div class="vignettes"></div></section>`;
  dessiner();
}

// Clients (équipe) : la liste, et l'ajout d'un nouveau client.
async function renderClientsAdmin() {
  const { clients, lignes, prio } = await chargerAtelier();
  pastille('jour', prio.length);
  app.innerHTML = `
    <div class="hello"><div><p class="label">Clients</p><h1 class="h-l">${clients.length} client${clients.length > 1 ? 's' : ''}</h1></div></div>
    <details class="ajout section" ${clients.length ? '' : 'open'}>
      <summary class="btn">+ Nouveau client</summary>
      <form id="nouveau" class="card">
        <p class="panel-intro">Le client se connecte ensuite avec cet e-mail : son compte est relié automatiquement.</p>
        <div class="grid">
          <div><label for="n_email">E-mail du client</label><input id="n_email" name="email" type="email" required></div>
          <div><label for="n_nom">Nom et prénom</label><input id="n_nom" name="nom"></div>
          <div><label for="n_ent">Entreprise</label><input id="n_ent" name="entreprise"></div>
          <div><label for="n_projet">Premier projet</label><input id="n_projet" name="projet" placeholder="Film d’entreprise 2027"></div>
          <div class="full"><label for="n_type">Prestation</label><select id="n_type" name="type">${optionsServices()}</select></div>
        </div>
        <div class="form-foot"><button class="btn">Créer le client</button></div>
      </form>
    </details>
    <section class="section liste">${clients.map((c) => {
      const ls = lignes.filter((l) => l.c.id === c.id);
      const alerte = ls.some((l) => l.aRepondre || l.retours);
      return `<a class="ligne cl" href="#/client/${c.id}"><span class="av">${esc(initiales(c))}</span>
        <span><b>${esc(c.nom || c.email)}</b>${c.entreprise ? `<small>${esc(c.entreprise)}</small>` : ''}</span>
        ${alerte ? '<span class="badge red">À traiter</span>' : '<i></i>'}<span class="muted">→</span></a>`;
    }).join('') || '<div class="ligne vide"><span class="dot n"></span><span><small>Aucun client pour l’instant.</small></span></div>'}</section>`;

  document.getElementById('nouveau').onsubmit = async (ev) => {
    ev.preventDefault();
    const { email, nom, entreprise, projet, type } = Object.fromEntries(new FormData(ev.target));
    const { data: c, error } = await sb.from('clients').insert({ email, nom, entreprise }).select().single();
    if (error) return alert(messageErreur(error));
    if (projet) await sb.from('projets').insert({ client_id: c.id, titre: projet, type });
    location.hash = `#/client/${c.id}`;
  };
}

// Fiche client (admin) : tout sur une personne, en une page ------------------------
const estFini = (p) => (p.etapes ?? []).some((e) => e.numero === 7 && e.statut === 'termine');

async function renderFicheClient(id) {
  const [{ data: c, error }, { data: note }, { data: demandes }] = await Promise.all([
    sb.from('clients').select('*, projets(*, etapes(*))').eq('id', id).single(),
    sb.from('notes_internes').select('*').eq('client_id', id).maybeSingle(),
    sb.from('demandes').select('*').eq('client_id', id).order('created_at', { ascending: false }),
  ]);
  if (error) return showError(error);
  const projets = c.projets ?? [];
  const ids = projets.map((p) => p.id);
  const titre = (pid) => projets.find((p) => p.id === pid)?.titre ?? '';
  const [{ data: messages }, { data: fichiers }, { data: retours }] = ids.length ? await Promise.all([
    sb.from('messages').select('*').in('projet_id', ids).order('created_at', { ascending: false }).limit(30),
    sb.from('fichiers').select('*').in('projet_id', ids).order('created_at', { ascending: false }).limit(30),
    sb.from('retours').select('*').in('projet_id', ids).order('created_at', { ascending: false }).limit(30),
  ]) : [{}, {}, {}];

  // Historique des projets : une ligne par fait marquant, le plus récent en haut.
  const fil = [
    ...projets.map((p) => ({ d: p.created_at, txt: 'Projet ouvert', href: `#/projet/${p.id}`, pid: p.id })),
    ...projets.flatMap((p) => (p.etapes ?? []).filter((e) => e.statut === 'termine' && e.updated_at && !(serviceDe(p).masquer ?? []).includes(e.numero)).map((e) => ({
      d: e.updated_at, txt: `${serviceDe(p).etapes[e.numero]?.titre ?? 'Étape'} : étape terminée`, href: `#/projet/${p.id}`, pid: p.id }))),
    ...groupesVersions((fichiers ?? []).slice().reverse()).flatMap((vs) => vs.filter((f) => f.par_admin).map((f) => ({
      d: f.created_at, txt: `${f.titre} · V${vs.indexOf(f) + 1} envoyée`, href: `#/projet/${f.projet_id}/revue/${f.id}`, pid: f.projet_id }))),
    ...(retours ?? []).filter((r) => r.type === 'validation').map((r) => ({ d: r.created_at,
      txt: `${(fichiers ?? []).find((f) => f.id === r.fichier_id)?.titre ?? 'Version'} : validé par le client`, href: `#/projet/${r.projet_id}/revue/${r.fichier_id}`, pid: r.projet_id })),
    ...(fichiers ?? []).filter((f) => f.livrable).slice(0, 1).map((f) => ({ d: f.created_at, txt: 'Livraison envoyée', href: `#/projet/${f.projet_id}/livraison`, pid: f.projet_id })),
  ].sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 25);
  const depuis = new Date(c.created_at || Date.now()).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  app.innerHTML = `
    <a class="back" href="#/clients">← Clients</a>
    <div class="fiche-tete">
      <i class="monogramme">${esc(initiales(c))}</i>
      <div>
        <p class="label rule">Client depuis ${esc(depuis)}</p>
        <h1 class="h-l">${esc(c.nom || c.email)}</h1>
        ${c.entreprise ? `<p class="h-m sous">${esc(c.entreprise)}</p>` : ''}
        <div class="actions">
          <a class="btn btn-sm" href="mailto:${esc(c.email)}">Écrire un e-mail</a>
          ${c.telephone ? `<a class="btn btn-line btn-sm" href="tel:${esc(c.telephone.replace(/\s/g, ''))}">Appeler · ${esc(c.telephone)}</a>` : ''}
          <button class="btn btn-line btn-sm" id="exporter">Exporter le dossier</button>
          <button class="btn btn-line btn-sm" id="voir-client">Voir comme le client</button>
        </div>
      </div>
    </div>

    <div class="fiche-grille">
      <div>
        <section class="section">
          <p class="label">Projets en cours</p>
          <div class="projets">${projets.filter((p) => !estFini(p)).map((p) => `
            <a class="projet" href="#/projet/${p.id}">
              <div class="projet-top"><div><p class="label bronze">${esc(serviceDe(p).label)}</p><h2 class="h-m">${esc(p.titre)}</h2></div><span class="ouvrir">Ouvrir →</span></div>
              <div class="parcours-court">${parcoursHtml(p)}</div>
              <p class="etat-court">${(() => { const e = etapeCourante(p.etapes); return e ? `${e.statut === 'termine' ? 'Terminé' : 'En cours'} : ${esc(serviceDe(p).etapes[e.numero]?.titre ?? '')}` : ''; })()}</p>
            </a>`).join('') || '<p class="empty">Aucun projet en cours.</p>'}
          </div>
          ${projets.some(estFini) ? `<p class="muted small" style="margin-top:12px">Terminés : ${projets.filter(estFini).map((p) => `<a href="#/projet/${p.id}">${esc(p.titre)}</a>`).join(' · ')}</p>` : ''}
          <details class="ajout">
            <summary class="btn btn-line btn-sm">+ Nouveau projet</summary>
            <form id="ajout-projet" class="card grid">
              <div><label for="p_titre">Nom du projet</label><input id="p_titre" name="titre" required></div>
              <div><label for="p_type">Prestation</label><select id="p_type" name="type">${optionsServices()}</select></div>
              <div class="full form-foot"><button class="btn">Créer le projet</button></div>
            </form>
          </details>
        </section>

        <section class="section">
          <p class="label">Historique des projets</p>
          <ol class="histo">${fil.slice(0, 8).map((h) => `<li><time>${esc(jourCourt(h.d.slice(0, 10)))}</time>
            <a href="${h.href}">${projets.length > 1 ? `<span class="muted">${esc(titre(h.pid))} · </span>` : ''}${esc(h.txt)}</a></li>`).join('')
            || '<li><span class="empty">Rien pour l’instant.</span></li>'}</ol>
        </section>
      </div>

      <aside>
        <section class="section">
          <details class="replie">
          <summary><span class="label">Note interne</span><span class="muted small">${esc((note?.texte || 'Aucune note').split('\n')[0].slice(0, 70))}</span></summary>
          <form id="note-interne" class="card note">
            <textarea name="texte" rows="6" placeholder="Ce qu’il faut savoir : ses préférences, comment il nous a connus, le prénom de ses enfants…">${esc(note?.texte)}</textarea>
            <div class="form-foot"><button class="btn btn-line btn-sm">Enregistrer</button><span class="msg" role="status"></span></div>
            <p class="muted small">Visible uniquement par l’équipe Mackerprod.</p>
          </form>
          </details>
        </section>
        ${(demandes ?? []).length ? `<section class="section">
          <p class="label">Demandes</p>
          <ul class="demandes">${demandes.map((x) => `<li><span class="tag">${DEMANDES[x.type]}</span>
            <span>${esc(x.details?.nom || x.details?.message || '')}</span>
            ${x.traitee ? '<span class="badge ok">Traitée</span>' : `<button class="btn btn-line btn-sm" data-traitee="${x.id}">Traitée</button>`}</li>`).join('')}</ul>
        </section>` : ''}
        <section class="section">
          <details class="replie">
          <summary><span class="label">Coordonnées</span><span class="muted small">${esc(c.email)}${c.telephone ? ' · ' + esc(c.telephone) : ''}</span></summary>
          ${formHtml('fiche', CHAMPS_FICHE, c, ['notes', 'Remarques du client'])}
          </details>
        </section>
      </aside>
    </div>`;

  document.getElementById('exporter').onclick = () => exporterDossier(id);
  document.getElementById('voir-client').onclick = () => changerVue(id, '#/');
  bindForm('note-interne', ({ texte }) => sb.from('notes_internes').upsert({ client_id: id, texte }));
  bindForm('fiche', (maj) => sb.from('clients').update(maj).eq('id', id));
  app.querySelectorAll('[data-traitee]').forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from('demandes').update({ traitee: true }).eq('id', b.dataset.traitee);
    if (error) return alert(messageErreur(error));
    renderFicheClient(id);
  }));
  document.getElementById('ajout-projet').onsubmit = async (ev) => {
    ev.preventDefault();
    const { data: p, error } = await sb.from('projets').insert({ client_id: id, ...Object.fromEntries(new FormData(ev.target)) }).select().single();
    if (error) return alert(messageErreur(error));
    location.hash = `#/projet/${p.id}`;
  };
}

// Revue d'une vidéo ou d'une maquette (étape 3) ---------------------------------
// Vidéo : chaque retour est attaché à un instant. Maquette (image) : à une position.

const fmtTemps = (s) => {
  if (s == null) return '';
  const t = Math.floor(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(sec).padStart(2, '0');
};
const lireTemps = (txt) => {
  const p = String(txt ?? '').trim().split(':').map(Number);
  if (!p.length || p.some((n) => Number.isNaN(n))) return null;
  return p.reduce((acc, n) => acc * 60 + n, 0);
};
const chargerScript = (src) => new Promise((ok, ko) => {
  if (document.querySelector(`script[data-ok][src="${src}"]`)) return ok();
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => { s.dataset.ok = '1'; ok(); };
  s.onerror = () => { s.remove(); ko(new Error('script')); };
  document.head.appendChild(s);
});

// Traduit les erreurs Supabase les plus courantes en phrase claire.
function messageErreur(error) {
  const m = error?.message ?? '';
  if (/clients_email_key/.test(m)) return 'Un client existe déjà avec cet e-mail. Ouvrez-le dans la liste des clients.';
  if (error?.code === '23505' || /duplicate key/.test(m)) return 'Cet élément existe déjà.';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(m)) return 'Vous n’avez pas l’autorisation de faire cette action.';
  const attente = m.match(/request this after (\d+) seconds?/i);
  if (attente) return `Un lien vient déjà d’être envoyé. Patientez ${attente[1]} secondes avant d’en redemander un.`;
  if (/rate limit/i.test(m)) return 'Trop de demandes d’affilée. Patientez quelques minutes avant de réessayer.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  return m || 'Une erreur est survenue.';
}

// Reconnaît le type de lien pour choisir le bon lecteur.
function analyserLien(url, categorie) {
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/))) return { type: 'youtube', id: m[1] };
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([\da-f]+))?/))) return { type: 'vimeo', id: m[1], hash: m[2] || url.match(/[?&]h=([\da-f]+)/)?.[1] };
  if ((m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/))) return { type: categorie === 'video' ? 'drive' : 'drive-image', id: m[1] };
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return { type: 'video' };
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)) return { type: 'image' };
  return { type: 'lien' };
}

// Un code d'intégration collé (<iframe src="…">) devient son lien.
const nettoyerLien = (v) => (v || '').match(/src=["']([^"']+)["']/)?.[1] || (v || '').trim();
// Mot de passe Vimeo rangé dans le lien (#mdp=…) quand la formule n'a pas « Non répertorié ».
const mdpVideo = (url) => (url || '').match(/#mdp=([\w-]+)/)?.[1] ?? null;

// Équipe : glisser un fichier vidéo l'envoie directement sur le compte Vimeo de Mackerprod
// (via la fonction vimeo-upload), puis remplit le champ « Lien ».
function zoneVimeo(champ, nomDuFichier) {
  if (!champ) return;
  const z = document.createElement('div');
  z.className = 'depot-vimeo';
  z.innerHTML = `<input type="file" accept="video/*" hidden>
    <p><b>Glissez la vidéo ici</b> ou <button type="button" class="btn-txt">choisissez un fichier</button> : elle part directement sur Vimeo.</p>
    <div class="prog" hidden><div></div></div>
    <p class="etat small" aria-live="polite"></p>`;
  champ.before(z);
  const entree = z.querySelector('input'), etat = z.querySelector('.etat'), prog = z.querySelector('.prog');
  const envoi = champ.form.querySelector('.form-foot .btn');
  z.querySelector('button').onclick = () => entree.click();
  ['dragenter', 'dragover'].forEach((t) => z.addEventListener(t, (e) => { e.preventDefault(); z.classList.add('survol'); }));
  ['dragleave', 'drop'].forEach((t) => z.addEventListener(t, () => z.classList.remove('survol')));
  z.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) envoyer(e.dataTransfer.files[0]); });
  entree.onchange = () => entree.files[0] && envoyer(entree.files[0]);
  const garde = (e) => { e.preventDefault(); e.returnValue = ''; };

  async function envoyer(f) {
    if (!f.type.startsWith('video/')) { etat.textContent = 'Ce fichier n’est pas une vidéo.'; return; }
    envoi.disabled = true;
    etat.textContent = 'Préparation de l’envoi…';
    const { data, error } = await sb.functions.invoke('vimeo-upload', {
      body: { nom: nomDuFichier() || f.name.replace(/\.[^.]+$/, ''), taille: f.size },
    });
    if (error || data?.error) {
      envoi.disabled = false;
      etat.textContent = data?.error || (await error?.context?.json?.().catch(() => null))?.error || 'Envoi impossible pour l’instant.';
      return;
    }
    try {
      const { Upload } = await import('https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/+esm');
      prog.hidden = false;
      window.addEventListener('beforeunload', garde);
      await new Promise((ok, ko) => new Upload(f, {
        uploadUrl: data.upload_link,
        retryDelays: [0, 3000, 10000, 30000],
        onProgress: (fait, total) => {
          const pc = Math.floor((100 * fait) / total);
          prog.firstElementChild.style.width = pc + '%';
          etat.textContent = `Envoi sur Vimeo… ${pc} % · gardez cette page ouverte`;
        },
        onSuccess: ok, onError: ko,
      }).start());
    } catch {
      etat.textContent = 'L’envoi a été interrompu. Réessayez.';
      envoi.disabled = false;
      return;
    } finally {
      window.removeEventListener('beforeunload', garde);
    }
    champ.value = data.lien + (data.mdp ? `#mdp=${data.mdp}` : '');
    const cat = champ.form.querySelector('[name="categorie"]');
    if (cat) cat.value = 'video';
    etat.textContent = 'Envoyée sur Vimeo ✓ Validez le formulaire. Vimeo met quelques minutes à préparer la lecture.';
    envoi.disabled = false;
  }
}

// Lecteur commun : temps(), duree(), enPause() renvoient des promesses ; seek(s, lire) s'y place.
// YouTube, Vimeo et MP4 n'affichent pas leurs propres contrôles : la barre Mackerprod les remplace
// (pour Vimeo, il faut un abonnement payant ; sans lui, Vimeo garde ses boutons).
async function monterLecteur(zone, lien, url, { barre = false } = {}) {
  const vide = { getTime: async () => null, duree: async () => null, enPause: async () => true, seek: () => {}, play: () => {}, pause: () => {}, auto: false };
  if (lien.type === 'youtube') {
    zone.innerHTML = '<div class="ratio"><div class="yt-cible"></div></div>';
    await chargerScript('https://www.youtube.com/iframe_api');
    await new Promise((ok) => (window.YT?.Player ? ok() : (window.onYouTubeIframeAPIReady = ok)));
    const player = await new Promise((ok) => {
      const pl = new YT.Player(zone.querySelector('.yt-cible'), {
        videoId: lien.id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, ...(barre ? { controls: 0, disablekb: 1, iv_load_policy: 3 } : {}) },
        // À la fin, retour au début : pas de suggestions YouTube.
        events: { onReady: () => ok(pl), onStateChange: (e) => { if (e.data === 0) { pl.seekTo(0, true); pl.pauseVideo(); } } },
      });
    });
    return {
      getTime: async () => player.getCurrentTime(), duree: async () => player.getDuration(),
      enPause: async () => player.getPlayerState() !== 1,
      seek: (s, lire = true) => { player.seekTo(s, true); if (lire) player.playVideo(); },
      play: () => player.playVideo(), pause: () => player.pauseVideo(), auto: true, propre: barre,
    };
  }
  if (lien.type === 'vimeo') {
    zone.innerHTML = `<div class="ratio"><iframe src="https://player.vimeo.com/video/${lien.id}?${lien.hash ? `h=${lien.hash}&` : ''}title=0&byline=0&portrait=0&color=941e28${barre ? '&controls=0&keyboard=0' : ''}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    // Si le pilote Vimeo ne charge pas (réseau, bloqueur), on garde le lecteur Vimeo avec ses propres boutons.
    try {
      await chargerScript('https://player.vimeo.com/api/player.js');
      if (!window.Vimeo?.Player) throw new Error('Vimeo');
    } catch {
      const fr = zone.querySelector('iframe');
      fr.src = fr.src.replace('&controls=0&keyboard=0', '');
      return { ...vide, propre: false };
    }
    const player = new Vimeo.Player(zone.querySelector('iframe'));
    // À la fin, on revient au début : Vimeo n'affiche pas ses suggestions d'autres vidéos.
    player.on('ended', () => player.setCurrentTime(0).then(() => player.pause()).catch(() => {}));
    return {
      getTime: () => player.getCurrentTime(), duree: () => player.getDuration(), enPause: () => player.getPaused(),
      seek: (s, lire = true) => { player.setCurrentTime(s); if (lire) player.play(); },
      play: () => player.play(), pause: () => player.pause(), auto: true, propre: barre,
      plein: () => player.requestFullscreen().catch(() => {}),
    };
  }
  if (lien.type === 'video') {
    zone.innerHTML = `<div class="ratio"><video ${barre ? 'playsinline' : 'controls'} preload="metadata" src="${esc(url)}"></video></div>`;
    const v = zone.querySelector('video');
    if (barre) v.onclick = () => (v.paused ? v.play() : v.pause());
    return {
      getTime: async () => v.currentTime, duree: async () => (Number.isFinite(v.duration) ? v.duration : null), enPause: async () => v.paused,
      seek: (s, lire = true) => { v.currentTime = s; if (lire) v.play(); },
      play: () => v.play(), pause: () => v.pause(), auto: true, propre: barre,
      plein: () => (v.requestFullscreen ? v.requestFullscreen() : v.webkitEnterFullscreen?.()),
    };
  }
  if (lien.type === 'drive') {
    zone.innerHTML = `<div class="ratio"><iframe src="https://drive.google.com/file/d/${lien.id}/preview" allow="autoplay" allowfullscreen></iframe></div>
      <p class="muted small" style="margin-top:8px">Vidéo Google Drive : notez l’instant affiché dans le lecteur (ex. 1:24) avec votre commentaire.</p>`;
    return vide;
  }
  if (lien.type === 'image' || lien.type === 'drive-image') {
    const src = lien.type === 'image' ? url : `https://drive.google.com/thumbnail?id=${lien.id}&sz=w2000`;
    zone.innerHTML = `<div class="maquette"><img src="${esc(src)}" alt="Maquette"><div class="pins"></div></div>
      <p class="muted small" style="margin-top:8px">Cliquez sur la maquette à l’endroit que vous voulez commenter.</p>`;
    return vide;
  }
  zone.innerHTML = `<div class="notice">Ce lien ne peut pas être affiché ici.
    <a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir dans un nouvel onglet →</a>
    Vous pouvez quand même laisser vos commentaires à côté.</div>`;
  return vide;
}

// Salle de projection : une version d'une vidéo, d'une maquette ou d'un script.
// Vidéo : chaque retour est accroché à un instant. Maquette : à un endroit. Script : à un passage (pos_y = n° du paragraphe).
async function renderRevue(projetId, fichierId) {
  const admin = estAdmin();
  const [{ data: f, error }, { data: retours }, { data: p }] = await Promise.all([
    sb.from('fichiers').select('*').eq('id', fichierId).single(),
    sb.from('retours').select('*').eq('fichier_id', fichierId).order('created_at'),
    sb.from('projets').select('titre, type, clients(nom, email)').eq('id', projetId).single(),
  ]);
  if (error) return showError(error);
  const { data: soeurs } = await sb.from('fichiers').select('id, titre, created_at, note_version')
    .eq('projet_id', projetId).eq('categorie', f.categorie).eq('titre', f.titre).order('created_at');
  const versions = soeurs?.length ? soeurs : [f];
  const vNum = versions.findIndex((x) => x.id === f.id) + 1;
  const derniere = versions.at(-1).id === f.id;

  const estScript = f.categorie === 'script';
  const lien = estScript ? { type: 'script' } : analyserLien(f.url, f.categorie);
  const estVideo = ['youtube', 'vimeo', 'video', 'drive'].includes(lien.type) || (f.categorie === 'video' && lien.type === 'lien');
  const estImage = lien.type === 'image' || lien.type === 'drive-image';
  const commentaires = (retours ?? []).filter((r) => r.type === 'commentaire').sort((a, b) =>
    estVideo ? (a.temps_sec ?? 1e9) - (b.temps_sec ?? 1e9)
    : estScript ? (a.pos_y ?? 1e9) - (b.pos_y ?? 1e9) || new Date(a.created_at) - new Date(b.created_at)
    : new Date(a.created_at) - new Date(b.created_at));
  const validation = (retours ?? []).find((r) => r.type === 'validation');
  const aTraiter = commentaires.filter((r) => !r.traite).length;
  const nomClient = p?.clients?.nom || p?.clients?.email || 'Client';
  const numeros = new Map((retours ?? []).filter((r) => r.pos_x != null).map((r, i) => [r.id, i + 1]));
  const paragraphes = estScript ? f.texte.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) : [];
  const parCommentes = new Set(commentaires.filter((r) => r.pos_y != null && estScript).map((r) => r.pos_y));
  const svc = serviceDe(p);
  const quoi = estScript ? 'Relecture du script' : estVideo ? 'Salle de projection' : 'Revue de maquette';

  app.innerHTML = `
    <a class="back" href="#/projet/${projetId}">← ${esc(p?.titre ?? 'Projet')}</a>
    <header class="salle-tete">
      <div>
        <p class="label red">${quoi} · ${esc(svc.label)}</p>
        <h1 class="h-l">${esc(f.titre)}</h1>
      </div>
      <nav class="versions" aria-label="Versions">${versions.map((x, i) => `<a href="#/projet/${projetId}/revue/${x.id}" ${x.id === f.id ? 'aria-current="true"' : ''}>V${i + 1}<small>${jourCourt(x.created_at.slice(0, 10))}</small></a>`).join('')}</nav>
    </header>
    ${f.note_version ? `<p class="note-version"><span class="label bronze">Ce qui a changé dans la V${vNum}</span>${esc(f.note_version)}</p>` : ''}
    ${!derniere ? `<p class="notice" style="margin-top:20px">Vous regardez une ancienne version. <a href="#/projet/${projetId}/revue/${versions.at(-1).id}">Voir la V${versions.length} →</a></p>` : ''}
    ${validation ? `<div class="valide">✓ V${vNum} validée par ${admin ? esc(nomClient) : 'vous'} le ${dateFr(validation.created_at)}</div>` : ''}
    ${admin ? `<p class="lead">${aTraiter ? `<strong>${aTraiter}</strong> retour${aTraiter > 1 ? 's' : ''} à traiter.` : 'Tous les retours sont traités.'}</p>`
      : !validation && derniere ? `<p class="lead">${estScript ? 'Lisez le script. Cliquez sur un passage pour le commenter, ou écrivez vos idées dans la fenêtre à côté. Quand tout vous va, validez.'
        : estVideo ? 'Lancez la vidéo. Quand quelque chose ne vous plaît pas, cliquez sur « Commenter » : votre remarque reste accrochée à cet instant précis.'
        : 'Cliquez à l’endroit voulu sur la maquette puis écrivez votre remarque.'}</p>` : ''}

    <div class="salle">
      <div class="salle-media">
        ${estScript ? `<article class="script-page">
            <p class="script-entete"><span>${esc(p?.titre ?? '')}</span><span>Script · V${vNum}</span></p>
            ${paragraphes.map((x, i) => `<p class="par ${parCommentes.has(i) ? 'commente' : ''}" data-par="${i}" tabindex="0" title="Commenter ce passage">${esc(x).replace(/\n/g, '<br>')}</p>`).join('')}
          </article>`
        : `<div id="media"><p class="muted">Chargement du lecteur…</p></div>
          ${estVideo ? `<div class="barre" id="barre" hidden>
            <div class="scrub" id="scrub" role="slider" aria-label="Position dans la vidéo" tabindex="0"><div class="rail"></div><div class="fill"></div><div class="pins-t"></div><div class="tete"></div></div>
            <div class="ctrl">
              <button class="ico" id="pp" type="button" aria-label="Lecture"><span class="tri"></span></button>
              <span class="tc"><span id="cur">0:00</span> / <span id="dur">–:––</span></span>
              <span class="sp"></span>
              <button class="ico" id="plein" type="button" aria-label="Plein écran" title="Plein écran"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
              <button class="btn btn-sm" id="commenter" type="button">Commenter à <span id="cur2">0:00</span></button>
            </div>
          </div>` : ''}
          ${estVideo && mdpVideo(f.url) ? `<p class="mdp-video">Si Vimeo le demande, mot de passe de la vidéo : <b>${esc(mdpVideo(f.url))}</b></p>` : ''}`}
      </div>

      <aside class="salle-side">
        <form id="retour" class="composer">
          <p class="composer-at" id="ancre">${estVideo ? 'À <b id="ancre-t">0:00</b>' : estScript ? 'Remarque générale' : estImage ? 'Aucun endroit choisi : cliquez sur la maquette.' : 'Votre remarque'}</p>
          ${estVideo ? '<input type="hidden" name="temps" id="r_temps">' : ''}
          <label for="r_contenu" class="sr">Votre remarque</label>
          <textarea id="r_contenu" name="contenu" rows="${estScript ? 5 : 3}" required placeholder="${estScript ? 'Vos idées, ce que vous voulez dire autrement, ce qui manque…' : estVideo ? 'Ex. : ce plan est trop court, on ne voit pas la cheminée.' : 'Ex. : logo plus grand, changer cette photo…'}"></textarea>
          <div class="composer-pied">
            ${estScript ? '<button type="button" class="btn-txt" id="general" hidden>Remarque générale</button>' : ''}
            ${estVideo ? '<button type="button" class="btn-txt" id="sans-temps">Sans instant précis</button>' : ''}
            <button class="btn btn-sm">Ajouter</button>
          </div>
        </form>

        <div class="retours-tete"><p class="label">Retours</p><span class="label">${commentaires.length}</span></div>
        <ul class="retours">${commentaires.map((r) => `
          <li class="${r.traite ? 'fait' : ''} ${r.par_admin ? 'par-equipe' : ''}">
            ${r.temps_sec != null ? `<button class="chip" data-seek="${r.temps_sec}" title="Aller à cet instant">${fmtTemps(r.temps_sec)}</button>`
              : estScript && r.pos_y != null ? `<button class="chip" data-par-go="${r.pos_y}" title="Voir le passage">§ ${r.pos_y + 1}</button>`
              : numeros.has(r.id) ? `<span class="chip pin-n">${numeros.get(r.id)}</span>` : '<span class="chip vide">·</span>'}
            <div class="corps">
              <div class="qui"><b>${r.par_admin ? 'Mackerprod' : admin ? esc(nomClient) : 'Vous'}</b> · ${dateFr(r.created_at)}</div>
              <div>${esc(r.contenu).replace(/\n/g, '<br>')}</div>
              <div class="etat">
                ${admin ? `<label class="check"><input type="checkbox" data-traite="${r.id}" ${r.traite ? 'checked' : ''}> Traité</label>`
                  : r.par_admin ? '' : `<span class="badge ${r.traite ? 'ok' : 'line'}">${r.traite ? 'Pris en compte' : 'Envoyé'}</span>`}
                ${!admin && !r.traite && r.auteur === profil.id ? `<button class="btn-txt" data-suppr="${r.id}">Retirer</button>` : ''}
              </div>
            </div>
          </li>`).join('') || '<li class="vide"><span class="empty">Aucun retour pour l’instant.</span></li>'}
        </ul>

        ${!admin && !validation && derniere ? `<div class="valider">
          <p>${commentaires.some((r) => !r.par_admin) ? 'Vos retours partent directement à l’équipe. On vous prépare la version suivante sous 24 h ouvrées.' : 'Tout vous convient ? Validez cette version : l’équipe passe à la suite.'}</p>
          <button class="btn btn-line" id="valider">Tout me va, je valide la V${vNum}</button>
        </div>` : ''}

        ${admin && derniere ? `<details class="nouvelle-version">
          <summary class="btn btn-line btn-sm">+ Déposer la V${versions.length + 1}</summary>
          <form id="form-version" class="card">
            ${estScript
              ? `<label for="v_texte">Script</label><textarea id="v_texte" name="texte" rows="12" required>${esc(f.texte)}</textarea>`
              : `<label for="v_url">Lien de la nouvelle version</label><input id="v_url" name="url" required placeholder="Lien ou code d’intégration Vimeo">`}
            <label for="v_note">Ce qui a changé<span class="hint">Le client le lit en haut de la nouvelle version</span></label>
            <textarea id="v_note" name="note_version" rows="2" placeholder="Plan de la cuisine rallongé, musique baissée…"></textarea>
            <div class="form-foot"><button class="btn btn-sm">Déposer et prévenir le client</button></div>
          </form>
        </details>` : ''}
      </aside>
    </div>`;

  const form = document.getElementById('retour');
  const zoneAncre = document.getElementById('ancre');
  let lecteur = null, pos = null, par = null;

  if (!estScript) lecteur = await monterLecteur(document.getElementById('media'), lien, f.url, { barre: estVideo });

  // Barre de lecture Mackerprod : progression, épingles des retours, « Commenter à… ».
  const barre = document.getElementById('barre');
  const champTemps = document.getElementById('r_temps');
  let tempsFixe = null;
  if (barre && lecteur?.auto) {
    barre.hidden = false;
    const scrub = document.getElementById('scrub');
    let dur = null;
    const majPins = () => {
      if (!dur) return;
      scrub.querySelector('.pins-t').innerHTML = commentaires.filter((r) => r.temps_sec != null).map((r) =>
        `<button type="button" class="pin-t ${r.par_admin ? 'par-equipe' : ''} ${r.traite ? 'fait' : ''}" style="left:${Math.min(100, (100 * r.temps_sec) / dur)}%" data-seek="${r.temps_sec}" title="${fmtTemps(r.temps_sec)} · ${esc(r.contenu.slice(0, 80))}"></button>`).join('');
      bindSeek(scrub);
    };
    const tick = async () => {
      if (!document.body.contains(barre)) return clearInterval(minuteur);
      const [t, d, pause] = await Promise.all([lecteur.getTime(), dur ? dur : lecteur.duree(), lecteur.enPause()]);
      if (d && !dur) { dur = d; document.getElementById('dur').textContent = fmtTemps(d); majPins(); }
      const pc = dur ? Math.min(100, (100 * (t ?? 0)) / dur) : 0;
      scrub.querySelector('.fill').style.width = pc + '%';
      scrub.querySelector('.tete').style.left = pc + '%';
      document.getElementById('cur').textContent = document.getElementById('cur2').textContent = fmtTemps(t ?? 0);
      if (tempsFixe == null && champTemps) document.getElementById('ancre-t').textContent = fmtTemps(t ?? 0);
      document.getElementById('pp').innerHTML = pause ? '<span class="tri"></span>' : '<span class="pause"></span>';
      document.getElementById('pp').setAttribute('aria-label', pause ? 'Lecture' : 'Pause');
    };
    const minuteur = setInterval(tick, 250);
    document.getElementById('pp').onclick = async () => ((await lecteur.enPause()) ? lecteur.play() : lecteur.pause());
    if (!lecteur.propre) document.getElementById('pp').hidden = true;
    // Plein écran : la vidéo et la barre Mackerprod ensemble ; sur iPhone, plein écran du lecteur seul.
    const scene = document.querySelector('.salle-media');
    const pleinBtn = document.getElementById('plein');
    if (!scene.requestFullscreen && !scene.webkitRequestFullscreen && !lecteur.plein) pleinBtn.hidden = true;
    pleinBtn.onclick = () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      if (scene.requestFullscreen) return scene.requestFullscreen().catch(() => lecteur.plein?.());
      if (scene.webkitRequestFullscreen) return scene.webkitRequestFullscreen();
      lecteur.plein?.();
    };
    const aller = (ev) => {
      if (!dur || ev.target.closest('.pin-t')) return;
      const r = scrub.getBoundingClientRect();
      lecteur.seek(Math.max(0, Math.min(dur, ((ev.clientX - r.left) / r.width) * dur)), false);
    };
    scrub.addEventListener('pointerdown', (ev) => { aller(ev); scrub.setPointerCapture(ev.pointerId); scrub.onpointermove = aller; });
    scrub.addEventListener('pointerup', () => (scrub.onpointermove = null));
    scrub.addEventListener('keydown', async (ev) => {
      const t = (await lecteur.getTime()) ?? 0;
      if (ev.key === 'ArrowRight') lecteur.seek(t + 5, false);
      if (ev.key === 'ArrowLeft') lecteur.seek(Math.max(0, t - 5), false);
    });
    // Fige l'instant courant de la vidéo (et remet l'affichage « À 1:24 » si on était en remarque générale).
    const sansTemps = document.getElementById('sans-temps');
    const figer = async () => {
      lecteur.pause();
      tempsFixe = (await lecteur.getTime()) ?? 0;
      champTemps.value = fmtTemps(tempsFixe);
      zoneAncre.innerHTML = `À <b id="ancre-t">${fmtTemps(tempsFixe)}</b>`;
      sansTemps.hidden = false;
    };
    document.getElementById('commenter').onclick = async () => { await figer(); form.contenu.focus(); };
    // Commencer à écrire fige l'instant et met la vidéo en pause.
    form.contenu.addEventListener('focus', () => { if (tempsFixe == null) figer(); });
    sansTemps.onclick = () => {
      tempsFixe = -1; champTemps.value = '';
      zoneAncre.innerHTML = 'Remarque générale · <button type="button" class="btn-txt" id="avec-temps">remettre l’instant</button>';
      document.getElementById('avec-temps').onclick = async () => { await figer(); form.contenu.focus(); };
      sansTemps.hidden = true;
      form.contenu.focus();
    };
    tick();
  } else if (estVideo) {
    // Drive ou lien sans API : l'instant se note à la main.
    zoneAncre.innerHTML = '<label for="r_temps_m">Instant (ex. 1:24)</label>';
    champTemps.type = 'text'; champTemps.id = 'r_temps_m'; champTemps.placeholder = '0:00';
    zoneAncre.after(champTemps);
    document.getElementById('sans-temps').hidden = true;
  }

  // Script : clic sur un passage = remarque accrochée à ce passage.
  const choisirPar = (i) => {
    par = i;
    app.querySelectorAll('.par').forEach((el) => el.classList.toggle('choisi', Number(el.dataset.par) === i));
    zoneAncre.innerHTML = `Sur le passage <b>§ ${i + 1}</b> <span class="extrait">« ${esc(paragraphes[i].slice(0, 90))}${paragraphes[i].length > 90 ? '…' : ''} »</span>`;
    document.getElementById('general').hidden = false;
    form.contenu.focus();
  };
  app.querySelectorAll('.par').forEach((el) => {
    el.onclick = () => choisirPar(Number(el.dataset.par));
    el.onkeydown = (ev) => { if (ev.key === 'Enter') choisirPar(Number(el.dataset.par)); };
  });
  document.getElementById('general')?.addEventListener('click', (ev) => {
    par = null; ev.target.hidden = true; zoneAncre.textContent = 'Remarque générale';
    app.querySelectorAll('.par').forEach((el) => el.classList.remove('choisi'));
  });
  app.querySelectorAll('[data-par-go]').forEach((b) => (b.onclick = () => {
    const el = app.querySelector(`.par[data-par="${b.dataset.parGo}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 1200);
  }));

  // Maquette : épingles existantes + épingle en cours.
  const maquette = app.querySelector('.maquette');
  if (maquette) {
    const pins = maquette.querySelector('.pins');
    pins.innerHTML = (retours ?? []).filter((r) => numeros.has(r.id)).map((r) =>
      `<span class="pin ${r.traite ? 'fait' : ''}" style="left:${r.pos_x}%;top:${r.pos_y}%">${numeros.get(r.id)}</span>`).join('')
      + '<span class="pin nouveau" hidden>+</span>';
    const nouveau = pins.querySelector('.nouveau');
    maquette.onclick = (ev) => {
      const box = maquette.getBoundingClientRect();
      pos = { x: Math.round(1000 * (ev.clientX - box.left) / box.width) / 10, y: Math.round(1000 * (ev.clientY - box.top) / box.height) / 10 };
      Object.assign(nouveau.style, { left: pos.x + '%', top: pos.y + '%' });
      nouveau.hidden = false;
      zoneAncre.textContent = 'Endroit choisi ✓ Écrivez votre remarque.';
      form.contenu.focus();
    };
  }

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const contenu = form.contenu.value.trim();
    if (!contenu) return;
    const ligne = { fichier_id: fichierId, projet_id: projetId, contenu };
    if (champTemps?.value) {
      const t = lireTemps(champTemps.value);
      if (t == null) return alert('Instant non reconnu. Écrivez par exemple 1:24.');
      ligne.temps_sec = t;
    }
    if (pos) { ligne.pos_x = pos.x; ligne.pos_y = pos.y; }
    if (estScript && par != null && par <= 100) ligne.pos_y = par;
    const { error } = await sb.from('retours').insert(ligne);
    if (error) return alert(messageErreur(error));
    renderRevue(projetId, fichierId);
  };

  function bindSeek(racine) {
    racine.querySelectorAll('[data-seek]').forEach((b) => (b.onclick = (ev) => {
      ev.stopPropagation();
      lecteur?.seek(Number(b.dataset.seek), true);
      document.getElementById('media')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }
  bindSeek(app.querySelector('.retours'));

  app.querySelectorAll('[data-traite]').forEach((c) => (c.onchange = async () => {
    const { error } = await sb.from('retours').update({ traite: c.checked }).eq('id', c.dataset.traite);
    if (error) return alert(messageErreur(error));
    c.closest('li').classList.toggle('fait', c.checked);
  }));

  app.querySelectorAll('[data-suppr]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Retirer ce commentaire ?')) return;
    const { error } = await sb.from('retours').delete().eq('id', b.dataset.suppr);
    if (error) return alert(messageErreur(error));
    renderRevue(projetId, fichierId);
  }));

  const valider = document.getElementById('valider');
  if (valider) valider.onclick = async () => {
    if (!confirm(`Valider la V${vNum} ? Mackerprod sera prévenu.`)) return;
    const { error } = await sb.from('retours').insert({ fichier_id: fichierId, projet_id: projetId, type: 'validation' });
    if (error) return alert(messageErreur(error));
    renderRevue(projetId, fichierId);
  };

  const formVersion = document.getElementById('form-version');
  if (formVersion && !estScript) zoneVimeo(document.getElementById('v_url'), () => `${f.titre} · V${versions.length + 1}`);
  if (formVersion) formVersion.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(formVersion));
    const { data: nv, error } = await sb.from('fichiers').insert({
      projet_id: projetId, titre: f.titre, categorie: f.categorie,
      url: nettoyerLien(d.url) || null, texte: d.texte || null, note_version: d.note_version?.trim() || null,
    }).select('id').single();
    if (error) return alert(messageErreur(error));
    location.hash = `#/projet/${projetId}/revue/${nv.id}`;
  };
}

// Export complet du dossier (étape 4) -------------------------------------------
// Le client récupère tout en un fichier lisible hors ligne : rien n'est enfermé ici.

async function exporterDossier(clientId) {
  const [{ data: c, error }, { data: projets }] = await Promise.all([
    sb.from('clients').select('*').eq('id', clientId).single(),
    sb.from('projets').select('*, etapes(*), lancements(*), fichiers(*), messages(*), retours(*)').eq('client_id', clientId).order('created_at'),
  ]);
  if (error) return alert(messageErreur(error));
  const ligne = (l, v) => rempli(v) ? `<tr><th>${esc(l)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>` : '';
  const date = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Dossier ${esc(c.nom || c.email)} · Mackerprod</title>
<style>body{font:15px/1.6 Georgia,serif;max-width:820px;margin:40px auto;padding:0 16px;color:#1a2026}
h1,h2,h3{font-weight:400}h2{border-bottom:2px solid #941e28;padding-bottom:6px;margin-top:48px}
table{border-collapse:collapse;width:100%}th{text-align:left;width:34%;color:#6b6a66;font-weight:400;vertical-align:top;padding:4px 12px 4px 0}
td{padding:4px 0}li{margin:6px 0}.m{border-left:3px solid #c9a27a;padding:6px 12px;margin:10px 0}.muted{color:#6b6a66}</style></head><body>
<p class="muted">Dossier exporté le ${date(new Date())} depuis l’espace client Mackerprod. Ces informations et ces fichiers vous appartiennent.</p>
<h1>${esc(c.nom || c.email)}${c.entreprise ? ` · ${esc(c.entreprise)}` : ''}</h1>
<h2>Coordonnées</h2><table>${ligne('E-mail', c.email)}${CHAMPS_FICHE.map(([k, l]) => ligne(l, c[k])).join('')}${ligne('Remarques', c.notes)}</table>
${(projets ?? []).map((p) => {
  const lanc = Array.isArray(p.lancements) ? p.lancements[0] : p.lancements;
  return `<h2>Projet : ${esc(p.titre)}</h2>
  <p class="muted">${esc(serviceDe(p).label)}</p>
  <h3>Avancement</h3><ol>${tri(p.etapes).map((e) => `<li>${esc(serviceDe(p).etapes[e.numero]?.titre)} : ${STATUTS[e.statut]}</li>`).join('')}</ol>
  ${lanc ? `<h3>Fiche de préparation</h3><table>${serviceDe(p).fiche.map(([k, l]) => ligne(l, lanc.reponses?.[k])).join('')}</table>` : ''}
  <h3>Fichiers</h3>${p.fichiers?.length ? `<ul>${p.fichiers.map((f) => `<li>[${CATEGORIES[f.categorie]}] <a href="${esc(f.url)}">${esc(f.titre)}</a> <span class="muted">${esc(f.url)}</span>
    ${(p.retours ?? []).filter((r) => r.fichier_id === f.id).map((r) => `<div class="m">${r.type === 'validation' ? `✓ Validé le ${date(r.created_at)}`
      : `${r.temps_sec != null ? `<b>${fmtTemps(r.temps_sec)}</b> · ` : ''}${r.par_admin ? 'Mackerprod' : 'Client'} : ${esc(r.contenu)}${r.traite ? ' <span class="muted">(traité)</span>' : ''}`}</div>`).join('')}</li>`).join('')}</ul>` : '<p class="muted">Aucun fichier.</p>'}
  <h3>Messages</h3>${(p.messages ?? []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((m) =>
    `<div class="m"><span class="muted">${m.par_admin ? 'Mackerprod' : 'Client'} · ${date(m.created_at)}</span><br>${esc(m.contenu).replace(/\n/g, '<br>')}</div>`).join('') || '<p class="muted">Aucun message.</p>'}`;
}).join('')}
</body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `dossier-mackerprod-${(c.nom || c.email).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.html`;
  document.body.appendChild(a); a.click(); a.remove();
}

// Livraison (expérience 2) -----------------------------------------------------
// Une vraie page de remise : mot de l'équipe, films lisibles sur place, photos, téléchargements,
// et un lien de partage pour les proches, sans compte.

const estImageUrl = (u) => /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(u);

function livraisonHtml(d, { prive = false } = {}) {
  const svc = SERVICES[d.type] ?? SERVICES.site_web;
  const videos = d.fichiers.filter((f) => f.categorie === 'video');
  const images = d.fichiers.filter((f) => f.categorie !== 'video' && estImageUrl(f.url));
  const galeries = d.fichiers.filter((f) => estPicTime(f.url));
  const autres = d.fichiers.filter((f) => f.categorie !== 'video' && !estImageUrl(f.url) && !estPicTime(f.url));
  return `
    <section class="livraison-hero">
      <p class="label rule">${esc(svc.label)}</p>
      <h1 class="h-l">${esc(svc.livraison).replace(/^(\S+)/, '$1')} <span class="sous">${esc(d.titre)}</span></h1>
      ${d.mot ? `<blockquote class="mot">${esc(d.mot).replace(/\n/g, '<br>')}<cite>L’équipe Mackerprod</cite></blockquote>` : ''}
    </section>
    ${videos.map((f, i) => `<section class="section"><p class="label">${esc(f.titre)}</p><div class="lecteur" data-video="${i}"></div>
      <p class="small" style="margin-top:10px"><a href="${esc(f.url)}" target="_blank" rel="noopener">Ouvrir ou télécharger →</a></p></section>`).join('')}
    ${galeries.length ? `<section class="section"><p class="label">Vos galeries photo</p><div class="galeries">${galeries.map((g) => `
      <a class="galerie-carte" href="${esc(g.url)}" target="_blank" rel="noopener"><span class="label bronze">Galerie</span><strong>${esc(g.titre)}</strong>
        <span class="sub">Regardez, choisissez vos préférées et téléchargez en haute définition.</span><span class="go">Ouvrir la galerie ↗</span></a>`).join('')}</div></section>` : ''}
    ${images.length ? `<section class="section"><p class="label">Photos</p><div class="galerie">${images.map((f) =>
      `<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="${esc(f.titre)}" loading="lazy"></a>`).join('')}</div></section>` : ''}
    ${autres.length ? `<section class="section"><p class="label">${prive ? 'Vos fichiers' : 'Fichiers'}</p><div class="todo">${autres.map((f) => `
      <a href="${esc(f.url)}" target="_blank" rel="noopener"><span class="tag">${CATEGORIES[f.categorie]}</span>
        <span><strong>${esc(f.titre)}</strong><span class="sub">Ouvrir ou télécharger</span></span><span class="go">↓</span></a>`).join('')}</div></section>` : ''}
    ${d.fichiers.length ? '' : '<p class="empty section">La livraison arrive bientôt.</p>'}`;
}

async function monterVideos(d) {
  const videos = d.fichiers.filter((f) => f.categorie === 'video');
  for (const [i, f] of videos.entries()) {
    const zone = app.querySelector(`[data-video="${i}"]`);
    if (zone) monterLecteur(zone, analyserLien(f.url, 'video'), f.url).catch(() => {});
  }
}

async function renderLivraison(id) {
  const admin = estAdmin();
  const [{ data: p, error }, { data: fichiers }] = await Promise.all([
    sb.from('projets').select('id, titre, type, mot_livraison, partage_token, partage_actif').eq('id', id).single(),
    sb.from('fichiers').select('titre, url, categorie').eq('projet_id', id).eq('livrable', true).order('created_at'),
  ]);
  if (error) return showError(error);
  const d = { titre: p.titre, type: p.type, mot: p.mot_livraison, fichiers: fichiers ?? [] };
  const lien = (t) => `${location.origin}${location.pathname}#/partage/${t}`;

  app.innerHTML = `
    <a class="back" href="#/projet/${id}">← ${esc(p.titre)}</a>
    ${livraisonHtml(d, { prive: true })}
    <section class="section">
      <p class="label">Partager avec vos proches</p>
      <div class="card partage">
        <p>${admin ? 'Le client peut créer un lien pour montrer sa livraison sans compte.' : 'Créez un lien pour montrer vos films et vos photos à votre famille, vos amis ou votre équipe, sans qu’ils aient besoin de compte. Vous pouvez le couper à tout moment.'}</p>
        <div id="partage-zone">${p.partage_actif && p.partage_token
          ? `<div class="lien-partage"><input readonly value="${esc(lien(p.partage_token))}"><button class="btn btn-sm" id="copier">Copier</button></div>
             <div class="form-foot"><button class="btn-txt" id="couper">Désactiver le lien</button></div>`
          : `<div class="form-foot"><button class="btn btn-line" id="activer">Créer un lien de partage</button></div>`}</div>
      </div>
    </section>
    ${admin ? '' : `<section class="section">
      <p class="label">Un mot pour nous ?</p>
      <div class="card"><p>Votre avis compte énormément pour une petite équipe comme la nôtre. ${AVIS_GOOGLE_URL ? 'Quelques mots sur Google aident d’autres personnes à nous trouver, et nous font très plaisir.' : 'Dites-nous ce que vous en pensez dans les messages du projet.'}</p>
      <div class="form-foot">${AVIS_GOOGLE_URL ? `<a class="btn" href="${esc(AVIS_GOOGLE_URL)}" target="_blank" rel="noopener">Laisser un avis Google →</a>` : ''}
        <a class="btn btn-line" href="#/projet/${id}/messages">Nous écrire</a></div></div>
    </section>`}`;

  monterVideos(d);
  const basculer = async (actif) => {
    const { error } = await sb.rpc('partager_livraison', { p: id, actif });
    if (error) return alert(messageErreur(error));
    renderLivraison(id);
  };
  document.getElementById('activer')?.addEventListener('click', () => basculer(true));
  document.getElementById('couper')?.addEventListener('click', () => basculer(false));
  document.getElementById('copier')?.addEventListener('click', async (ev) => {
    const champ = app.querySelector('.lien-partage input');
    try { await navigator.clipboard.writeText(champ.value); } catch { champ.select(); document.execCommand('copy'); }
    ev.target.textContent = 'Copié ✓';
  });
}

// Page publique de partage : pas de compte, seulement ce que le client a choisi de montrer.
async function renderPartage(token) {
  window.scrollTo(0, 0);
  const { data, error } = await sb.rpc('livraison_publique', { t: token });
  if (error) return showError(error);
  if (!data) {
    app.innerHTML = `<p class="label rule">Partage</p><h1 class="h-l">Ce lien n’est plus <em>actif</em></h1>
      <p class="lead">Demandez un nouveau lien à la personne qui vous l’a envoyé.</p>`;
    return;
  }
  app.innerHTML = `${livraisonHtml(data)}
    <section class="section signature">
      <p class="label">Réalisé par</p>
      <p class="h-m">Mackerprod · <em>vidéo, photo et contenu</em> à Cambrai</p>
      <p class="lead">Avant les images, il y a vous.</p>
      <div class="form-foot"><a class="btn" href="https://www.mackerprod.fr/" target="_blank" rel="noopener">Découvrir Mackerprod →</a></div>
    </section>`;
  monterVideos(data);
}
