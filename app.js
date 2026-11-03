import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { SERVICES, serviceDe } from './services.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const logoutBtn = document.getElementById('logout');
const who = document.getElementById('who');

// Contenu ----------------------------------------------------------------------

const STATUTS = { a_venir: 'À venir', en_cours: 'En cours', termine: 'Terminé' };
const CHAMPS_FICHE = [
  ['nom', 'Nom et prénom'], ['entreprise', 'Entreprise'], ['telephone', 'Téléphone'],
  ['adresse', 'Adresse'], ['siret', 'SIRET', 'Si vous êtes une entreprise'],
  ['nom_de_domaine', 'Nom de domaine', 'Ex. : monentreprise.fr. Il reste à vous.'],
  ['registrar', 'Domaine enregistré chez', 'OVH, Gandi, IONOS…'], ['reseaux_sociaux', 'Réseaux sociaux', 'Liens Instagram, Facebook…'],
];
const FICHE_ESSENTIEL = ['nom', 'telephone', 'adresse'];
const REVUE = ['video', 'maquette'];
const CATEGORIES = { video: 'Vidéo', photo: 'Photo', document: 'Document', maquette: 'Maquette', autre: 'Autre' };

// Outils -----------------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = (d) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
window.addEventListener('hashchange', () => profil && Promise.resolve(router()).catch(showError));
logoutBtn.onclick = () => sb.auth.signOut();

async function demarrer(session) {
  logoutBtn.hidden = !session;
  profil = null;
  if (!session) return renderLogin();

  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) return showError(error);
  profil = data;
  who.textContent = profil.role === 'admin' ? 'Administration' : profil.email;
  router();
}

