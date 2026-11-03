-- Durcissement recommandé par l'analyse de sécurité Supabase.
-- Les fonctions de déclencheur ne doivent pas être appelables depuis l'API.
revoke execute on function public.alerte_etape(), public.alerte_fichier(), public.alerte_message(),
  public.alerte_retour(), public.creer_etapes(), public.creer_profil(), public.forcer_par_admin(),
  public.preparer_retour(), public.proteger_email(), public.rattacher_profil()
  from public, anon, authenticated;
-- Utilisées par les règles d'accès : seulement pour les personnes connectées.
revoke execute on function public.is_admin(), public.mon_client_id(), public.mon_projet(uuid) from public, anon;
grant execute on function public.is_admin(), public.mon_client_id(), public.mon_projet(uuid) to authenticated;
alter function public.touch_updated_at() set search_path = public;
