-- شفق ميديا · تحديث ٧: تقوية إضافية (مراجعة 14 تشرين الثاني 2026)
-- شغّل هذا الملف لوحده في استعلام جديد (New query). آمن إذا انشغّل أكثر من مرة.

-- ١) كلمة السر اللي بيحطها المدير لعضو أو عميل: 8 أحرف على الأقل (متل شاشة الدخول)
create or replace function public.admin_set_password(p_user uuid, p_pass text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_manager() then raise exception 'not allowed'; end if;
  if length(coalesce(p_pass, '')) < 8 or length(p_pass) > 72 then raise exception 'كلمة السر 8 أحرف على الأقل'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'الحساب مو موجود'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_pass, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
  -- أي جلسة قديمة لهالحساب بتطلع
  begin
    delete from auth.sessions where user_id = p_user;
    delete from auth.refresh_tokens where user_id::text = p_user::text;
  exception when others then null;
  end;
end;
$$;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

-- ٢) الحساب الموقوف ما بيقدر يسجّل أجهزة إشعارات جديدة
create or replace function public.save_push_sub(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'not allowed'; end if;
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
     or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'bad push endpoint';
  end if;
  insert into public.push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke all on function public.save_push_sub(text, text, text) from public, anon;
grant execute on function public.save_push_sub(text, text, text) to authenticated;

-- ٣) احتياط: ولا دالة مفتوحة للزوار، وكل الجداول عليها RLS
revoke execute on all functions in schema public from anon;
grant execute on function public.has_manager() to anon, authenticated;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ٤) بعد ما تبدّل مفاتيح الإشعارات (VAPID): امسح الأجهزة القديمة حتى كل واحد يفعّل من جديد
-- delete from public.push_subs;   ← شيل الشرطتين من أول السطر وشغّله بس بعد التبديل
