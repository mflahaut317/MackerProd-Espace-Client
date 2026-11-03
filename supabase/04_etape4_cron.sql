-- Étape 4 (2/2) : appel automatique de la fonction d'envoi toutes les 5 minutes.
-- À lancer après 04_etape4_alertes.sql et après avoir déployé la fonction « envoyer-notifications ».

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Secret partagé entre pg_cron et la fonction, gardé dans le coffre-fort Supabase.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'notif_cron_secret')
where not exists (select 1 from vault.secrets where name = 'notif_cron_secret');

-- Lisible uniquement par le serveur (clé service_role), jamais depuis le site.
create or replace function public.secret_notifications() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'notif_cron_secret';
$$;
revoke execute on function public.secret_notifications() from public, anon, authenticated;
grant execute on function public.secret_notifications() to service_role;
grant execute on function public.rappels_24h() to service_role;

select cron.schedule('envoyer-notifications', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://yrmnflkibrciiwidkcyr.supabase.co/functions/v1/envoyer-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notif_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);
