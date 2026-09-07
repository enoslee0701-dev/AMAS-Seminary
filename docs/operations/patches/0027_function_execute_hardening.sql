-- ============================================================================
-- 0027_function_execute_hardening.sql
--
-- ★ STATUS: PROPOSED PATCH — DO NOT APPLY TO REMOTE STAGING
--   等待 GPT Supervisor 审查。批准后移动到
--   amas-website/supabase/migrations/0027_function_execute_hardening.sql 再执行。
--
-- ── 根因（按 PostgreSQL 语义逐条推导，不是按名字 grep）──────────────────────
-- 0003_hardening.sql:141 有一句批量收口：
--     revoke execute on all functions in schema public from public, anon;
-- `ALL FUNCTIONS IN SCHEMA` 只作用于**执行那一刻已存在**的函数。
--
-- 两条 PostgreSQL 语义决定了谁真正漏了：
--   1. `CREATE FUNCTION`（全新函数）→ 默认 `PUBLIC EXECUTE`，
--      而 PUBLIC 同时覆盖 anon 与 authenticated。
--   2. `CREATE OR REPLACE FUNCTION`（替换已存在的函数）→ **保留原有 ACL**。
--      因此 0003 之后仅被 REPLACE 的函数并没有把权限退回去。
--
-- 按此逐文件核对 0001–0025：
--   0003 之后**新建**的函数                         = 46
--   其中在本文件或后续 migration 中自行 revoke 的   = 34
--   → 真正仍持有 PUBLIC / anon / authenticated EXECUTE = 12
--
-- 这 12 个就是本 patch 的 A/D 两节。Supervisor 实测 student_guard 与
-- sync_alias_on_role_revoke 三者皆有 —— 两者都在这 12 个之内，推导与实测一致。
--
-- ⚠ 反例（务必不要顺手加进来）：
--   handle_new_user / handle_user_email_confirmed / handle_user_email_changed
--   这三个 trigger function 在 0003:141 之前就已存在（0002 建；0003 在 141 行
--   之前 REPLACE），已被那次批量 revoke 覆盖；0006 对 handle_new_user 只是
--   CREATE OR REPLACE，按语义 2 **保留**了收紧后的 ACL。它们不需要处理。
--
-- ── 本 patch 不做什么 ───────────────────────────────────────────────────────
-- 不改任何函数逻辑（下方 is_admin_any 除外，且只加一道归属门禁）。
-- 不动 RLS 策略。不动 service_role 的任何授权。
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- A. TRIGGER ONLY —— 9 个 `returns trigger` 函数（返回类型已逐个核对）
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
revoke execute on function public.tvr_validate_transition()            from public, anon, authenticated;  -- 0004
revoke execute on function public.application_validate_transition()    from public, anon, authenticated;  -- 0008
revoke execute on function public.application_protect_locked()         from public, anon, authenticated;  -- 0008
revoke execute on function public.application_strip_forbidden()        from public, anon, authenticated;  -- 0010
revoke execute on function public.student_guard()                      from public, anon, authenticated;  -- 0012 ✔实测
revoke execute on function public.sync_alias_on_role_revoke()          from public, anon, authenticated;  -- 0012 ✔实测
revoke execute on function public.append_only_guard()                  from public, anon, authenticated;  -- 0012
revoke execute on function public.course_catalog_guard()               from public, anon, authenticated;  -- 0016

-- ⚠ 0025 属 DB-3，staging migration history 只登记到 0010，该函数很可能不存在。
--   不存在时本行会让整个事务回滚 —— 执行前先跑 §验证计划 ①，不存在就保持注释。
-- revoke execute on function public.app_rooms_mark_host_orphaned()    from public, anon, authenticated;  -- 0025

-- ⚠ 同样注意：staging 只登记到 0010，但 student_guard / sync_alias_on_role_revoke
--   （0012）实测已存在 —— 说明 0012+ 是**带外执行**的（控制台 SQL Editor 不写
--   迁移历史）。所以"迁移历史"不能当作对象是否存在的依据，必须以 ① 的实查为准。