function router() {
  window.scrollTo(0, 0);
  const r = location.hash.match(/^#\/projet\/([0-9a-f-]{36})\/revue\/([0-9a-f-]{36})$/);
  if (r) return renderRevue(r[1], r[2]);
  const m = location.hash.match(/^#\/projet\/([0-9a-f-]{36})(?:\/(\w+))?$/);
  if (m) return renderProjet(m[1], m[2]);
  if (profil.role === 'admin') return renderAdmin();
  if (!profil.client_id) {
    app.innerHTML = `
      <p class="label rule">Bienvenue</p>
      <h1 class="h-l">Votre espace est <em>presque prêt</em></h1>
      <p class="notice section">Votre compte (${esc(profil.email)}) n’est pas encore relié à un dossier.
      Mackerprod s’en occupe sous 24 h ouvrées.</p>`;
    return;
  }
  return renderClient(profil.client_id);
}

function showError(error) {
  app.innerHTML = `<p class="notice">Une erreur est survenue : ${esc(error.message)}</p>`;
}

// Connexion par lien magique ---------------------------------------------------

function renderLogin() {
  app.innerHTML = `
    <div class="login">
      <p class="label rule">Espace client</p>
      <h1 class="h-l">Suivez votre projet <em>pas à pas</em></h1>
      <p class="lead">Avancement, échanges, fichiers : tout est réuni ici.</p>
      <form id="login" class="card">
        <label for="email">Votre adresse e-mail</label>
        <input id="email" type="email" required autocomplete="email" placeholder="vous@exemple.fr">
        <div class="form-foot"><button class="btn">Recevoir mon lien de connexion</button></div>
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
      ? `<p class="msg err">Erreur : ${esc(error.message)}</p>`
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
    sb.from('fichiers').select('id, projet_id, titre, categorie, par_admin').in('categorie', ['video', 'maquette']),
    sb.from('retours').select('fichier_id, type'),
  ]);
  if (error) return showError(error);

  // Ce que le client doit faire maintenant, du plus important au moins important.
  const todo = [];
  for (const p of projets ?? []) {
    for (const f of (fichiers ?? []).filter((x) => x.projet_id === p.id && x.par_admin)) {
      if (!(retours ?? []).some((r) => r.fichier_id === f.id && r.type === 'validation')) {
        todo.push({ href: `#/projet/${p.id}/revue/${f.id}`, titre: `Donner votre avis sur « ${f.titre} »`, sub: `${p.titre} · commentez puis validez` });
      }
    }
    const m = dernierMessage(messages, p.id);
    if (m?.par_admin) todo.push({ href: `#/projet/${p.id}/messages`, titre: 'Nouveau message de Mackerprod', sub: `${p.titre} · ${dateFr(m.created_at)}` });
    const e = etapeCourante(p.etapes);
    const lanc = (lancements ?? []).find((l) => l.projet_id === p.id);
    if (e && e.numero >= 3 && !Object.values(lanc?.reponses ?? {}).some(rempli)) {
      todo.push({ href: `#/projet/${p.id}/lancement`, titre: 'Remplir la fiche de préparation', sub: `${p.titre} · pour que tout soit prêt le jour du tournage` });
    }
  }
  const manquants = FICHE_ESSENTIEL.filter((k) => !rempli(fiche[k]));
  if (manquants.length) todo.push({ href: '#fiche', titre: 'Compléter vos coordonnées', sub: `${manquants.length} information${manquants.length > 1 ? 's' : ''} manquante${manquants.length > 1 ? 's' : ''} · une seule fois pour tous vos projets` });

  app.innerHTML = `
    <p class="label rule">Espace client</p>
    <h1 class="h-l">Bonjour <em>${esc((fiche.nom || '').split(' ')[0] || '')}</em></h1>
    <p class="lead">Retrouvez ici l’avancement de vos projets, vos échanges avec Mackerprod et vos fichiers.</p>

    <section class="section">
      <p class="label">À faire de votre côté</p>
      <div class="todo">${todo.length
        ? todo.map((t, i) => `<a href="${t.href}"><span class="num">${i + 1}</span>
            <span><strong>${esc(t.titre)}</strong><span class="sub">${esc(t.sub)}</span></span><span class="go">→</span></a>`).join('')
        : `<div><span class="num ok">✓</span><span><strong>Tout est à jour</strong><span class="sub">Rien ne vous attend pour le moment. On vous prévient dès qu’il y a du nouveau.</span></span></div>`}
      </div>
    </section>

    <section class="section">
      <p class="label">Vos projets</p>
      <div class="projets">
        ${(projets ?? []).map((p) => `
          <a class="projet" href="#/projet/${p.id}">
            <div class="projet-top"><div><p class="label bronze">${esc(serviceDe(p).label)}</p><h2 class="h-m">${esc(p.titre)}</h2></div><span class="ouvrir">Ouvrir le projet →</span></div>
            ${parcoursHtml(p)}
          </a>`).join('') || '<p class="empty">Aucun projet pour l’instant.</p>'}
      </div>
    </section>

    <section class="section" id="fiche">
      <p class="label">Vos coordonnées</p>
      <p class="panel-intro">À remplir une seule fois : Mackerprod les réutilise pour tous vos projets.</p>
      ${formHtml('fiche', CHAMPS_FICHE, fiche, ['notes', 'Remarques'])}
    </section>

    <section class="section">
      <p class="label">Vos données</p>
      <div class="card export">
        <p>Téléchargez à tout moment l’intégralité de votre dossier : coordonnées, projets, liens vers vos fichiers, échanges et validations. Tout vous appartient.</p>
        <div class="form-foot"><button class="btn btn-line" id="exporter">Télécharger mon dossier</button></div>
      </div>
    </section>`;
  document.getElementById('exporter').onclick = () => exporterDossier(clientId);
  bindForm('fiche', (maj) => sb.from('clients').update(maj).eq('id', clientId), () => renderClient(clientId));
}

// Morceaux réutilisés ----------------------------------------------------------

