import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AVIS_GOOGLE_URL } from './config.js';
import { SERVICES, EQUIPE, serviceDe } from './services.js';

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
logoutBtn.onclick = () => sb.auth.signOut();

async function demarrer(session) {
  logoutBtn.hidden = !session;
  profil = null;
  const partage = location.hash.match(/^#\/partage\/([0-9a-f-]{36})$/);
  if (!session) return partage ? renderPartage(partage[1]) : renderLogin();

  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) return showError(error);
  profil = data;
  who.textContent = profil.role === 'admin' ? 'Administration' : profil.email;
  router();
}

function router() {
  window.scrollTo(0, 0);
  const pt = location.hash.match(/^#\/partage\/([0-9a-f-]{36})$/);
  if (pt) return renderPartage(pt[1]);
  const lv = location.hash.match(/^#\/projet\/([0-9a-f-]{36})\/livraison$/);
  if (lv) return renderLivraison(lv[1]);
  const r = location.hash.match(/^#\/projet\/([0-9a-f-]{36})\/revue\/([0-9a-f-]{36})$/);
  if (r) return renderRevue(r[1], r[2]);
  const m = location.hash.match(/^#\/projet\/([0-9a-f-]{36})(?:\/(\w+))?$/);
  if (m) return renderProjet(m[1], m[2]);
  const fc = location.hash.match(/^#\/client\/([0-9a-f-]{36})$/);
  if (fc && profil.role === 'admin') return renderFicheClient(fc[1]);
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
    sb.from('fichiers').select('id, projet_id, titre, categorie, par_admin, livrable'),
    sb.from('retours').select('fichier_id, type'),
  ]);
  if (error) return showError(error);
  const { data: demandes } = await sb.from('demandes').select('*').order('created_at', { ascending: false });

  // Ce que le client doit faire maintenant, du plus important au moins important.
  const todo = [];
  for (const p of projets ?? []) {
    if ((fichiers ?? []).some((x) => x.projet_id === p.id && x.livrable)) {
      todo.unshift({ href: `#/projet/${p.id}/livraison`, titre: serviceDe(p).livraison, sub: `${p.titre} · découvrez votre livraison` });
    }
    for (const f of (fichiers ?? []).filter((x) => x.projet_id === p.id && x.par_admin && REVUE.includes(x.categorie) && !x.livrable)) {
      if (!(retours ?? []).some((r) => r.fichier_id === f.id && r.type === 'validation')) {
        todo.push({ href: `#/projet/${p.id}/revue/${f.id}`, titre: `Donner votre avis sur « ${f.titre} »`, sub: `${p.titre} · commentez puis validez` });
      }
    }
    if (p.prochain_rdv && p.prochain_rdv >= aujourdhui()) {
      todo.push({ href: `#/projet/${p.id}`, titre: `${p.prochain_rdv_note || 'Prochain rendez-vous'} · ${jourFr(p.prochain_rdv)}`, sub: `${p.titre} · on se retrouve bientôt` });
    }
    const m = dernierMessage(messages, p.id);
    if (m?.par_admin) todo.push({ href: `#/projet/${p.id}/messages`, titre: 'Nouveau message de Mackerprod', sub: `${p.titre} · ${dateFr(m.created_at)}` });
    const e = etapeCourante(p.etapes);
    const lanc = (lancements ?? []).find((l) => l.projet_id === p.id);
    if (e && e.numero >= 3 && !Object.values(lanc?.reponses ?? {}).some(rempli)) {
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

  app.innerHTML = `
    <p class="label rule">Espace client</p>
    <h1 class="h-l">Bonjour <em>${esc((fiche.nom || '').split(' ')[0] || '')}</em></h1>
    <p class="lead">Bienvenue chez Mackerprod. Ici, vous suivez votre projet de la première rencontre jusqu’aux souvenirs : chaque étape, vos échanges avec nous, vos films et vos photos. Une seule adresse, une seule équipe.</p>

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

    <section class="section">
      <p class="label">Votre équipe</p>
      <p class="panel-intro">Avant de parler caméras, on parle de vous. Voici les personnes qui vous accompagnent.</p>
      ${equipeHtml([...new Set((projets ?? []).flatMap((p) => serviceDe(p).equipe))].length ? [...new Set((projets ?? []).flatMap((p) => serviceDe(p).equipe))] : Object.keys(EQUIPE))}
    </section>

    ${apresHtml}

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
  app.querySelectorAll('form.demande').forEach((f) => (f.onsubmit = async (ev) => {
    ev.preventDefault();
    const { choix, ...details } = Object.fromEntries(new FormData(f));
    const type = choix || f.dataset.type;
    const { error } = await sb.from('demandes').insert({ client_id: clientId, projet_id: livres.at(-1)?.id ?? null, type, details });
    if (error) return alert(error.message);
    renderClient(clientId);
  }));
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
  const reponses = { ...(lancement?.reponses ?? {}) };
  const coches = new Set(reponses._guide ?? []);
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
    <p class="label rule" style="margin-top:28px">${esc(svc.label)}${admin ? ` · <a href="#/client/${p.client_id}">${esc(nomClient)}${p.clients?.entreprise ? ' · ' + esc(p.clients.entreprise) : ''}</a>` : ''}</p>
    <h1 class="h-l">${esc(p.titre)}</h1>

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
            const suivante = fini ? null : e?.numero < 7 ? svc.etapes[e.numero + 1]?.titre : 'Projet terminé';
            return fini ? '<p class="quand">Toutes les étapes sont terminées.</p>' : `<div class="form-foot avancer">
              <button class="btn" data-aller="${e.numero + 1}">${e.numero < 7 ? `Étape suivante : ${esc(suivante)} →` : 'Terminer le projet ✓'}</button>
              <span class="muted small">Le client est prévenu par e-mail.</span></div>`;
          })() : ''}
          ${admin ? '' : `<p class="attendu">De votre côté : ${esc(info.attendu)}${info.onglet ? ` <a href="#/projet/${id}/${info.onglet}">C’est ici →</a>` : ''}</p>`}
        </div>
      </div>
      ${!admin && p.prochain_rdv && p.prochain_rdv >= aujourdhui() ? `<div class="rdv"><p class="label bronze">Prochain rendez-vous</p>
        <p class="h-m">${esc(p.prochain_rdv_note || 'On se retrouve')} <em>${esc(jourFr(p.prochain_rdv))}</em></p></div>` : ''}
      <div class="section" style="margin-top:40px">
        <p class="label">Les 7 étapes${admin ? ' · « Passer ici » déplace le projet, les dates se règlent dessous' : ''}</p>
        ${parcoursHtml(p, admin)}
      </div>
      <div class="section guide-wrap">
        <div>
          <p class="label">${svc.cible === 'particulier' ? 'Pour que tout soit parfait' : 'Votre guide de préparation'}</p>
          <p class="panel-intro">${admin ? 'Ce que le client coche de son côté.' : 'Cochez au fur et à mesure : on voit votre avancement de notre côté aussi.'}</p>
          <ul class="guide">${svc.guide.map((g, i) => `<li><label class="check"><input type="checkbox" data-guide="${i}" ${coches.has(i) ? 'checked' : ''} ${admin ? 'disabled' : ''}> <span>${esc(g)}</span></label></li>`).join('')}</ul>
          <p class="muted small" id="guide-compte">${coches.size} / ${svc.guide.length} prêt${coches.size > 1 ? 's' : ''}</p>
        </div>
        <div>
          <p class="label">Votre équipe</p>
          ${equipeHtml(svc.equipe)}
        </div>
      </div>
      ${admin && p.clients ? `<div class="section"><p class="label">Contact</p>
        <p>${esc(nomClient)} · <a href="mailto:${esc(p.clients.email)}">${esc(p.clients.email)}</a>${p.clients.telephone ? ` · <a href="tel:${esc(p.clients.telephone)}">${esc(p.clients.telephone)}</a>` : ''}</p>
        <div class="form-foot"><button class="btn btn-line btn-sm" id="exporter">Exporter le dossier du client</button></div></div>
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
          ${admin ? `<label class="check livrable"><input type="checkbox" data-livrable="${f.id}" ${f.livrable ? 'checked' : ''}> Livrable final</label>` : f.livrable ? '<span class="badge ok">Livré</span>' : ''}
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

  const motForm = document.getElementById('mot-livraison');
  if (motForm) bindForm('mot-livraison', ({ mot }) => sb.from('projets').update({ mot_livraison: mot || null }).eq('id', id));
  if (document.getElementById('prochain-rdv')) bindForm('prochain-rdv', ({ prochain_rdv, prochain_rdv_note }) =>
    sb.from('projets').update({ prochain_rdv: prochain_rdv || null, prochain_rdv_note: prochain_rdv_note || null }).eq('id', id));
  app.querySelectorAll('[data-livrable]').forEach((c) => (c.onchange = async () => {
    const { error } = await sb.from('fichiers').update({ livrable: c.checked }).eq('id', c.dataset.livrable);
    if (error) return alert(error.message);
    renderProjet(id, 'fichiers');
  }));
  const changerType = document.getElementById('changer-type');
  if (changerType) changerType.onchange = async () => {
    const { error } = await sb.from('projets').update({ type: changerType.value }).eq('id', id);
    if (error) return alert(error.message);
    renderProjet(id, 'avancement');
  };
  if (admin && document.getElementById('exporter')) document.getElementById('exporter').onclick = () => exporterDossier(p.client_id);
  if (admin) {
    app.querySelectorAll('[data-aller]').forEach((b) => (b.onclick = async (ev) => {
      ev.preventDefault();
      const { error } = await sb.rpc('aller_etape', { p: id, n: Number(b.dataset.aller) });
      if (error) return alert(error.message);
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
    if (error) alert(error.message);
  }));

  app.querySelectorAll('.date-etape').forEach((d) => (d.onchange = async () => {
    const { error } = await sb.from('etapes').update({ date_prevue: d.value || null })
      .eq('projet_id', d.dataset.projet).eq('numero', Number(d.dataset.numero));
    if (error) alert(error.message);
  }));

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

async function renderAdmin() {
  const [{ data: clients, error }, { data: messages }, { data: retours }, { data: demandes }, { data: livrables }] = await Promise.all([
    sb.from('clients').select('*, projets(*, etapes(*))').order('created_at', { ascending: false }),
    sb.from('messages').select('projet_id, par_admin, created_at').order('created_at', { ascending: false }).limit(500),
    sb.from('retours').select('projet_id, fichier_id').eq('traite', false),
    sb.from('demandes').select('*, clients(nom, email), projets(titre)').eq('traitee', false).order('created_at'),
    sb.from('fichiers').select('projet_id').eq('livrable', true),
  ]);
  if (error) return showError(error);

  const lignes = (clients ?? []).flatMap((c) => (c.projets ?? []).map((p) => {
    const m = dernierMessage(messages, p.id);
    return { c, p, e: etapeCourante(p.etapes), m, aRepondre: m && !m.par_admin,
      retours: (retours ?? []).filter((r) => r.projet_id === p.id).length,
      livre: (livrables ?? []).some((f) => f.projet_id === p.id) };
  }));

  // Ce qui attend l'équipe, du plus urgent au moins urgent.
  const prio = [
    ...lignes.filter((l) => l.aRepondre).map((l) => ({ tag: 'Message', href: `#/projet/${l.p.id}/messages`,
      titre: `Répondre à ${l.c.nom || l.c.email}`, sub: `${l.p.titre} · ${dateFr(l.m.created_at)}` })),
    ...lignes.filter((l) => l.retours).map((l) => ({ tag: 'Retours', href: `#/projet/${l.p.id}/fichiers`,
      titre: `${l.retours} retour${l.retours > 1 ? 's' : ''} à traiter`, sub: `${l.c.nom || l.c.email} · ${l.p.titre}` })),
    ...(demandes ?? []).map((x) => ({ tag: DEMANDES[x.type], demande: x.id, href: `#/client/${x.client_id}`,
      titre: `${x.clients?.nom || x.clients?.email}${x.type === 'parrainage' ? ` recommande ${x.details?.nom || 'un proche'}` : x.type === 'nouveau_projet' ? ' a un nouveau projet' : ' souhaite ' + (x.type === 'album' ? 'un album' : 'des tirages')}`,
      sub: [x.details?.contact, x.details?.message].filter(Boolean).join(' · ') || dateFr(x.created_at) })),
  ];
  const avenir = aVenir(lignes);
  const heure = new Date().getHours();
  const auj = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  app.innerHTML = `
    <p class="label rule">L’atelier Mackerprod · ${esc(auj)}</p>
    <h1 class="h-l">${heure < 18 ? 'Bonjour' : 'Bonsoir'}, <em>l’équipe</em></h1>
    <p class="lead">${prio.length ? `${prio.length} chose${prio.length > 1 ? 's' : ''} vous attend${prio.length > 1 ? 'ent' : ''}` : 'Rien d’urgent'}, ${lignes.filter((l) => l.e?.numero < 6).length} projet${lignes.filter((l) => l.e?.numero < 6).length > 1 ? 's' : ''} en production et ${avenir.length} rendez-vous dans les 30 jours.</p>

    <div class="admin-haut section">
      <section>
        <p class="label ${prio.length ? 'red' : ''}">À faire</p>
        <div class="todo">${prio.length ? prio.map((t) => `
          <div class="prio"><a href="${t.href}"><span class="tag">${esc(t.tag)}</span>
            <span><strong>${esc(t.titre)}</strong><span class="sub">${esc(t.sub)}</span></span></a>
            ${t.demande ? `<button class="btn btn-line btn-sm" data-traitee="${t.demande}">Traitée</button>` : '<span class="go">→</span>'}</div>`).join('')
          : '<div><span class="num ok">✓</span><span><strong>Tout est à jour</strong><span class="sub">Aucun message, retour ou demande en attente.</span></span></div>'}
        </div>
      </section>
      <section>
        <p class="label">Agenda · 30 jours</p>
        <div class="agenda">${avenir.length ? avenir.map((a) => `
          <a href="#/projet/${a.p.id}"><span class="jour"><b>${Number(a.d.slice(8))}</b>${new Date(a.d + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short' })}</span>
            <span><strong>${esc(a.quoi)}</strong><span class="sub">${esc(a.c.nom || a.c.email)} · ${esc(a.p.titre)}</span></span></a>`).join('')
          : '<p class="empty">Aucune date prévue. Fixez les dates dans chaque projet.</p>'}</div>
      </section>
    </div>

    <section class="section">
      <p class="label">L’atelier</p>
      ${lignes.length ? `<div class="atelier">${PHASES.map(([titre, nums]) => {
        const items = lignes.filter((l) => nums.includes(l.e?.numero));
        return `<div class="colonne"><p class="col-titre">${titre}<span>${items.length}</span></p>
          ${items.map(({ c, p, e, aRepondre, retours: nr, livre }) => {
            const date = e?.date_prevue && e.statut !== 'termine' ? e.date_prevue : p.prochain_rdv;
            return `<a class="carte-projet ${aRepondre || nr ? 'alerte' : ''}" href="#/projet/${p.id}">
              <span class="label bronze">${esc(serviceDe(p).label)}</span>
              <strong>${esc(p.titre)}</strong>
              <span class="qui"><i>${esc(initiales(c))}</i>${esc(c.nom || c.email)}</span>
              <span class="etat">${e ? `${e.numero}. ${esc(serviceDe(p).etapes[e.numero]?.titre)}` : ''}${date ? ` · ${esc(jourCourt(date))}` : ''}</span>
              <span class="badges">${aRepondre ? '<span class="badge red">À répondre</span>' : ''}${nr ? `<span class="badge line">${nr} retour${nr > 1 ? 's' : ''}</span>` : ''}${livre ? '<span class="badge ok">Livré</span>' : ''}</span>
            </a>`;
          }).join('') || '<p class="vide">—</p>'}
        </div>`;
      }).join('')}</div>` : '<p class="empty">Aucun projet pour l’instant. Créez votre premier client ci-dessous.</p>'}
    </section>

    <section class="section">
      <p class="label">Clients</p>
      <div class="clients">${(clients ?? []).map((c) => {
        const derniers = (messages ?? []).filter((m) => (c.projets ?? []).some((p) => p.id === m.projet_id));
        return `<a class="carte-client" href="#/client/${c.id}"><i>${esc(initiales(c))}</i>
          <span><strong>${esc(c.nom || c.email)}</strong><span class="sub">${esc(c.entreprise || c.email)}</span>
          <span class="sub">${c.projets?.length ?? 0} projet${(c.projets?.length ?? 0) > 1 ? 's' : ''}${derniers[0] ? ` · actif ${dateFr(derniers[0].created_at)}` : ''}</span></span></a>`;
      }).join('')}</div>
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
            <div><label for="n_type">Prestation</label><select id="n_type" name="type">${optionsServices()}</select></div>
          </div>
          <div class="form-foot"><button class="btn">Créer le client</button></div>
        </form>
      </details>
    </section>`;

  app.querySelectorAll('[data-traitee]').forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from('demandes').update({ traitee: true }).eq('id', b.dataset.traitee);
    if (error) return alert(error.message);
    renderAdmin();
  }));
  document.getElementById('nouveau').onsubmit = async (ev) => {
    ev.preventDefault();
    const { email, nom, entreprise, projet, type } = Object.fromEntries(new FormData(ev.target));
    const { data: c, error } = await sb.from('clients').insert({ email, nom, entreprise }).select().single();
    if (error) return alert(error.message);
    if (projet) await sb.from('projets').insert({ client_id: c.id, titre: projet, type });
    location.hash = `#/client/${c.id}`;
  };
}

// Fiche client (admin) : tout sur une personne, en une page ------------------------
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

  // Historique : tout ce qui s'est passé, le plus récent en haut.
  const fil = [
    ...(messages ?? []).map((m) => ({ d: m.created_at, tag: 'Message', qui: m.par_admin ? 'Mackerprod' : 'Client', txt: m.contenu, href: `#/projet/${m.projet_id}/messages`, pid: m.projet_id })),
    // Fichiers ajoutés ensemble (même projet, même heure) : une seule ligne.
    ...Object.values((fichiers ?? []).reduce((g, f) => {
      const k = `${f.projet_id}|${f.livrable}|${f.par_admin}|${f.created_at.slice(0, 13)}`;
      (g[k] ??= []).push(f);
      return g;
    }, {})).map((fs) => ({ d: fs[0].created_at, tag: fs[0].livrable ? 'Livraison' : 'Fichier', qui: fs[0].par_admin ? 'Mackerprod' : 'Client',
      txt: fs.length > 1 ? `${fs.length} fichiers : ${fs.map((f) => f.titre).join(', ')}` : fs[0].titre,
      href: fs[0].livrable ? `#/projet/${fs[0].projet_id}/livraison` : `#/projet/${fs[0].projet_id}/fichiers`, pid: fs[0].projet_id })),
    ...(retours ?? []).filter((r) => !r.par_admin).map((r) => ({ d: r.created_at, tag: r.type === 'validation' ? 'Validation' : 'Retour', qui: 'Client', txt: r.type === 'validation' ? 'Version validée' : r.contenu, href: `#/projet/${r.projet_id}/revue/${r.fichier_id}`, pid: r.projet_id })),
    ...(demandes ?? []).map((x) => ({ d: x.created_at, tag: DEMANDES[x.type], qui: 'Client', txt: [x.details?.nom, x.details?.message].filter(Boolean).join(' · '), href: '', pid: x.projet_id })),
  ].sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 25);
  const depuis = new Date(c.created_at || Date.now()).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  app.innerHTML = `
    <a class="back" href="#/">← Tableau de bord</a>
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
        </div>
      </div>
    </div>

    <div class="fiche-grille">
      <div>
        <section class="section">
          <p class="label">Projets</p>
          <div class="projets">${projets.map((p) => `
            <a class="projet" href="#/projet/${p.id}">
              <div class="projet-top"><div><p class="label bronze">${esc(serviceDe(p).label)}</p><h2 class="h-m">${esc(p.titre)}</h2></div><span class="ouvrir">Ouvrir →</span></div>
              ${parcoursHtml(p)}
            </a>`).join('') || '<p class="empty">Aucun projet.</p>'}
          </div>
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
          <p class="label">Historique</p>
          <ol class="historique">${fil.map((h) => `<li>
            <span class="quand">${dateFr(h.d)}</span>
            <div><span class="tag">${esc(h.tag)}</span> <b>${esc(h.qui)}</b>${h.pid ? ` <span class="muted small">· ${esc(titre(h.pid))}</span>` : ''}
              <p>${h.href ? `<a href="${h.href}">${esc((h.txt || '').slice(0, 220))}</a>` : esc((h.txt || '').slice(0, 220))}</p></div></li>`).join('')
            || '<li><span class="empty">Rien pour l’instant.</span></li>'}</ol>
        </section>
      </div>

      <aside>
        <section class="section">
          <p class="label">Note interne</p>
          <form id="note-interne" class="card note">
            <textarea name="texte" rows="6" placeholder="Ce qu’il faut savoir : ses préférences, comment il nous a connus, le prénom de ses enfants…">${esc(note?.texte)}</textarea>
            <div class="form-foot"><button class="btn btn-line btn-sm">Enregistrer</button><span class="msg" role="status"></span></div>
            <p class="muted small">Visible uniquement par l’équipe Mackerprod.</p>
          </form>
        </section>
        ${(demandes ?? []).length ? `<section class="section">
          <p class="label">Demandes</p>
          <ul class="demandes">${demandes.map((x) => `<li><span class="tag">${DEMANDES[x.type]}</span>
            <span>${esc(x.details?.nom || x.details?.message || '')}</span>
            ${x.traitee ? '<span class="badge ok">Traitée</span>' : `<button class="btn btn-line btn-sm" data-traitee="${x.id}">Traitée</button>`}</li>`).join('')}</ul>
        </section>` : ''}
        <section class="section">
          <p class="label">Coordonnées</p>
          <p class="small"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>
          ${formHtml('fiche', CHAMPS_FICHE, c, ['notes', 'Remarques du client'])}
        </section>
      </aside>
    </div>`;

  document.getElementById('exporter').onclick = () => exporterDossier(id);
  bindForm('note-interne', ({ texte }) => sb.from('notes_internes').upsert({ client_id: id, texte }));
  bindForm('fiche', (maj) => sb.from('clients').update(maj).eq('id', id));
  app.querySelectorAll('[data-traitee]').forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from('demandes').update({ traitee: true }).eq('id', b.dataset.traitee);
    if (error) return alert(error.message);
    renderFicheClient(id);
  }));
  document.getElementById('ajout-projet').onsubmit = async (ev) => {
    ev.preventDefault();
    const { data: p, error } = await sb.from('projets').insert({ client_id: id, ...Object.fromEntries(new FormData(ev.target)) }).select().single();
    if (error) return alert(error.message);
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
    zone.innerHTML = '<div class="ratio"><div class="yt-cible"></div></div>';
    await chargerScript('https://www.youtube.com/iframe_api');
    await new Promise((ok) => (window.YT?.Player ? ok() : (window.onYouTubeIframeAPIReady = ok)));
    const player = await new Promise((ok) => {
      const pl = new YT.Player(zone.querySelector('.yt-cible'), { videoId: lien.id, playerVars: { rel: 0 }, events: { onReady: () => ok(pl) } });
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

// Livraison (expérience 2) -----------------------------------------------------
// Une vraie page de remise : mot de l'équipe, films lisibles sur place, photos, téléchargements,
// et un lien de partage pour les proches, sans compte.

const estImageUrl = (u) => /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(u);

function livraisonHtml(d, { prive = false } = {}) {
  const svc = SERVICES[d.type] ?? SERVICES.site_web;
  const videos = d.fichiers.filter((f) => f.categorie === 'video');
  const images = d.fichiers.filter((f) => f.categorie !== 'video' && estImageUrl(f.url));
  const autres = d.fichiers.filter((f) => f.categorie !== 'video' && !estImageUrl(f.url));
  return `
    <section class="livraison-hero">
      <p class="label rule">${esc(svc.label)}</p>
      <h1 class="h-l">${esc(svc.livraison).replace(/^(\S+)/, '$1')} <span class="sous">${esc(d.titre)}</span></h1>
      ${d.mot ? `<blockquote class="mot">${esc(d.mot).replace(/\n/g, '<br>')}<cite>L’équipe Mackerprod</cite></blockquote>` : ''}
    </section>
    ${videos.map((f, i) => `<section class="section"><p class="label">${esc(f.titre)}</p><div class="lecteur" data-video="${i}"></div>
      <p class="small" style="margin-top:10px"><a href="${esc(f.url)}" target="_blank" rel="noopener">Ouvrir ou télécharger →</a></p></section>`).join('')}
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
  const admin = profil.role === 'admin';
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
    if (error) return alert(error.message);
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
