-- Note interne sur un client : visible et modifiable par l'équipe Mackerprod uniquement.
create table if not exists public.notes_internes (
  client_id uuid primary key references public.clients(id) on delete cascade,
  texte text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.notes_internes enable row level security;
create policy "notes_internes: admin tout" on public.notes_internes for all
  using (public.is_admin()) with check (public.is_admin());
create trigger notes_internes_updated before update on public.notes_internes
  for each row execute function public.touch_updated_at();
