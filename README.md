# Espace client Macker Prod

Un seul lieu pour chaque client : sa fiche, ses projets et l'avancement des 7 étapes.
100 % gratuit : site statique + Supabase (offre gratuite).

## Installation (environ 15 minutes)

### 1. Supabase
1. Crée un compte sur https://supabase.com puis **New project** (région : Paris / eu-west-3).
2. Ouvre **SQL Editor > New query**, colle le contenu de `supabase/schema.sql`, puis **Run**.
   Fais de même avec `supabase/02_etape2.sql` (messages, fichiers, fiche de lancement)
   puis `supabase/03_etape3.sql` (commentaires horodatés et validation),
   `supabase/04_etape4_alertes.sql`, `supabase/04_etape4_cron.sql` et `supabase/05_securite.sql`,
   puis les fichiers suivants dans l'ordre jusqu'à `supabase/11_script_versions.sql` (scripts et versions).
   (Déjà fait sur le projet Mackerprod.)
3. Dans **Project Settings > API**, copie la *Project URL* et la clé *anon public* dans `config.js`.
4. Dans **Authentication > URL Configuration**, mets l'adresse de ton site dans *Site URL*
   et ajoute-la dans *Redirect URLs* (ex. `https://espace.mackerprod.fr/`).

### 2. Hébergement (Cloudflare Pages, gratuit)
1. Tableau de bord Cloudflare : **Create app > Pages > Import an existing Git repository**, choisis ce dépôt.
2. Aucun build : *Framework preset* = None, *Build command* et *Build output directory* vides.
3. Optionnel : ajoute un sous-domaine, par exemple `espace.mackerprod.fr`.

### 3. Te donner le rôle admin
1. Connecte-toi une fois sur le site avec ton e-mail (lien magique).
2. Dans Supabase **SQL Editor**, lance :
   `update public.profiles set role = 'admin' where email = 'ton@email.fr';`
3. Recharge la page : tu vois le tableau de bord.

## Utilisation
- **Toi** : tu crées un client avec son e-mail et un premier projet. Les 7 étapes sont créées
  automatiquement. Tu changes le statut de chaque étape depuis le tableau de bord.
- **Le client** : il va sur le site, saisit son e-mail, clique sur le lien reçu.
  Il voit ses projets et remplit sa fiche une seule fois.
- **Dans chaque projet** : les 7 étapes, un fil de messages, les liens vers les fichiers et vidéos,
  et la fiche de lancement. Sur ton tableau de bord, un projet affiche « Message client en attente »
  tant que tu n'as pas répondu.
- **Revue vidéo et maquette** : sur un fichier de type Vidéo ou Maquette, le client clique sur
  « Commenter et valider ». Vidéo (YouTube, Vimeo, MP4) : l'instant est noté tout seul quand il écrit,
  et un clic sur l'instant y ramène la vidéo. Vidéo Google Drive : il note l'instant à la main.
  Maquette (image PNG/JPG/WebP ou image Drive) : il clique à l'endroit voulu, une épingle numérotée s'affiche.
  Tu coches « Traité » sur chaque retour ; le client peut valider la version.
- **Export** : le client télécharge tout son dossier (coordonnées, projets, liens, échanges, validations)
  en un fichier lisible hors ligne. Tu peux aussi l'exporter depuis la page projet.
- **Livraison** : dans l'onglet Fichiers, coche « Livrable final » sur les fichiers à remettre, et écris
  « Le mot de l'équipe » dans l'onglet Avancement. Le client reçoit « Votre livraison est prête » et
  voit une page soignée (films, galerie photo, fichiers). Il peut créer un lien de partage pour ses proches,
  sans compte, et le couper à tout moment.
- **Après-vente** : une fois le projet livré, le client voit « Et après ? » : parrainer un proche,
  commander des tirages ou un album (mariage, événement, séance photo), proposer un nouveau projet.
  Chaque demande t'arrive par e-mail et s'affiche en haut de ton tableau de bord (bouton « Traitée »).
  Sur la page projet, fixe un **prochain rendez-vous** (ex. prochain tournage Frame²) : le client le voit,
  et vous recevez tous les deux un rappel 7 jours avant. Chaque matin, l'espace envoie aussi la demande
  d'avis Google (3 jours après la livraison) et les vœux d'anniversaire de mariage (date du jour J, étape 4).
  Ton tableau de bord liste les rendez-vous et anniversaires des 30 prochains jours.
  Pour le bouton d'avis Google, colle ton lien « Demander des avis » dans `AVIS_GOOGLE_URL` (config.js).

### 4. Alertes e-mail (Resend, gratuit jusqu'à 3 000 e-mails/mois)
Chaque événement (message, retour sur vidéo/maquette, validation, nouvelle version, étape suivante)
est mis en file d'attente. Toutes les 5 minutes, la fonction `envoyer-notifications` envoie un e-mail
par destinataire qui regroupe tout. Si un message client attend depuis 20 h, tu reçois un rappel.
1. Crée un compte sur https://resend.com et ajoute ton domaine (ex. `mackerprod.fr`) dans **Domains** :
   copie les enregistrements DNS chez ton hébergeur de domaine, puis attends la vérification.
2. Crée une clé dans **API Keys**.
3. Dans Supabase **Edge Functions > Secrets**, ajoute `RESEND_API_KEY` (la clé) et
   `EMAIL_FROM` (ex. `Mackerprod <notifications@mackerprod.fr>`).
Tant que la clé n'est pas là, les alertes restent en attente et partiront dès qu'elle sera ajoutée.

## Limites de l'offre gratuite Supabase à connaître
- Un projet inactif pendant 7 jours est mis en pause. Il se relance en un clic depuis le tableau de bord Supabase.
- L'envoi d'e-mails intégré est limité à quelques messages par heure. Pour de vrais clients,
  branche un SMTP gratuit (Brevo, Resend) dans **Authentication > SMTP Settings**.
- Stockage limité à 1 Go : les vidéos passeront par des liens (Vimeo, YouTube non répertorié, Drive).

## Fichiers
- `index.html`, `style.css`, `app.js` : l'application.
- `config.js` : tes clés Supabase.
- `supabase/schema.sql` : tables, 7 étapes automatiques et droits d'accès (chaque client ne voit que son dossier).
- `supabase/02_etape2.sql` : fiche de lancement, fichiers (liens) et messages.
- `supabase/03_etape3.sql` : retours horodatés ou épinglés, et validation.
- `supabase/04_etape4_*.sql`, `supabase/functions/envoyer-notifications/` : alertes e-mail et rappel 20 h.
- `supabase/05_securite.sql` : durcissement des droits sur les fonctions.
