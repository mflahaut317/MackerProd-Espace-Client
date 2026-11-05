-- Planning automatique (2026-11-05)
-- L'équipe saisit une seule date : celle du tournage (étape 4 : tournage, jour J, séance).
-- Les dates de montage (étape 5) et de livraison (étape 6) se calculent toutes seules,
-- avec une file de montage : un projet à la fois par file (vidéo / photo), dans l'ordre
-- des dates de tournage. Deux prestations la même semaine : la 2e attend la 1re.
-- Une date saisie à la main sur l'étape 5 ou 6 est « forcée » et n'est plus recalculée.
-- Les étapes avancent seules : vidéo déposée par l'équipe -> Montage ; livrable coché -> Livraison.
-- Purement additif : nouvelle colonne, fonctions, déclencheurs et tâche planifiée.

alter table public.etapes add column if not exists date_forcee boolean not null default false;

-- Les dates déjà saisies à la main sur le montage et la livraison sont gardées telles quelles.
update public.etapes set date_forcee = true
  where numero in (5, 6) and date_prevue is not null and not date_forcee;

-- Temps de montage par prestation, en jours ouvrés, et file de travail.
-- (Mêmes valeurs que services.js : montage / file.)
create or replace function public.montage_jours(t text) returns int
language sql immutable as $$
  select case t
    when 'immobilier' then 2 when 'frame2' then 5 when 'corporate' then 10
    when 'site_web' then 15 when 'evenement' then 10 when 'mariage' then 30
    when 'seance_photo' then 5 else 10 end;
$$;
create or replace function public.montage_file(t text) returns text
language sql immutable as $$
  select case t when 'seance_photo' then 'photo' else 'video' end;
$$;

-- d + n jours ouvrés (samedi et dimanche sautés). n = 0 : d, ou le lundi suivant si week-end.
create or replace function public.jours_ouvres(d date, n int) returns date
language plpgsql immutable as $$
declare r date := d; k int := 0;
begin
  while extract(isodow from r) > 5 loop r := r + 1; end loop;
  while k < n loop
    r := r + 1;
    if extract(isodow from r) <= 5 then k := k + 1; end if;
  end loop;
  return r;
end;
$$;

create or replace function public.planifier() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  libre_video date; libre_photo date; libre date;
  debut date; livraison date; ancienne date;
begin
  for r in
    select p.id, p.type, p.titre, e4.date_prevue as tournage,
           e5.date_prevue as d5, e5.date_forcee as f5,
           e6.date_prevue as d6, e6.date_forcee as f6,
           coalesce((select max(numero) from etapes x where x.projet_id = p.id and x.statut <> 'a_venir'), 0) as cur
    from projets p
    join etapes e4 on e4.projet_id = p.id and e4.numero = 4
    join etapes e5 on e5.projet_id = p.id and e5.numero = 5
    join etapes e6 on e6.projet_id = p.id and e6.numero = 6
    where e4.date_prevue is not null
      and e6.statut = 'a_venir'          -- pas encore en livraison
    order by e4.date_prevue, p.created_at
  loop
    libre := case montage_file(r.type) when 'photo' then libre_photo else libre_video end;

    -- Début du montage : lendemain du tournage, après le projet précédent de la file,
    -- et jamais dans le passé tant que le montage n'a pas commencé.
    if r.f5 and r.d5 is not null then
      debut := r.d5;
    else
      debut := jours_ouvres(r.tournage, 1);
      if libre is not null then debut := greatest(debut, jours_ouvres(libre, 0)); end if;
      if r.cur < 5 then debut := greatest(debut, jours_ouvres(current_date, 0)); end if;
    end if;

    if r.f6 and r.d6 is not null then
      livraison := r.d6;
    else
      livraison := jours_ouvres(debut, montage_jours(r.type));
    end if;

    -- La file se libère le jour de la livraison : le projet suivant commence ce jour-là.
    libre := greatest(debut, livraison);
    if montage_file(r.type) = 'photo' then libre_photo := libre; else libre_video := libre; end if;

    if not r.f5 and r.d5 is distinct from debut then
      update etapes set date_prevue = debut where projet_id = r.id and numero = 5;
    end if;
    if not r.f6 and r.d6 is distinct from livraison then
      ancienne := r.d6;
      update etapes set date_prevue = livraison where projet_id = r.id and numero = 6;
      -- Le client n'est prévenu que si sa livraison recule, une fois le tournage fait.
      if ancienne is not null and livraison > ancienne and r.cur >= 4 then
        perform alerter_client(r.id, 'Nouvelle date de livraison',
          'Votre livraison « ' || r.titre || ' » est maintenant prévue autour du '
          || to_char(livraison, 'DD/MM/YYYY') || '. Merci pour votre patience, on vous prévient dès que c''est prêt.',
          '#/projet/' || r.id);
      end if;
    end if;
  end loop;
end;
$$;
revoke execute on function public.planifier() from public, anon;
grant execute on function public.planifier() to authenticated;

-- Recalcul dès qu'une date ou une étape change, ou qu'un projet change de prestation / est supprimé.
create or replace function public.replanifier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- pas de boucle sur nos propres mises à jour
  perform planifier();
  return null;
end;
$$;
drop trigger if exists etapes_replanifier on public.etapes;
create trigger etapes_replanifier after update of date_prevue, statut, date_forcee on public.etapes
  for each statement execute function public.replanifier();
drop trigger if exists projets_replanifier on public.projets;
create trigger projets_replanifier after update of type or delete on public.projets
  for each statement execute function public.replanifier();

-- Étapes qui avancent seules.
create or replace function public.avancer_auto() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur int; cible int;
begin
  if tg_table_name = 'fichiers' and tg_op = 'INSERT' and new.par_admin and new.categorie = 'video' then
    cible := 5;
  elsif tg_table_name = 'fichiers' and tg_op = 'UPDATE' and new.livrable and not coalesce(old.livrable, false) then
    cible := 6;
  else
    return new;
  end if;
  select coalesce(max(numero), 0) into cur from etapes where projet_id = new.projet_id and statut <> 'a_venir';
  if cur < cible then
    update etapes set statut = case when numero < cible then 'termine' when numero = cible then 'en_cours' else 'a_venir' end
      where projet_id = new.projet_id
        and statut <> case when numero < cible then 'termine' when numero = cible then 'en_cours' else 'a_venir' end;
    perform planifier();   -- les déclencheurs imbriqués ne recalculent pas : on le fait ici
  end if;
  return new;
end;
$$;
drop trigger if exists fichiers_avancer on public.fichiers;
create trigger fichiers_avancer after insert or update of livrable on public.fichiers
  for each row execute function public.avancer_auto();

-- Chaque matin : les montages pas encore commencés glissent si la date est passée.
select cron.unschedule('planning') where exists (select 1 from cron.job where jobname = 'planning');
select cron.schedule('planning', '30 5 * * *', 'select public.planifier()');

select public.planifier();
