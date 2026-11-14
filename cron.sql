-- شفق ميديا · تشغيل الإشعارات كل ساعة (نسخة محمية بكلمة سر)
-- 1) بـ Supabase ← Edge Functions ← Secrets: ضيف CRON_SECRET بقيمة عشوائية طويلة (ولّدها من أداة vapid-keygen.html أو أي مولّد).
-- 2) بدّل كلمة PASTE_CRON_SECRET_HERE تحت بنفس القيمة، وشغّل الملف لحاله باستعلام جديد.
select cron.unschedule('shafq-push') where exists (select 1 from cron.job where jobname = 'shafq-push');
select cron.schedule('shafq-push', '2 * * * *', $$
  select net.http_post(
    url := 'https://rwadscqezwbzjawuopye.supabase.co/functions/v1/push',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "PASTE_CRON_SECRET_HERE"}'::jsonb,
    body := '{"action": "cron"}'::jsonb
  );
$$);
