# Espace client Macker Prod

Un seul lieu pour chaque client : sa fiche, ses projets et l'avancement des 7 étapes.
100 % gratuit : site statique + Supabase (offre gratuite).

## Installation (environ 15 minutes)

### 1. Supabase
1. Crée un compte sur https://supabase.com puis **New project** (région : Paris / eu-west-3).
2. Ouvre **SQL Editor > New query**, colle le contenu de `supabase/schema.sql`, puis **Run**.
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

## Limites de l'offre gratuite Supabase à connaître
- Un projet inactif pendant 7 jours est mis en pause. Il se relance en un clic depuis le tableau de bord Supabase.
- L'envoi d'e-mails intégré est limité à quelques messages par heure. Pour de vrais clients,
  branche un SMTP gratuit (Brevo, Resend) dans **Authentication > SMTP Settings**.
- Stockage limité à 1 Go : les vidéos passeront par des liens (Vimeo, YouTube non répertorié, Drive).

## Fichiers
- `index.html`, `style.css`, `app.js` : l'application.
- `config.js` : tes clés Supabase.
- `supabase/schema.sql` : tables, 7 étapes automatiques et droits d'accès (chaque client ne voit que son dossier).
