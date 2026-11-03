-- Étape 3 : retours horodatés sur une vidéo ou une maquette, et validation par le client.
-- À lancer une fois dans Supabase > SQL Editor, après 02_etape2.sql.

create table public.retours (
  id uuid primary key default gen_random_uuid(),
  fichier_id uuid not null references public.fichiers(id) on delete cascade,
  projet_id uuid not null references public.projets(id) on delete cascade,
  type text not null default 'commentaire' check (type in ('commentaire', 'validation')),
  temps_sec numeric check (temps_sec >= 0),                 -- vidéo : instant commenté
  pos_x numeric check (pos_x between 0 and 100),            -- maquette : position en %
  pos_y numeric check (pos_y between 0 and 100),
  contenu text not null default '',
  auteur uuid not null default auth.uid() references auth.users(id) on delete cascade,
  par_admin boolean not null default false,
  traite boolean not null default false,
  traite_le timestamptz,
  created_at timestamptz not null default now(),
  check (type = 'validation' or length(trim(contenu)) > 0)
);
create index on public.retours (fichier_id, created_at);
create index on public.retours (projet_id) where not traite;

-- Le projet est toujours celui du fichier, et le rôle ne peut pas être falsifié.
create or replace function public.preparer_retour() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.projet_id := (select projet_id from fichiers where id = new.fichier_id);
  new.par_admin := public.is_admin();
  new.traite := new.par_admin or new.type = 'validation';
  return new;
end;
$$;
create trigger retours_preparer before insert on public.retours
  for each row execute function public.preparer_retour();

create or replace function public.dater_traitement() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.traite and not old.traite then new.traite_le := now(); end if;
  if not new.traite then new.traite_le := null; end if;
  return new;
end;
$$;
create trigger retours_traite before update on public.retours
  for each row execute function public.dater_traitement();

alter table public.retours enable row level security;

create policy "retours: admin tout" on public.retours
  for all using (public.is_admin()) with check (public.is_admin());
create policy "retours: client lit" on public.retours
  for select using (public.mon_projet(projet_id));
create policy "retours: client écrit" on public.retours
  for insert with check (
    auteur = auth.uid()
    and exists (select 1 from fichiers f where f.id = fichier_id and public.mon_projet(f.projet_id))
  );
create policy "retours: client retire les siens non traités" on public.retours
  for delete using (auteur = auth.uid() and not traite and public.mon_projet(projet_id));
