-- Espace client Macker Prod : schéma de base (étape 1)
-- À coller dans Supabase > SQL Editor > New query, puis Run.

-- 1. Fiche client unique : chaque info n'est saisie qu'une fois.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nom text,
  entreprise text,
  telephone text,
  adresse text,
  siret text,
  nom_de_domaine text,          -- reste la propriété du client
  registrar text,               -- où le domaine est enregistré (OVH, Gandi...)
  reseaux_sociaux text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Profils : lie un compte de connexion à une fiche client, ou au rôle admin.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'client' check (role in ('client', 'admin')),
  client_id uuid references public.clients(id) on delete set null
);

-- 3. Projets : un client peut en avoir plusieurs (site, puis vidéo, etc.).
create table public.projets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  titre text not null,
  created_at timestamptz not null default now()
);

-- 4. Les 7 étapes du parcours, créées automatiquement pour chaque projet.
create table public.etapes (
  projet_id uuid not null references public.projets(id) on delete cascade,
  numero int not null check (numero between 1 and 7),
  statut text not null default 'a_venir' check (statut in ('a_venir', 'en_cours', 'termine')),
  date_prevue date,
  commentaire text,
  updated_at timestamptz not null default now(),
  primary key (projet_id, numero)
);

create table public.etapes_ref (
  numero int primary key,
  libelle text not null
);
insert into public.etapes_ref values
  (1, 'Premier contact'),
  (2, 'Signature'),
  (3, 'Lancement (fiche)'),
  (4, 'Tournage'),
  (5, 'Création du site'),
  (6, 'Mise en ligne'),
  (7, 'Suivi');

-- Fonctions utilitaires ------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.mon_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from profiles where id = auth.uid();
$$;

-- À la première connexion, le compte est rattaché à la fiche client de même e-mail.
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, client_id)
  values (new.id, new.email, (select id from clients where lower(email) = lower(new.email)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil();

-- Si la fiche client est créée après le compte, on rattache quand même.
create or replace function public.rattacher_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set client_id = new.id
  where lower(email) = lower(new.email) and client_id is null and role = 'client';
  return new;
end;
$$;
create trigger on_client_created
  after insert on public.clients
  for each row execute function public.rattacher_profil();

-- Chaque nouveau projet reçoit ses 7 étapes, la première en cours.
create or replace function public.creer_etapes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into etapes (projet_id, numero, statut)
  select new.id, n, case when n = 1 then 'en_cours' else 'a_venir' end
  from generate_series(1, 7) n;
  return new;
end;
$$;
create trigger on_projet_created
  after insert on public.projets
  for each row execute function public.creer_etapes();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger clients_updated before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger etapes_updated before update on public.etapes
  for each row execute function public.touch_updated_at();

-- Droits d'accès (RLS) --------------------------------------------------------
-- Un client ne voit que sa fiche et ses projets. L'admin voit tout.

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.projets enable row level security;
alter table public.etapes enable row level security;
alter table public.etapes_ref enable row level security;

create policy "profil: lecture de soi" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "clients: admin tout" on public.clients
  for all using (public.is_admin()) with check (public.is_admin());
create policy "clients: lecture de sa fiche" on public.clients
  for select using (id = public.mon_client_id());
create policy "clients: maj de sa fiche" on public.clients
  for update using (id = public.mon_client_id()) with check (id = public.mon_client_id());

create policy "projets: admin tout" on public.projets
  for all using (public.is_admin()) with check (public.is_admin());
create policy "projets: lecture des siens" on public.projets
  for select using (client_id = public.mon_client_id());

create policy "etapes: admin tout" on public.etapes
  for all using (public.is_admin()) with check (public.is_admin());
create policy "etapes: lecture des siennes" on public.etapes
  for select using (
    exists (select 1 from projets p where p.id = projet_id and p.client_id = public.mon_client_id())
  );

create policy "etapes_ref: lecture" on public.etapes_ref
  for select using (true);

-- Un client ne peut pas changer son e-mail de connexion via sa fiche.
create or replace function public.proteger_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and new.email is distinct from old.email then
    raise exception 'Seul Macker Prod peut modifier l''e-mail de connexion.';
  end if;
  return new;
end;
$$;
create trigger clients_email_protege before update on public.clients
  for each row execute function public.proteger_email();

-- Dernière étape manuelle, après ta première connexion sur l'app :
-- update public.profiles set role = 'admin' where email = 'TON_EMAIL';
