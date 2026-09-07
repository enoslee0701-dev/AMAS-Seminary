-- ============================================================================
-- 0027_function_execute_hardening.sql
--
-- ★ STATUS: PROPOSED PATCH — DO NOT APPLY TO REMOTE STAGING
--   等待 GPT Supervisor 审查。批准后移动到
--   amas-website/supabase/migrations/0027_function_execute_hardening.sql 再执行。
--
-- ── 根因 ────────────────────────────────────────────────────────────────────
-- 0003_hardening.sql:141 有一句批量收口：
--     revoke execute on all functions in schema public from public, anon;
-- 但 `ALL FUNCTIONS IN SCHEMA` 只作用于**执行那一刻已存在**的函数。
-- 0004 及以后新建的每一个函数都回到 PostgreSQL 默认的 `PUBLIC EXECUTE`
-- （PUBLIC 覆盖 anon 与 authenticated），除非该迁移自己再 revoke 一次。
--
-- 逐文件核对结果：0003 之后创建、且从未显式 revoke 的函数共 13 个，
-- 全部仍持有 PUBLIC / anon / authenticated EXECUTE。Supabase Security Advisor
-- 报的正是这一批；Supervisor 实测 student_guard 与 sync_alias_on_role_revoke
-- 确实三者皆有，与本推导一致。
--
-- ── 本 patch 不做什么 ───────────────────────────────────────────────────────
-- 不改任何函数逻辑（下方 is_admin_any 除外，且只加一道归属门禁）。
-- 不动 RLS 策略。不动 service_role 的任何授权。
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- A. TRIGGER ONLY —— 10 个 `returns trigger` 函数
--
-- 它们只应由数据库 trigger 触发。PostgreSQL 本身会拒绝直接调用
-- （"trigger functions can only be called as triggers"），因此**当前的实际
-- 可利用性很低**——这一点必须如实说明，不要把它讲成可被直接利用的漏洞。
-- 但它们是 SECURITY DEFINER 且经 PostgREST 暴露，保留 PUBLIC EXECUTE 没有
-- 任何用途，只会持续污染 Advisor 报告并掩盖真正需要注意的项。
--
-- revoke EXECUTE **不影响 trigger 正常工作**：trigger 由表所有者的权限触发，
-- 不检查调用者对 trigger function 的 EXECUTE。
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.handle_new_user()                    from public, anon, authenticated;
revoke execute on function public.tvr_validate_transition()            from public, anon, authenticated;
revoke execute on function public.application_validate_transition()    from public, anon, authenticated;
revoke execute on function public.application_strip_forbidden()        from public, anon, authenticated;

