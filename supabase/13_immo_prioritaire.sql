-- Planning automatique (2/2, 2026-11-05) : les prestations immobilier passent devant.
-- Une vidéo immo se monte en 2-3 jours : elle est placée en premier dans la file vidéo,
-- et le montage qu'elle interrompt (mariage, film…) est décalé d'autant.
-- La file devient un calendrier de jours ouvrés : chaque jour ne sert qu'à un projet.
-- Remplace seulement les fonctions montage_jours() et planifier() ; aucune donnée touchée.

create or replace function public.montage_jours(t text) returns int
language sql immutable as $$
  select case t
    when 'immobilier' then 3 when 'frame2' then 5 when 'corporate' then 10
    when 'site_web' then 15 when 'evenement' then 10 when 'mariage' then 30
    when 'seance_photo' then 5 else 10 end;
$$;

create or replace function public.planifier() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  occ_video date[] := '{}'; occ_photo date[] := '{}'; occ date[]; pris date[];
  debut date; livraison date; jour date; reste int; ancienne date;
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
      and e6.statut = 'a_venir'                     -- pas encore en livraison
    order by (p.type <> 'immobilier'), e4.date_prevue, p.created_at   -- immo d'abord
  loop
    occ := case montage_file(r.type) when 'photo' then occ_photo else occ_video end;
    pris := '{}';

    -- Début : lendemain du tournage, jamais dans le passé tant que le montage n'a pas commencé,
    -- et sur un jour libre de la file.
    if r.f5 and r.d5 is not null then
      debut := r.d5;
    else
      debut := jours_ouvres(r.tournage, 1);
      if r.cur < 5 then debut := greatest(debut, jours_ouvres(current_date, 0)); end if;
      while debut = any(occ) loop debut := jours_ouvres(debut, 1); end loop;
    end if;

    -- Jours de montage : les N premiers jours libres à partir du début.
    jour := jours_ouvres(debut, 0);
    if r.f6 and r.d6 is not null then
      livraison := r.d6;
      while jour < livraison loop
        if not jour = any(occ) then pris := pris || jour; end if;
        jour := jours_ouvres(jour, 1);
      end loop;
    else
      reste := montage_jours(r.type);
      while reste > 0 loop
        if not jour = any(occ) then pris := pris || jour; reste := reste - 1; end if;
        jour := jours_ouvres(jour, 1);
      end loop;
      livraison := jour;                             -- jour ouvré qui suit le dernier jour de montage
    end if;

    if montage_file(r.type) = 'photo' then occ_photo := occ || pris; else occ_video := occ || pris; end if;

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

select public.planifier();