-- ────────────────────────────────────────────────────────────────────────────
-- D. INTERNAL HELPER —— 3 个非 trigger、但客户端从不直接调用的函数
--
-- 调用链（已逐层核实）：
--   client → submit_application(uuid)            SECURITY DEFINER，已授予 authenticated
--              └─ application_validate_form(jsonb, text)
--                   └─ application_validate_program(jsonb)
--
-- 关键：`submit_application` 是 SECURITY DEFINER，因此其下游全部以**函数所有者**
-- 身份执行，EXECUTE 权限对照的是 owner 而不是客户端。**撤销 authenticated 的
-- EXECUTE 不会破坏申请提交流程。**
--
-- 另经全仓库检索：前端与 Edge Function 中没有任何一处 rpc('application_validate_*')
-- 或 rpc('normalize_student_number')。
--
-- 补充（回应 §8「不要因为 Advisor warning 就直接 revoke」）：
-- application_validate_program 只读 public.program_catalog 的 code 与
-- is_open_for_application，而该表本就有 `pc_public_read` 策略对外可读 ——
-- 即便当前 anon 能调用，泄漏面也是零（公开目录信息），也没有任何写入路径。
-- 故本项按"清理多余授权"处理，**不**按"堵漏"处理；它不是 B 类 public RPC。
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.application_validate_program(jsonb)        from public, anon, authenticated;
revoke execute on function public.application_validate_form(jsonb, text)     from public, anon, authenticated;
revoke execute on function public.normalize_student_number(text)             from public, anon, authenticated;
-- service_role 保留（后端与 Edge Function 可能直接校验表单）
grant execute on function public.application_validate_program(jsonb)         to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- ★ 本 patch 真正重要的一项：角色 helper 的越权探测
--
-- 注意：has_active_role 建于 0002，**已被 0003:141 覆盖**，所以它不在上面那 12 个
-- 里。它的问题是另一回事 —— 0003:144 又**显式**把它授回了 authenticated：
--     grant execute on function public.has_active_role(uuid,text) to authenticated, service_role;
--
-- has_active_role(p_user uuid, p_role text)
--   · SECURITY DEFINER —— 绕过 user_roles 的 RLS
--   · 接受**调用方任意指定**的 p_user
--   · 显式授予 authenticated
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
--
-- current_user_has_role(p_role text) 不在处置范围：它没有 p_user 参数，
-- 内部固定用 auth.uid()，只能问"我自己"，天然具备归属约束，保持现状。
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
--
-- ★ search_path 必须沿用 0003 的空值，并全部写全限定名。
--   改成 = public 会削弱 0003 已做过的 search_path 加固 —— 那是回退，不是改进。
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin_any(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select case
    when p_user is null then false
    -- 只允许问"我自己"，或由无 uid 的服务端上下文（service_role）代问
    when auth.uid() is null or p_user = auth.uid() then
      public.has_active_role(p_user, 'registrar')
      or public.has_active_role(p_user, 'academic_admin')
      or public.has_active_role(p_user, 'super_admin')
    else false
  end;
$fn$;

commit;

-- ============================================================================
-- 验证计划（apply 前后各跑一次，逐项比对）
-- ============================================================================
--
-- ① before grants —— 先确认对象存在，并留底当前授权
--    （staging 的 migration history 只到 0010 却已有 0012 的对象，因此**必须实查**，
--     不能拿迁移历史推断）
--
--   select p.proname, p.prosecdef,
--          coalesce(array_to_string(p.proacl::text[], ' | '), '(default: PUBLIC EXECUTE)') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('tvr_validate_transition','application_validate_transition',
--        'application_protect_locked','application_strip_forbidden','student_guard',
--        'sync_alias_on_role_revoke','append_only_guard','course_catalog_guard',
--        'app_rooms_mark_host_orphaned','application_validate_program',
--        'application_validate_form','normalize_student_number',
--        'has_active_role','is_admin_any','current_user_has_role')
--    order by p.proname;
--
--   对不存在的行（预期：app_rooms_mark_host_orphaned）→ 保持对应 revoke 注释。
--   proacl 为 NULL 即"默认 PUBLIC EXECUTE"，正是本 patch 要清掉的状态。
--
-- ② apply patch —— 在事务内执行本文件；任何一条失败即整体回滚
--
-- ③ after grants —— 重跑 ① 的查询，逐项确认：
--      anon / authenticated 不再出现在上述函数的 acl 中
--      service_role 的授权保持不变
--      is_admin_any 仍对 authenticated 可执行（13 处 RLS 依赖它）
--      current_user_has_role 保持对 authenticated 可执行（本 patch 未改动）
--
-- ④ trigger behavior —— 证明 revoke 没有伤到 trigger 本身
--      · 撤销一个 role → alias 同步（sync_alias_on_role_revoke）
--      · 尝试非法学籍变更 → 被 student_guard 拒绝
--      · 尝试改已锁定的申请 → 被 application_protect_locked 拒绝
--      · 尝试改课程目录 → 被 course_catalog_guard 拒绝
--      （handle_new_user 未被本 patch 触及，新注册路径本就不受影响）
--
-- ⑤ Portal RPC regression —— 以真实 authenticated 会话跑一遍
--      my_profile · my_roles · my_application · my_application_timeline
--      submit_application（**重点**：它内部会经 application_validate_form
--        → application_validate_program，用来证明撤销 authenticated 后
--        申请提交依然正常）
--      任意一条依赖 is_admin_any 的 RLS 读写路径
--
-- ⑥ 越权探测复测（本 patch 的核心目的）
--      以 STG-STUDENT 会话执行：
--        select public.is_admin_any('<STG-ADMIN 的 uuid>');   → 期望 false
--        select public.has_active_role('<别人 uuid>','super_admin');
--                                                            → 期望 permission denied
--      以同一会话执行：
--        select public.is_admin_any(auth.uid());              → 期望如实返回
--        select public.current_user_has_role('student');      → 期望如实返回
--
-- ⑦ advisor rerun —— 重跑 Supabase Security Advisor，确认
--      "SECURITY DEFINER function callable by anon/authenticated" 一类告警清零
--      （Leaked Password Protection 属配置项，不在本 patch 范围，见 runbook）
--
-- 回滚：本文件全部动作可逆。
--   revoke 的回滚 = 重新 grant（但请先想清楚为什么要还回去）；
--   is_admin_any 的回滚 = 用 0003_hardening.sql:30 的原定义重新 create or replace。
-- ============================================================================