function parcoursHtml(p, editable = false) {
  const projetId = p.id, svc = serviceDe(p);
  return `<ol class="parcours">${tri(p.etapes).map((e) => `
    <li class="${e.statut}">
      <span class="n">${e.numero}</span>
      <span class="t">${esc(svc.etapes[e.numero]?.titre)}</span>
      ${editable
        ? `<select data-projet="${projetId}" data-numero="${e.numero}" aria-label="Statut de l’étape ${e.numero}">${Object.entries(STATUTS).map(([v, t]) =>
            `<option value="${v}" ${v === e.statut ? 'selected' : ''}>${t}</option>`).join('')}</select>`
        : `<span class="s">${e.statut === 'en_cours' ? 'En cours' : e.statut === 'termine' ? 'Terminé' : ''}</span>`}
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
    out.textContent = error ? `Erreur : ${error.message}` : 'Enregistré ✓';
    if (!error && apres) setTimeout(apres, 900);
  };
}

// Page projet (client et admin) ------------------------------------------------

async function renderProjet(id, onglet) {
  const admin = profil.role === 'admin';
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
  const reponses = lancement?.reponses ?? {};
  const dernier = (messages ?? []).at(-1);
  const attendReponse = dernier && dernier.par_admin !== admin;
  const lancementVide = !svc.fiche.some(([k]) => rempli(reponses[k]));
  const onglets = [
    ['avancement', 'Avancement'],
    ['messages', 'Messages', messages?.length, attendReponse],
    ['fichiers', 'Fichiers', fichiers?.length, admin && (retours ?? []).some((r) => !r.traite)],
    ['lancement', 'Fiche de préparation', null, lancementVide && e?.numero >= 3],
  ];
  const actif = onglets.some(([k]) => k === onglet) ? onglet : 'avancement';
  const nomClient = p.clients?.nom || p.clients?.email || 'Client';

  app.innerHTML = `
    <a class="back" href="#/">← ${admin ? 'Tableau de bord' : 'Mes projets'}</a>
    <p class="label rule" style="margin-top:28px">${esc(svc.label)}${admin ? ' · ' + esc(nomClient) + (p.clients?.entreprise ? ' · ' + esc(p.clients.entreprise) : '') : ''}</p>
    <h1 class="h-l">${esc(p.titre)}</h1>

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
          ${admin ? '' : `<p class="attendu">De votre côté : ${esc(info.attendu)}${info.onglet ? ` <a href="#/projet/${id}/${info.onglet}">C’est ici →</a>` : ''}</p>`}
        </div>
      </div>
      <div class="section" style="margin-top:40px">
        <p class="label">Les 7 étapes${admin ? ' · modifiez le statut ici' : ''}</p>
        ${parcoursHtml(p, admin)}
      </div>
      ${admin && p.clients ? `<div class="section"><p class="label">Contact</p>
        <p>${esc(nomClient)} · <a href="mailto:${esc(p.clients.email)}">${esc(p.clients.email)}</a>${p.clients.telephone ? ` · <a href="tel:${esc(p.clients.telephone)}">${esc(p.clients.telephone)}</a>` : ''}</p>
        <div class="form-foot"><button class="btn btn-line btn-sm" id="exporter">Exporter le dossier du client</button></div></div>
      <div class="section"><p class="label">Prestation</p>
        <select id="changer-type" style="max-width:420px">${Object.entries(SERVICES).map(([k, v]) =>
          `<option value="${k}" ${k === (p.type || 'site_web') ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        <p class="muted small" style="margin-top:6px">Change les noms des étapes et la fiche de préparation de ce projet.</p></div>` : ''}
    </section>

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
          <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titre)}</a>
          <span class="meta">${f.par_admin ? 'Mackerprod' : esc(nomClient)} · ${dateFr(f.created_at)}</span>
          ${REVUE.includes(f.categorie) ? (() => { const ri = revueInfo(f.id); return `
            ${ri.valide ? '<span class="badge ok">Validé</span>' : ''}
            ${admin && ri.aTraiter ? `<span class="badge red">${ri.aTraiter} retour${ri.aTraiter > 1 ? 's' : ''} à traiter</span>` : ''}
            <a class="btn btn-line btn-sm" href="#/projet/${id}/revue/${f.id}">${admin ? 'Voir les retours' : ri.valide ? 'Revoir' : 'Commenter et valider'} →</a>`; })() : ''}
          ${admin || f.ajoute_par === profil.id ? `<button class="btn-txt" data-suppr="${f.id}">Retirer</button>` : ''}
        </li>`).join('') || '<li><span class="empty">Aucun fichier pour l’instant.</span></li>'}
      </ul>
      <details class="ajout" ${fichiers?.length ? '' : 'open'}>
        <summary class="btn btn-line">+ Ajouter un lien</summary>
        <form id="nouveau-fichier" class="card grid">
          <div><label for="f_titre">Nom du fichier</label><input id="f_titre" name="titre" required placeholder="Photos de l’équipe"></div>
          <div><label for="f_cat">Type</label><select id="f_cat" name="categorie">
            ${Object.entries(CATEGORIES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
          <div class="full"><label for="f_url">Lien</label>
            <input id="f_url" name="url" type="url" required placeholder="https://drive.google.com/…"></div>
          <div class="full form-foot"><button class="btn">Ajouter</button></div>
        </form>
      </details>
    </section>

    <section class="panel" data-panel="lancement">
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
  }));
  montrer(actif);

  const changerType = document.getElementById('changer-type');
  if (changerType) changerType.onchange = async () => {
    const { error } = await sb.from('projets').update({ type: changerType.value }).eq('id', id);
    if (error) return alert(error.message);
    renderProjet(id, 'avancement');
  };
  if (admin && document.getElementById('exporter')) document.getElementById('exporter').onclick = () => exporterDossier(p.client_id);
  if (admin) {
    app.querySelectorAll('select[data-projet]').forEach((s) => (s.onchange = async () => {
      const { error } = await sb.from('etapes').update({ statut: s.value })
        .eq('projet_id', s.dataset.projet).eq('numero', Number(s.dataset.numero));
      if (error) return alert(error.message);
      renderProjet(id, 'avancement');
    }));
  }

  bindForm('lancement', (maj) => sb.from('lancements').upsert({ projet_id: id, reponses: { ...reponses, ...maj } }));

  document.getElementById('nouveau-message').onsubmit = async (ev) => {
    ev.preventDefault();
    const contenu = ev.target.contenu.value.trim();
    if (!contenu) return;
    const { error } = await sb.from('messages').insert({ projet_id: id, contenu });
    if (error) return alert(error.message);
    renderProjet(id, 'messages');
  };

  document.getElementById('nouveau-fichier').onsubmit = async (ev) => {
    ev.preventDefault();
    const { titre, url, categorie } = Object.fromEntries(new FormData(ev.target));
    const { error } = await sb.from('fichiers').insert({ projet_id: id, titre, url, categorie });
    if (error) return alert(error.message);
    renderProjet(id, 'fichiers');
  };

  app.querySelectorAll('[data-suppr]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Retirer ce lien ? Le fichier lui-même n’est pas supprimé.')) return;
    const { error } = await sb.from('fichiers').delete().eq('id', b.dataset.suppr);
    if (error) return alert(error.message);
    renderProjet(id, 'fichiers');
  }));
}

// Tableau de bord admin (Maxence) ---------------------------------------------

async function renderAdmin() {
  const [{ data: clients, error }, { data: messages }, { data: retours }] = await Promise.all([
    sb.from('clients').select('*, projets(*, etapes(*))').order('created_at', { ascending: false }),
    sb.from('messages').select('projet_id, par_admin, created_at').order('created_at', { ascending: false }).limit(500),
    sb.from('retours').select('projet_id').eq('traite', false),
  ]);
  const nbRetours = (pid) => (retours ?? []).filter((r) => r.projet_id === pid).length;
  if (error) return showError(error);

  const lignes = (clients ?? []).flatMap((c) => (c.projets ?? []).map((p) => {
    const m = dernierMessage(messages, p.id);
    return { c, p, e: etapeCourante(p.etapes), m, aRepondre: m && !m.par_admin, retours: nbRetours(p.id) };
  })).sort((a, b) => ((b.aRepondre || b.retours > 0) - (a.aRepondre || a.retours > 0)) || (new Date(b.m?.created_at ?? 0) - new Date(a.m?.created_at ?? 0)));
  const sansProjet = (clients ?? []).filter((c) => !c.projets?.length);
  const nbRepondre = lignes.filter((l) => l.aRepondre).length;
  const totalRetours = (retours ?? []).length;
  const nbActifs = lignes.filter((l) => l.e?.statut !== 'termine').length;

  app.innerHTML = `
    <p class="label rule">Administration</p>
    <h1 class="h-l">Tableau de <em>bord</em></h1>

    <div class="stats stats-4">
      <div><strong class="${nbRepondre ? 'red' : ''}">${nbRepondre}</strong><span>message${nbRepondre > 1 ? 's' : ''} client en attente de réponse</span></div>
      <div><strong class="${totalRetours ? 'red' : ''}">${totalRetours}</strong><span>retour${totalRetours > 1 ? 's' : ''} sur vidéo ou maquette à traiter</span></div>
      <div><strong>${nbActifs}</strong><span>projet${nbActifs > 1 ? 's' : ''} en cours</span></div>
      <div><strong>${clients?.length ?? 0}</strong><span>client${(clients?.length ?? 0) > 1 ? 's' : ''}</span></div>
    </div>

    <section class="section">
      <p class="label">Projets</p>
      ${lignes.length ? `<table class="table">
        <thead><tr><th>Client</th><th>Projet</th><th>Étape</th><th>Dernier message</th><th></th></tr></thead>
        <tbody>${lignes.map(({ c, p, e, m, aRepondre, retours: nr }) => `
          <tr class="lien" data-href="#/projet/${p.id}${aRepondre ? '/messages' : ''}">
            <td class="client"><b>${esc(c.nom || c.email)}</b><span>${esc(c.entreprise || c.email)}</span></td>
            <td>${esc(p.titre)}<span class="muted small" style="display:block">${esc(serviceDe(p).label)}</span></td>
            <td>${e ? `${e.numero}. ${esc(serviceDe(p).etapes[e.numero]?.titre)}` : ''}</td>
            <td class="muted small">${m ? `${m.par_admin ? 'Vous' : 'Client'} · ${dateFr(m.created_at)}` : '—'}</td>
            <td><div class="badges">${aRepondre ? '<span class="badge red">À répondre</span>' : ''}${nr ? `<span class="badge line">${nr} retour${nr > 1 ? 's' : ''}</span>` : ''}</div></td>
          </tr>`).join('')}
        </tbody></table>` : '<p class="empty">Aucun projet pour l’instant. Créez votre premier client ci-dessous.</p>'}
      ${sansProjet.length ? `<p class="muted small" style="margin-top:16px">Clients sans projet : ${sansProjet.map((c) => esc(c.nom || c.email)).join(', ')}</p>` : ''}
    </section>

    <section class="section">
      <p class="label">Ajouter</p>
      <details class="ajout">
        <summary class="btn">+ Nouveau client</summary>
        <form id="nouveau" class="card">
          <p class="panel-intro">Le client se connecte ensuite avec cet e-mail : son compte est relié automatiquement.</p>
          <div class="grid">
            <div><label for="n_email">E-mail du client</label><input id="n_email" name="email" type="email" required></div>
            <div><label for="n_nom">Nom et prénom</label><input id="n_nom" name="nom"></div>
            <div><label for="n_ent">Entreprise</label><input id="n_ent" name="entreprise"></div>
            <div><label for="n_projet">Premier projet</label><input id="n_projet" name="projet" placeholder="Film d’entreprise 2027"></div>
            <div><label for="n_type">Prestation</label><select id="n_type" name="type">${Object.entries(SERVICES).map(([k, v]) => `<option value="${k}">${esc(v.label)} (${v.cible === 'pro' ? 'pro' : 'particulier'})</option>`).join('')}</select></div>
          </div>
          <div class="form-foot"><button class="btn">Créer le client</button></div>
        </form>
      </details>
      ${clients?.length ? `<details class="ajout">
        <summary class="btn btn-line">+ Projet pour un client existant</summary>
        <form id="ajout-projet" class="card grid">
          <div><label for="p_client">Client</label><select id="p_client" name="client_id">
            ${clients.map((c) => `<option value="${c.id}">${esc(c.nom || c.email)}</option>`).join('')}</select></div>
          <div><label for="p_titre">Nom du projet</label><input id="p_titre" name="titre" required></div>
          <div><label for="p_type">Prestation</label><select id="p_type" name="type">${Object.entries(SERVICES).map(([k, v]) => `<option value="${k}">${esc(v.label)} (${v.cible === 'pro' ? 'pro' : 'particulier'})</option>`).join('')}</select></div>
          <div class="full form-foot"><button class="btn">Créer le projet</button></div>
        </form>
      </details>` : ''}
    </section>`;

  app.querySelectorAll('tr[data-href]').forEach((tr) => (tr.onclick = () => (location.hash = tr.dataset.href)));

  document.getElementById('nouveau').onsubmit = async (ev) => {
    ev.preventDefault();
    const { email, nom, entreprise, projet, type } = Object.fromEntries(new FormData(ev.target));
    const { data: c, error } = await sb.from('clients').insert({ email, nom, entreprise }).select().single();
    if (error) return alert(error.message);
    if (projet) await sb.from('projets').insert({ client_id: c.id, titre: projet, type });
    renderAdmin();
  };

  const ajout = document.getElementById('ajout-projet');
  if (ajout) ajout.onsubmit = async (ev) => {
    ev.preventDefault();
    const { error } = await sb.from('projets').insert(Object.fromEntries(new FormData(ajout)));
    if (error) return alert(error.message);
    renderAdmin();
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
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = ko;
  document.head.appendChild(s);
});

// Reconnaît le type de lien pour choisir le bon lecteur.
function analyserLien(url, categorie) {
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/))) return { type: 'youtube', id: m[1] };
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([\da-f]+))?/))) return { type: 'vimeo', id: m[1], hash: m[2] };
  if ((m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/))) return { type: categorie === 'video' ? 'drive' : 'drive-image', id: m[1] };
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return { type: 'video' };
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)) return { type: 'image' };
  return { type: 'lien' };
}

// Lecteur commun : getTime() renvoie l'instant en secondes (ou null), seek(s) s'y place.
async function monterLecteur(zone, lien, url) {
  const vide = { getTime: async () => null, seek: () => {}, auto: false };
  if (lien.type === 'youtube') {
    zone.innerHTML = '<div class="ratio"><div id="yt"></div></div>';
    await chargerScript('https://www.youtube.com/iframe_api');
    await new Promise((ok) => (window.YT?.Player ? ok() : (window.onYouTubeIframeAPIReady = ok)));
    const player = await new Promise((ok) => {
      const pl = new YT.Player('yt', { videoId: lien.id, playerVars: { rel: 0 }, events: { onReady: () => ok(pl) } });
    });
    return { getTime: async () => player.getCurrentTime(), seek: (s) => { player.seekTo(s, true); player.playVideo(); }, pause: () => player.pauseVideo(), auto: true };
  }
  if (lien.type === 'vimeo') {
    zone.innerHTML = `<div class="ratio"><iframe src="https://player.vimeo.com/video/${lien.id}${lien.hash ? `?h=${lien.hash}` : ''}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    await chargerScript('https://player.vimeo.com/api/player.js');
    const player = new Vimeo.Player(zone.querySelector('iframe'));
    return { getTime: () => player.getCurrentTime(), seek: (s) => { player.setCurrentTime(s); player.play(); }, pause: () => player.pause(), auto: true };
  }
  if (lien.type === 'video') {
    zone.innerHTML = `<div class="ratio"><video controls preload="metadata" src="${esc(url)}"></video></div>`;
    const v = zone.querySelector('video');
    return { getTime: async () => v.currentTime, seek: (s) => { v.currentTime = s; v.play(); }, pause: () => v.pause(), auto: true };
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
    Vous pouvez quand même laisser vos commentaires ci-dessous.</div>`;
  return vide;
}

async function renderRevue(projetId, fichierId) {
  const admin = profil.role === 'admin';
  const [{ data: f, error }, { data: retours }, { data: p }] = await Promise.all([
    sb.from('fichiers').select('*').eq('id', fichierId).single(),
    sb.from('retours').select('*').eq('fichier_id', fichierId).order('created_at'),
    sb.from('projets').select('titre, clients(nom, email)').eq('id', projetId).single(),
  ]);
  if (error) return showError(error);

  const lien = analyserLien(f.url, f.categorie);
  const estVideo = ['youtube', 'vimeo', 'video', 'drive'].includes(lien.type) || (f.categorie === 'video' && lien.type === 'lien');
  const estImage = lien.type === 'image' || lien.type === 'drive-image';
  const commentaires = (retours ?? []).filter((r) => r.type === 'commentaire')
    .sort((a, b) => estVideo ? (a.temps_sec ?? 1e9) - (b.temps_sec ?? 1e9) : new Date(a.created_at) - new Date(b.created_at));
  const validation = (retours ?? []).find((r) => r.type === 'validation');
  const aTraiter = commentaires.filter((r) => !r.traite).length;
  const nomClient = p?.clients?.nom || p?.clients?.email || 'Client';
  // Numéro d'épingle stable : ordre d'arrivée.
  const numeros = new Map((retours ?? []).filter((r) => r.pos_x != null).map((r, i) => [r.id, i + 1]));

  app.innerHTML = `
    <a class="back" href="#/projet/${projetId}/fichiers">← ${esc(p?.titre ?? 'Projet')}</a>
    <p class="label rule" style="margin-top:28px">${estVideo ? 'Revue vidéo' : 'Revue de maquette'}</p>
    <h1 class="h-l">${esc(f.titre)}</h1>
    <p class="lead">${admin
      ? `${aTraiter ? `<strong>${aTraiter}</strong> retour${aTraiter > 1 ? 's' : ''} à traiter.` : 'Tous les retours sont traités.'}`
      : estVideo ? 'Lancez la vidéo, mettez-la en pause au moment voulu et écrivez votre remarque : l’instant est noté automatiquement.'
      : 'Cliquez à l’endroit voulu sur la maquette puis écrivez votre remarque.'}</p>

    ${validation ? `<div class="valide">✓ Validé par ${admin ? esc(nomClient) : 'vous'} le ${dateFr(validation.created_at)}</div>` : ''}

    <div class="revue">
      <div class="revue-media" id="media"><p class="muted">Chargement du lecteur…</p></div>
      <aside class="revue-side">
        <form id="retour" class="card">
          <p class="label">Nouveau commentaire</p>
          ${estVideo ? `<label for="r_temps">Instant<span class="hint">Rempli automatiquement quand vous écrivez</span></label>
            <div class="temps-row"><input id="r_temps" name="temps" placeholder="0:00" inputmode="numeric"><button type="button" class="btn btn-line btn-sm" id="r_maintenant">Instant actuel</button></div>` : ''}
          ${estImage ? '<p class="pin-info muted small" id="pin-info">Aucun endroit choisi : cliquez sur la maquette.</p>' : ''}
          <label for="r_contenu">Remarque</label>
          <textarea id="r_contenu" name="contenu" rows="3" required placeholder="${estVideo ? 'Ex. : couper ce plan, musique trop forte…' : 'Ex. : logo plus grand, changer cette photo…'}"></textarea>
          <div class="form-foot"><button class="btn">Ajouter</button></div>
        </form>
        ${!admin && !validation ? `<div class="card valider">
          <p class="label">Tout vous convient ?</p>
          <p class="muted small">Validez cette version. Vos commentaires restent visibles.</p>
          <div class="form-foot"><button class="btn btn-line" id="valider">Valider cette version</button></div>
        </div>` : ''}
      </aside>
    </div>

    <section class="section">
      <p class="label">Commentaires (${commentaires.length})</p>
      <ul class="retours">${commentaires.map((r) => `
        <li class="${r.traite ? 'fait' : ''}">
          ${r.temps_sec != null ? `<button class="chip" data-seek="${r.temps_sec}" title="Aller à cet instant">▶ ${fmtTemps(r.temps_sec)}</button>` : ''}
          ${numeros.has(r.id) ? `<span class="chip pin-n">${numeros.get(r.id)}</span>` : ''}
          <div class="corps">
            <div class="qui"><b>${r.par_admin ? 'Mackerprod' : admin ? esc(nomClient) : 'Vous'}</b> · ${dateFr(r.created_at)}</div>
            <div>${esc(r.contenu).replace(/\n/g, '<br>')}</div>
          </div>
          <div class="etat">
            ${admin
              ? `<label class="check"><input type="checkbox" data-traite="${r.id}" ${r.traite ? 'checked' : ''}> Traité</label>`
              : `<span class="badge ${r.traite ? 'ok' : 'line'}">${r.traite ? 'Traité' : 'Envoyé'}</span>`}
            ${!admin && !r.traite && r.auteur === profil.id ? `<button class="btn-txt" data-suppr="${r.id}">Retirer</button>` : ''}
          </div>
        </li>`).join('') || '<li><span class="empty">Aucun commentaire pour l’instant.</span></li>'}
      </ul>
    </section>`;

  const lecteur = await monterLecteur(document.getElementById('media'), lien, f.url);
  const form = document.getElementById('retour');
  const champTemps = document.getElementById('r_temps');

  // Vidéo : l'instant est capturé dès qu'on commence à écrire, et la vidéo se met en pause.
  if (champTemps) {
    const capturer = async () => {
      const t = await lecteur.getTime();
      if (t != null) { champTemps.value = fmtTemps(t); lecteur.pause?.(); }
    };
    form.contenu.addEventListener('focus', () => { if (lecteur.auto && !champTemps.dataset.manuel) capturer(); });
    champTemps.addEventListener('input', () => (champTemps.dataset.manuel = '1'));
    document.getElementById('r_maintenant').onclick = () => { delete champTemps.dataset.manuel; capturer(); };
    if (!lecteur.auto) document.getElementById('r_maintenant').hidden = true;
  }

  // Maquette : épingles existantes + épingle en cours.
  let pos = null;
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
      document.getElementById('pin-info').textContent = 'Endroit choisi ✓ Écrivez votre remarque.';
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
    const { error } = await sb.from('retours').insert(ligne);
    if (error) return alert(error.message);
    renderRevue(projetId, fichierId);
  };

  app.querySelectorAll('[data-seek]').forEach((b) => (b.onclick = () => {
    lecteur.seek(Number(b.dataset.seek));
    document.getElementById('media').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));

  app.querySelectorAll('[data-traite]').forEach((c) => (c.onchange = async () => {
    const { error } = await sb.from('retours').update({ traite: c.checked }).eq('id', c.dataset.traite);
    if (error) return alert(error.message);
    c.closest('li').classList.toggle('fait', c.checked);
  }));

  app.querySelectorAll('[data-suppr]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Retirer ce commentaire ?')) return;
    const { error } = await sb.from('retours').delete().eq('id', b.dataset.suppr);
    if (error) return alert(error.message);
    renderRevue(projetId, fichierId);
  }));

  const valider = document.getElementById('valider');
  if (valider) valider.onclick = async () => {
    if (!confirm('Valider cette version ? Mackerprod sera prévenu.')) return;
    const { error } = await sb.from('retours').insert({ fichier_id: fichierId, projet_id: projetId, type: 'validation' });
    if (error) return alert(error.message);
    renderRevue(projetId, fichierId);
  };
}

// Export complet du dossier (étape 4) -------------------------------------------
// Le client récupère tout en un fichier lisible hors ligne : rien n'est enfermé ici.

async function exporterDossier(clientId) {
  const [{ data: c, error }, { data: projets }] = await Promise.all([
    sb.from('clients').select('*').eq('id', clientId).single(),
    sb.from('projets').select('*, etapes(*), lancements(*), fichiers(*), messages(*), retours(*)').eq('client_id', clientId).order('created_at'),
  ]);
  if (error) return alert(error.message);
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