-- 以下 6 个来自 0012 / 0013 / 0014 / 0016 / 0025。
-- ⚠ staging 的 supabase_migrations 只登记到 0010，但 Supervisor 实测
--   student_guard / sync_alias_on_role_revoke 已存在 —— 说明这些迁移是**带外执行**的
--   （控制台 SQL Editor 不写迁移历史）。执行本 patch 前必须先确认每个对象是否真的存在，
--   否则会因 "function does not exist" 整个事务回滚。
--   建议按需逐条启用，或先跑 §验证计划 的 before-grants 查询。
revoke execute on function public.student_guard()                      from public, anon, authenticated;
revoke execute on function public.sync_alias_on_role_revoke()          from public, anon, authenticated;
revoke execute on function public.application_protect_locked()         from public, anon, authenticated;
revoke execute on function public.append_only_guard()                  from public, anon, authenticated;
revoke execute on function public.course_catalog_guard()               from public, anon, authenticated;
-- 0025 属 DB-3，staging 尚未应用；若不存在请注释掉本行。
-- revoke execute on function public.app_rooms_mark_host_orphaned()    from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- D. INTERNAL HELPER —— 3 个非 trigger、但客户端从不直接调用的函数
--
-- 调用链（已逐层核实）：
--   client → submit_application(uuid)            SECURITY DEFINER，已授予 authenticated
--              └─ application_validate_form()     SECURITY INVOKER
--                   └─ application_validate_program()
--
-- 关键：`submit_application` 是 SECURITY DEFINER，因此其下游全部以**函数所有者**
-- 身份执行，EXECUTE 权限对照的是 owner 而不是客户端。**撤销 authenticated 的
-- EXECUTE 不会破坏申请提交流程。**
--
-- 另经全仓库检索：前端与 Edge Function 中没有任何一处 rpc('application_validate_*')
-- 或 rpc('normalize_student_number')。
--
-- 补充：application_validate_program 只读 public.program_catalog 的 code 与
-- is_open_for_application，而该表本就有 `pc_public_read` 策略对外可读 ——
-- 即便当前 anon 能调用，泄漏面也是零（公开目录信息）。故本项按"清理多余授权"
-- 处理，不按"堵漏"处理。
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.application_validate_program(jsonb)        from public, anon, authenticated;
revoke execute on function public.application_validate_form(jsonb, text)     from public, anon, authenticated;
revoke execute on function public.normalize_student_number(text)             from public, anon, authenticated;
-- service_role 保留（后端与 Edge Function 可能直接校验表单）
grant execute on function public.application_validate_program(jsonb)         to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- ★ 本 patch 真正重要的一项：角色 helper 的越权探测
--
-- has_active_role(p_user uuid, p_role text)
--   · SECURITY DEFINER —— 绕过 user_roles 的 RLS
--   · 接受**调用方任意指定**的 p_user
--   · 已显式 `grant ... to authenticated`
--   · 函数体内**没有** auth.uid() 归属校验，也没有管理员校验
--
-- 后果：任何已登录用户都可以
--     select public.has_active_role('<别人的 uuid>', 'super_admin');
-- 逐个探测他人角色 —— 一个可枚举「谁是管理员」的布尔预言机。
-- 它是**信息泄漏**，不是提权（函数只读、只返回 boolean），严重度中等；
-- 但在正式建立 STG-ADMIN 之前必须堵上，否则 staging 一上线就带着这个洞。
--
-- 处置依据（已核实，不是推测）：
--   · RLS 策略中 has_active_role 的引用次数 = 0 —— 策略只用
--     is_admin_any(auth.uid()) 与 current_user_has_role('...')
--   · has_active_role 仅被 current_user_has_role / is_admin_any 内部调用，
--     而这两个都是 SECURITY DEFINER —— 内部调用按 owner 校验 EXECUTE，
--     不需要调用方持有权限
--   → 从 authenticated 撤销是安全的
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.has_active_role(uuid, text) from public, anon, authenticated;
-- service_role 保留：后端确有按任意 UUID 查角色的正当需求
grant execute on function public.has_active_role(uuid, text) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- is_admin_any(p_user uuid) —— 不能简单 revoke，必须加门禁
--
-- 与 has_active_role 不同，它**被 13 处 RLS 策略引用**，形式一律是
--     using (... or public.is_admin_any(auth.uid()))
-- 策略表达式以调用者身份求值，因此 authenticated 必须保留 EXECUTE，
-- 否则所有相关策略会因权限不足而失败 —— 那是产品级破坏。
--
-- 但保留 EXECUTE 就意味着客户端也能传别人的 UUID 去探测。
-- 解法是在函数内部加一道归属门禁，而不是动授权：
--   · p_user = auth.uid()        → 放行（策略里的全部用法都是这一支）
--   · auth.uid() is null         → 放行（service_role / 后端上下文没有 uid；
--                                  anon 已无 EXECUTE，不会走到这里）
--   · 其他（探测他人）           → 直接返回 false，不泄漏任何信息
--
-- 语义影响：策略行为逐字不变；仅"拿别人 UUID 来问"这一种用法从
-- 「如实回答」变成「一律 false」。
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin_any(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_user is null then false
    -- 只允许问"我自己"，或由无 uid 的服务端上下文（service_role）代问
    when auth.uid() is null or p_user = auth.uid() then
      public.has_active_role(p_user, 'registrar')
      or public.has_active_role(p_user, 'academic_admin')
      or public.has_active_role(p_user, 'super_admin')
    else false
  end;
$$;

commit;

-- ============================================================================
-- 验证计划（apply 前后各跑一次，逐项比对）
-- ============================================================================
--
-- ① before grants —— 先确认对象存在，并留底当前授权
--
--   select p.proname, p.prosecdef,
--          coalesce(array_to_string(p.proacl::text[], ' | '), '(default: PUBLIC EXECUTE)') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('handle_new_user','tvr_validate_transition',
--        'application_validate_transition','application_strip_forbidden',
--        'student_guard','sync_alias_on_role_revoke','application_protect_locked',
--        'append_only_guard','course_catalog_guard','app_rooms_mark_host_orphaned',
--        'application_validate_program','application_validate_form',
--        'normalize_student_number','has_active_role','is_admin_any')
--    order by p.proname;
--
--   对不存在的行（例如 DB-3 的 0025）→ 把本文件中对应的 revoke 注释掉再执行。
--
-- ② apply patch —— 在事务内执行本文件；任何一条失败即整体回滚
--
-- ③ after grants —— 重跑 ① 的查询，逐项确认：
--      anon / authenticated 不再出现在上述函数的 acl 中
--      service_role 的授权保持不变
--      is_admin_any 仍对 authenticated 可执行（RLS 依赖它）
--
-- ④ trigger behavior —— 证明 revoke 没有伤到 trigger 本身
--      · 新注册一个用户 → profiles 行自动创建（handle_new_user）
--      · 撤销一个 role → alias 同步（sync_alias_on_role_revoke）
--      · 尝试非法学籍变更 → 被 student_guard 拒绝
--      · 尝试改已锁定的申请 → 被 application_protect_locked 拒绝
--
-- ⑤ Portal RPC regression —— 以真实 authenticated 会话跑一遍
--      my_profile · my_roles · my_application · my_application_timeline
--      submit_application（**重点**：它内部会经 application_validate_form
--        → application_validate_program，用来证明撤销 authenticated 后
--        申请提交依然正常）
--      任意一条依赖 is_admin_any 的 RLS 读写路径
--
-- ⑥ 越权探测复测（新增，本 patch 的核心目的）
--      以 STG-STUDENT 会话执行：
--        select public.is_admin_any('<STG-ADMIN 的 uuid>');   → 期望 false
--        select public.has_active_role('<别人 uuid>','super_admin');
--                                                            → 期望 permission denied
--      以同一会话执行：
--        select public.is_admin_any(auth.uid());              → 期望如实返回
--
-- ⑦ advisor rerun —— 重跑 Supabase Security Advisor，确认
--      "SECURITY DEFINER function callable by anon/authenticated" 一类告警清零
--      （Leaked Password Protection 属配置项，不在本 patch 范围，见 runbook）
--
-- 回滚：本文件全部动作可逆。
--   revoke 的回滚 = 重新 grant（但请先想清楚为什么要还回去）；
--   is_admin_any 的回滚 = 用 0002_identity.sql 中的原定义重新 create or replace。
-- ============================================================================
