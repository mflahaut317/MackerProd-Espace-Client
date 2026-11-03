-- Étape 4 (1/2) : file d'attente des alertes e-mail.
-- Chaque événement important ajoute une ligne ici. La fonction « envoyer-notifications »
-- les regroupe par destinataire et les envoie toutes les 5 minutes (voir 04_etape4_cron.sql).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  destinataire text not null,
  projet_id uuid references public.projets(id) on delete cascade,
  sujet text not null,
  texte text not null,
  lien text,
  created_at timestamptz not null default now(),
  envoye_le timestamptz,
  erreur text
);
create index on public.notifications (created_at) where envoye_le is null;
-- Aucune règle d'accès : personne ne peut lire cette table depuis le site, seul le serveur y accède.
alter table public.notifications enable row level security;

alter table public.messages add column if not exists rappel_envoye boolean not null default false;

-- Adresse publique de l'espace client, utilisée pour les liens dans les e-mails.
create or replace function public.url_app() returns text language sql immutable set search_path = public as $$
  select 'https://mackerprod-espace-client.mflahaut317.workers.dev/'
$$;

-- Ajoute une alerte pour le client du projet.
create or replace function public.alerter_client(p uuid, sujet text, texte text, chemin text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (destinataire, projet_id, sujet, texte, lien)
  select c.email, p, sujet, texte, url_app() || chemin
  from projets pr join clients c on c.id = pr.client_id where pr.id = p;
$$;

-- Ajoute une alerte pour chaque compte admin (Maxence).
create or replace function public.alerter_admins(p uuid, sujet text, texte text, chemin text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (destinataire, projet_id, sujet, texte, lien)
  select pf.email, p, sujet, texte, url_app() || chemin
  from profiles pf where pf.role = 'admin';
$$;

create or replace function public.nom_client_projet(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(c.nom, ''), c.email) || ' · ' || pr.titre
  from projets pr join clients c on c.id = pr.client_id where pr.id = p;
$$;

-- Nouveau message
create or replace function public.alerte_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titre text := (select titre from projets where id = new.projet_id);
begin
  if new.par_admin then
    perform alerter_client(new.projet_id, 'Nouveau message de Mackerprod',
      'Projet « ' || titre || ' » : ' || left(new.contenu, 400), '#/projet/' || new.projet_id || '/messages');
  else
    perform alerter_admins(new.projet_id, 'Message client',
      nom_client_projet(new.projet_id) || ' : ' || left(new.contenu, 400), '#/projet/' || new.projet_id || '/messages');
  end if;
  return new;
end;
$$;
create trigger messages_alerte after insert on public.messages
  for each row execute function public.alerte_message();

-- Nouveau retour ou validation sur une vidéo / maquette
create or replace function public.alerte_retour() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fichier text := (select titre from fichiers where id = new.fichier_id);
  chemin text := '#/projet/' || new.projet_id || '/revue/' || new.fichier_id;
begin
  if new.par_admin then return new; end if;
  if new.type = 'validation' then
    perform alerter_admins(new.projet_id, 'Version validée',
      nom_client_projet(new.projet_id) || ' a validé « ' || fichier || ' ».', chemin);
  else
    perform alerter_admins(new.projet_id, 'Nouveau retour client',
      nom_client_projet(new.projet_id) || ' sur « ' || fichier || ' »'
      || coalesce(' à ' || to_char(make_interval(secs => new.temps_sec), 'MI:SS'), '')
      || ' : ' || left(new.contenu, 400), chemin);
  end if;
  return new;
end;
$$;
create trigger retours_alerte after insert on public.retours
  for each row execute function public.alerte_retour();

-- Nouvelle vidéo ou maquette à valider, déposée par Mackerprod
create or replace function public.alerte_fichier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.par_admin and new.categorie in ('video', 'maquette') then
    perform alerter_client(new.projet_id, 'Nouvelle version à valider',
      '« ' || new.titre || ' » est prête. Vous pouvez la commenter et la valider en ligne.',
      '#/projet/' || new.projet_id || '/revue/' || new.id);
  end if;
  return new;
end;
$$;
create trigger fichiers_alerte after insert on public.fichiers
  for each row execute function public.alerte_fichier();

-- Le projet passe à une nouvelle étape
create or replace function public.alerte_etape() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'en_cours' and old.statut <> 'en_cours' then
    perform alerter_client(new.projet_id, 'Votre projet avance',
      'Projet « ' || (select titre from projets where id = new.projet_id) || ' » : étape '
      || new.numero || ', ' || (select libelle from etapes_ref where numero = new.numero) || '.',
      '#/projet/' || new.projet_id);
  end if;
  return new;
end;
$$;
create trigger etapes_alerte after update of statut on public.etapes
  for each row execute function public.alerte_etape();

-- Rappel : un message client attend une réponse depuis plus de 20 h (réponse promise sous 24 h ouvrées).
create or replace function public.rappels_24h() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  m record;
begin
  for m in
    select distinct on (projet_id) id, projet_id, par_admin, created_at, rappel_envoye
    from messages order by projet_id, created_at desc
  loop
    if not m.par_admin and not m.rappel_envoye and m.created_at < now() - interval '20 hours' then
      perform alerter_admins(m.projet_id, 'Rappel : réponse attendue',
        nom_client_projet(m.projet_id) || ' attend une réponse depuis le '
        || to_char(m.created_at at time zone 'Europe/Paris', 'DD/MM à HH24:MI') || '.',
        '#/projet/' || m.projet_id || '/messages');
      update messages set rappel_envoye = true where id = m.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.rappels_24h() from public, anon, authenticated;

-- Ces fonctions ne doivent jamais être appelables depuis le site (sinon envoi d'e-mails à volonté).
revoke execute on function public.alerter_client(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.alerter_admins(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.nom_client_projet(uuid) from public, anon, authenticated;
