-- Étape 2 : fiche de lancement, fichiers (liens) et messages par projet.
-- À lancer une fois dans Supabase > SQL Editor, après schema.sql.

-- Fiche de lancement : une par projet. Les infos d'identité restent dans la fiche client.
create table public.lancements (
  projet_id uuid primary key references public.projets(id) on delete cascade,
  objectifs text,
  cible text,
  pages_souhaitees text,
  references_style text,     -- sites ou vidéos qui plaisent
  couleurs_logo text,
  contenus_fournis text,     -- textes, photos déjà disponibles
  lieu_tournage text,
  dates_tournage text,
  contraintes text,          -- budget, délais, accès...
  updated_at timestamptz not null default now()
);
create trigger lancements_updated before update on public.lancements
  for each row execute function public.touch_updated_at();

-- Fichiers : des liens (Drive, WeTransfer, Vimeo, YouTube non répertorié...).
-- Le client garde ses fichiers où il veut : rien n'est enfermé ici.
create table public.fichiers (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references public.projets(id) on delete cascade,
  titre text not null,
  url text not null check (url ~* '^https?://'),
  categorie text not null default 'autre'
    check (categorie in ('video', 'photo', 'document', 'maquette', 'autre')),
  ajoute_par uuid not null default auth.uid() references auth.users(id) on delete cascade,
  par_admin boolean not null default public.is_admin(),
  created_at timestamptz not null default now()
);

-- Messages : un fil par projet entre le client et Macker Prod.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references public.projets(id) on delete cascade,
  auteur uuid not null default auth.uid() references auth.users(id) on delete cascade,
  par_admin boolean not null default public.is_admin(),
  contenu text not null check (length(trim(contenu)) > 0),
  created_at timestamptz not null default now()
);
create index on public.messages (projet_id, created_at);

-- Le rôle affiché ne peut pas être falsifié par le client.
create or replace function public.forcer_par_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.par_admin := public.is_admin();
  return new;
end;
$$;
create trigger fichiers_par_admin before insert on public.fichiers
  for each row execute function public.forcer_par_admin();
create trigger messages_par_admin before insert on public.messages
  for each row execute function public.forcer_par_admin();

-- Projet appartenant au client connecté ?
create or replace function public.mon_projet(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projets where id = p and client_id = public.mon_client_id());
$$;

alter table public.lancements enable row level security;
alter table public.fichiers enable row level security;
alter table public.messages enable row level security;

create policy "lancements: admin tout" on public.lancements
  for all using (public.is_admin()) with check (public.is_admin());
create policy "lancements: client lit" on public.lancements
  for select using (public.mon_projet(projet_id));
create policy "lancements: client crée" on public.lancements
  for insert with check (public.mon_projet(projet_id));
create policy "lancements: client modifie" on public.lancements
  for update using (public.mon_projet(projet_id)) with check (public.mon_projet(projet_id));

create policy "fichiers: admin tout" on public.fichiers
  for all using (public.is_admin()) with check (public.is_admin());
create policy "fichiers: client lit" on public.fichiers
  for select using (public.mon_projet(projet_id));
create policy "fichiers: client ajoute" on public.fichiers
  for insert with check (public.mon_projet(projet_id) and ajoute_par = auth.uid());
create policy "fichiers: client retire les siens" on public.fichiers
  for delete using (public.mon_projet(projet_id) and ajoute_par = auth.uid());

create policy "messages: admin tout" on public.messages
  for all using (public.is_admin()) with check (public.is_admin());
create policy "messages: client lit" on public.messages
  for select using (public.mon_projet(projet_id));
create policy "messages: client écrit" on public.messages
  for insert with check (public.mon_projet(projet_id) and auteur = auth.uid());
