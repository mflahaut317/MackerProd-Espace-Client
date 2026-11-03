-- Prestations Mackerprod : chaque projet a un type, avec ses propres étapes et sa fiche.
-- Les textes complets sont dans services.js ; ici, seulement les noms d'étapes pour les e-mails.

alter table public.projets add column if not exists type text not null default 'site_web'
  check (type in ('corporate', 'immobilier', 'frame2', 'site_web', 'mariage', 'evenement', 'seance_photo'));

-- Réponses de la fiche de préparation, différentes selon la prestation.
alter table public.lancements add column if not exists reponses jsonb not null default '{}'::jsonb;

create table if not exists public.services_etapes (
  type text not null,
  numero int not null check (numero between 1 and 7),
  libelle text not null,
  primary key (type, numero)
);
alter table public.services_etapes enable row level security;
create policy "services_etapes: lecture" on public.services_etapes for select using (true);
insert into public.services_etapes (type, numero, libelle) values
  ('corporate', 1, 'Premier échange'),
  ('corporate', 2, 'Devis & signature'),
  ('corporate', 3, 'Préparation'),
  ('corporate', 4, 'Tournage'),
  ('corporate', 5, 'Montage'),
  ('corporate', 6, 'Livraison'),
  ('corporate', 7, 'Suivi'),
  ('immobilier', 1, 'Demande'),
  ('immobilier', 2, 'Devis & signature'),
  ('immobilier', 3, 'Préparation du bien'),
  ('immobilier', 4, 'Tournage & photos'),
  ('immobilier', 5, 'Montage & retouche'),
  ('immobilier', 6, 'Livraison'),
  ('immobilier', 7, 'Suivi'),
  ('frame2', 1, 'Premier échange'),
  ('frame2', 2, 'Pack & signature'),
  ('frame2', 3, 'Pré-production'),
  ('frame2', 4, 'Journée de tournage'),
  ('frame2', 5, 'Montage des contenus'),
  ('frame2', 6, 'Livraison & calendrier'),
  ('frame2', 7, 'Publication & suivi'),
  ('site_web', 1, 'Premier échange'),
  ('site_web', 2, 'Devis & signature'),
  ('site_web', 3, 'Contenus'),
  ('site_web', 4, 'Tournage & photos'),
  ('site_web', 5, 'Maquette & création'),
  ('site_web', 6, 'Mise en ligne'),
  ('site_web', 7, 'Suivi'),
  ('mariage', 1, 'Premier échange'),
  ('mariage', 2, 'Date réservée'),
  ('mariage', 3, 'Préparation'),
  ('mariage', 4, 'Le jour J'),
  ('mariage', 5, 'Montage & tri'),
  ('mariage', 6, 'Livraison'),
  ('mariage', 7, 'Souvenirs'),
  ('evenement', 1, 'Premier échange'),
  ('evenement', 2, 'Date réservée'),
  ('evenement', 3, 'Préparation'),
  ('evenement', 4, 'Le jour J'),
  ('evenement', 5, 'Montage & tri'),
  ('evenement', 6, 'Livraison'),
  ('evenement', 7, 'Souvenirs'),
  ('seance_photo', 1, 'Premier échange'),
  ('seance_photo', 2, 'Réservation'),
  ('seance_photo', 3, 'Préparation'),
  ('seance_photo', 4, 'La séance'),
  ('seance_photo', 5, 'Tri & retouche'),
  ('seance_photo', 6, 'Livraison'),
  ('seance_photo', 7, 'Souvenirs')
on conflict (type, numero) do update set libelle = excluded.libelle;

create or replace function public.alerte_etape() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'en_cours' and old.statut <> 'en_cours' then
    perform alerter_client(new.projet_id, 'Votre projet avance',
      'Projet « ' || (select titre from projets where id = new.projet_id) || ' » : étape '
      || new.numero || ', ' || coalesce(
        (select se.libelle from services_etapes se join projets p on p.type = se.type
          where p.id = new.projet_id and se.numero = new.numero),
        (select libelle from etapes_ref where numero = new.numero)) || '.',
      '#/projet/' || new.projet_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.alerte_etape() from public, anon, authenticated;
