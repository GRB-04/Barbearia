-- Advisors (Task 10): fecha dois warnings introduzidos pela feature de fila.
-- 1) protect_chair_waitlist_cancel sem search_path fixo (padrão do projeto é fixar).
-- 2) promote_next_waitlist_for_chair / expire_waitlist_entries retornam void e por
--    isso são chamáveis via RPC por anon/authenticated; só triggers e cron devem
--    executá-las. (Funções "returns trigger" não são chamáveis via RPC — sem risco.)

begin;

alter function public.protect_chair_waitlist_cancel() set search_path = public;

revoke execute on function public.promote_next_waitlist_for_chair(uuid) from anon, authenticated;
revoke execute on function public.expire_waitlist_entries() from anon, authenticated;
revoke execute on function public.my_waitlist_positions() from anon;

commit;
