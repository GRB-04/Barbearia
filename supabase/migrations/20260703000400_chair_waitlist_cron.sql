-- pg_cron ainda não estava habilitado neste projeto.
create extension if not exists pg_cron;

-- idempotente: remove job antigo se existir
do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'expire-waitlist-entries';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'expire-waitlist-entries',
  '*/5 * * * *',
  $$select public.expire_waitlist_entries()$$
);
