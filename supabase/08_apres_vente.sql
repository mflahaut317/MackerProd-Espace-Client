-- Expérience 3 : l'après-vente. Avis, rappels (anniversaire, prochain rendez-vous),
-- parrainage, tirages et albums.

-- Prochain rendez-vous fixé par Mackerprod (prochain tournage Frame², séance, mise à jour du site…).
alter table public.projets add column if not exists prochain_rdv date;
alter table public.projets add column if not exists prochain_rdv_note text;
-- Date d'envoi de la demande d'avis, pour ne la faire qu'une fois.
alter table public.projets add column if not exists avis_demande_le timestamptz;

-- Demandes du client après la livraison : parrainage, tirages, album, nouveau projet.
create table if not exists public.demandes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  projet_id uuid references public.projets(id) on delete set null,
  type text not null check (type in ('parrainage', 'tirages', 'album', 'nouveau_projet')),
  details jsonb not null default '{}'::jsonb,
  traitee boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists demandes_client on public.demandes (client_id);
alter table public.demandes enable row level security;
create policy "demandes: admin tout" on public.demandes for all
  using (public.is_admin()) with check (public.is_admin());
create policy "demandes: client lit" on public.demandes for select
  using (client_id = public.mon_client_id());
create policy "demandes: client crée" on public.demandes for insert
  with check (client_id = public.mon_client_id() and not traitee
              and (projet_id is null or public.mon_projet(projet_id)));

-- Alerte Maxence à chaque nouvelle demande.
create or replace function public.alerte_demande() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  qui text := (select coalesce(nullif(nom, ''), email) from clients where id = new.client_id);
  quoi text := case new.type
    when 'parrainage' then 'recommande ' || coalesce(new.details->>'nom', 'un proche')
      || coalesce(' (' || nullif(new.details->>'contact', '') || ')', '')
    when 'tirages' then 'souhaite des tirages photo'
    when 'album' then 'souhaite un album'
    else 'a un nouveau projet' end;
begin
  if public.is_admin() then return new; end if;
  perform alerter_admins(new.projet_id, 'Nouvelle demande client',
    qui || ' ' || quoi || coalesce(' : ' || left(nullif(new.details->>'message', ''), 400), '') || '.',
    coalesce('#/projet/' || new.projet_id, '#/'));
  return new;
end;
$$;
create trigger demandes_alerte after insert on public.demandes
  for each row execute function public.alerte_demande();

-- Tâche quotidienne de l'après-vente.
create or replace function public.apres_vente_quotidien() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- Une seule fois par jour, même si la tâche est relancée.
  if exists (select 1 from notifications where sujet in ('Joyeux anniversaire de mariage', 'Notre prochain rendez-vous approche')
             and created_at >= current_date) then
    return;
  end if;
  -- 1. Demande d'avis, 3 jours après la première livraison.
  for r in
    select p.id, p.titre from projets p
    where p.avis_demande_le is null
      and (select min(f.created_at) from fichiers f where f.projet_id = p.id and f.livrable) < now() - interval '3 days'
  loop
    perform alerter_client(r.id, 'Votre avis nous aiderait beaucoup',
      'Vous avez découvert « ' || r.titre || ' ». Si vous avez aimé travailler avec nous, '
      || 'quelques mots sur Google aident énormément une petite équipe comme la nôtre. Merci !',
      '#/projet/' || r.id || '/livraison');
    update projets set avis_demande_le = now() where id = r.id;
  end loop;

  -- 2. Anniversaire de mariage : chaque année, le jour J (date prévue de l'étape 4).
  for r in
    select p.id, p.titre, extract(year from age(current_date, e.date_prevue))::int as ans
    from projets p join etapes e on e.projet_id = p.id and e.numero = 4
    where p.type = 'mariage' and e.date_prevue < current_date
      and extract(month from e.date_prevue) = extract(month from current_date)
      and extract(day from e.date_prevue) = extract(day from current_date)
  loop
    perform alerter_client(r.id, 'Joyeux anniversaire de mariage',
      'Il y a ' || r.ans || ' an' || case when r.ans > 1 then 's' else '' end
      || ', vous vous disiez oui. Toute l''équipe Mackerprod vous souhaite un très bel anniversaire. '
      || 'Votre film vous attend toujours dans votre espace.',
      '#/projet/' || r.id || '/livraison');
    perform alerter_admins(r.id, 'Anniversaire de mariage aujourd''hui',
      nom_client_projet(r.id) || ' : ' || r.ans || ' an(s) de mariage. Un petit mot ?', '#/projet/' || r.id);
  end loop;

  -- 3. Prochain rendez-vous dans 7 jours.
  for r in select p.id, p.titre, p.prochain_rdv, p.prochain_rdv_note from projets p
           where p.prochain_rdv = current_date + 7
  loop
    perform alerter_client(r.id, 'Notre prochain rendez-vous approche',
      coalesce(nullif(r.prochain_rdv_note, ''), 'Prochain rendez-vous') || ' le '
      || to_char(r.prochain_rdv, 'DD/MM/YYYY') || '. Une question d''ici là ? Écrivez-nous dans votre espace.',
      '#/projet/' || r.id || '/messages');
    perform alerter_admins(r.id, 'Rendez-vous client dans 7 jours',
      nom_client_projet(r.id) || ' : ' || coalesce(nullif(r.prochain_rdv_note, ''), 'prochain rendez-vous')
      || ' le ' || to_char(r.prochain_rdv, 'DD/MM/YYYY') || '.', '#/projet/' || r.id);
  end loop;
end;
$$;

revoke execute on function public.alerte_demande(), public.apres_vente_quotidien() from public, anon, authenticated;

-- Tous les jours à 8 h (heure UTC, soit 9 h ou 10 h en France).
select cron.schedule('apres-vente', '0 8 * * *', 'select public.apres_vente_quotidien()');
