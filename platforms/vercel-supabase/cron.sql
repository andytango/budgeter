-- Every minute, Supabase calls the app's delivery endpoint to send queued notifications. (Vercel's
-- free cron only runs once a day.) Fill in both REPLACE_ME values, then run this once.
-- On Vercel Pro you can use Vercel Cron instead (see SETUP.md) and skip this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('budgeter-deliver') where exists (select 1 from cron.job where jobname = 'budgeter-deliver');
select cron.schedule('budgeter-deliver', '* * * * *', $$
  select net.http_post(
    url := 'https://REPLACE_ME_APP_HOST/api/cron/deliver',
    headers := jsonb_build_object('Authorization', 'Bearer REPLACE_ME_CRON_SECRET')
  )
$$);
-- Check a couple of minutes later: select status_code, content from net._http_response order by id desc limit 3;
--   → 200 and {"sent":0}. To stop: select cron.unschedule('budgeter-deliver');
