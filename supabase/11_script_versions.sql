-- Refonte : scripts à valider (texte écrit dans l'espace) et versions successives d'un même livrable.
-- Un script est un fichier de catégorie « script » dont le contenu est dans `texte` (pas de lien).
-- Les versions d'un même livrable partagent le même titre : V1, V2… dans l'ordre d'arrivée.

alter table public.fichiers alter column url drop not null;
alter table public.fichiers drop constraint if exists fichiers_url_check;
alter table public.fichiers drop constraint if exists fichiers_categorie_check;
alter table public.fichiers add column if not exists texte text;
alter table public.fichiers add column if not exists note_version text;

alter table public.fichiers add constraint fichiers_categorie_check
  check (categorie in ('video', 'photo', 'document', 'maquette', 'script', 'autre'));
alter table public.fichiers add constraint fichiers_contenu_check check (
  case when categorie = 'script' then length(trim(coalesce(texte, ''))) > 0
       else url ~* '^https?://' end
);

-- Seul Mackerprod dépose un script.
create or replace function public.proteger_script() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.categorie = 'script' and not public.is_admin() then
    raise exception 'Seul Mackerprod dépose un script';
  end if;
  return new;
end;
$$;
drop trigger if exists fichiers_script on public.fichiers;
create trigger fichiers_script before insert or update on public.fichiers
  for each row execute function public.proteger_script();

-- Alerte au client : nouvelle vidéo, maquette ou script à valider.
create or replace function public.alerte_fichier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.par_admin and new.categorie in ('video', 'maquette', 'script') then
    perform alerter_client(new.projet_id,
      case when new.categorie = 'script' then 'Un script à relire' else 'Nouvelle version à valider' end,
      '« ' || new.titre || ' » est prêt'
        || case when new.categorie = 'script' then '. Lisez-le, donnez vos idées et validez-le en ligne.'
                else '. Vous pouvez le commenter et le valider en ligne.' end,
      '#/projet/' || new.projet_id || '/revue/' || new.id);
  end if;
  return new;
end;
$$;
