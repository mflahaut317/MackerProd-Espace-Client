-- Une seule étape en cours à la fois : placer le projet sur l'étape n
-- (les précédentes passent à « terminé », les suivantes à « à venir »).
-- n = 8 : projet terminé, toutes les étapes sont terminées.
create or replace function public.aller_etape(p uuid, n int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  if n < 1 or n > 8 then raise exception 'Étape invalide'; end if;
  update etapes set statut = case when numero < n then 'termine' else 'a_venir' end
    where projet_id = p and numero <> n
      and statut <> case when numero < n then 'termine' else 'a_venir' end;
  update etapes set statut = 'en_cours' where projet_id = p and numero = n and statut <> 'en_cours';
end;
$$;
revoke execute on function public.aller_etape(uuid, int) from public, anon;
grant execute on function public.aller_etape(uuid, int) to authenticated;
