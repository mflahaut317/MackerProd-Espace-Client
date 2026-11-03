-- Expérience 2 : page de livraison soignée et lien de partage pour les proches.

alter table public.fichiers add column if not exists livrable boolean not null default false;
alter table public.projets add column if not exists mot_livraison text;
alter table public.projets add column if not exists partage_token uuid;
alter table public.projets add column if not exists partage_actif boolean not null default false;
create unique index if not exists projets_partage_token on public.projets (partage_token) where partage_token is not null;

-- Seul l'admin marque un fichier comme livrable (le client ne peut que retirer ses propres liens).
create or replace function public.proteger_livrable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.livrable and not public.is_admin() then new.livrable := false; end if;
  return new;
end;
$$;
create trigger fichiers_livrable before insert or update on public.fichiers
  for each row execute function public.proteger_livrable();

-- Le client peut activer ou couper le lien de partage de son projet, rien d'autre.
create or replace function public.partager_livraison(p uuid, actif boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not (public.is_admin() or public.mon_projet(p)) then raise exception 'Accès refusé'; end if;
  update projets set partage_actif = actif,
    partage_token = coalesce(partage_token, gen_random_uuid())
  where id = p returning partage_token into t;
  return t;
end;
$$;
revoke execute on function public.partager_livraison(uuid, boolean) from public, anon;
grant execute on function public.partager_livraison(uuid, boolean) to authenticated;

-- Page publique : uniquement le titre, le mot de l'équipe et les livrables, si le partage est actif.
create or replace function public.livraison_publique(t uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'titre', p.titre,
    'type', p.type,
    'mot', p.mot_livraison,
    'fichiers', coalesce((select json_agg(json_build_object('titre', f.titre, 'url', f.url, 'categorie', f.categorie) order by f.created_at)
                          from fichiers f where f.projet_id = p.id and f.livrable), '[]'::json))
  from projets p where p.partage_token = t and p.partage_actif;
$$;
grant execute on function public.livraison_publique(uuid) to anon, authenticated;

-- Alerte : la livraison est prête (premier fichier marqué livrable).
create or replace function public.alerte_livraison() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.livrable and (tg_op = 'INSERT' or not old.livrable)
     and not exists (select 1 from fichiers where projet_id = new.projet_id and livrable and id <> new.id) then
    perform alerter_client(new.projet_id, 'Votre livraison est prête',
      'Projet « ' || (select titre from projets where id = new.projet_id) || ' » : vos fichiers vous attendent.',
      '#/projet/' || new.projet_id || '/livraison');
  end if;
  return new;
end;
$$;
create trigger fichiers_alerte_livraison after insert or update of livrable on public.fichiers
  for each row execute function public.alerte_livraison();

revoke execute on function public.proteger_livrable(), public.alerte_livraison() from public, anon, authenticated;
