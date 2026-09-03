# AUTH-M2/M3 · Provenance / Rollback Manifest

**日期**：2026-09-03
**性质**：并发开发事故的正式溯源与回滚清单
**处置决定**：接受历史已混合的事实，**不重写 Git 历史**，改以本文件作为 AUTH 代码的权威边界说明。

---

## 1. 混入 AUTH 代码的 commit

| 项 | 值 |
|---|---|
| Commit | `376344dcd5a562be4d2d71f5040e25644ebc7a3c` |
| 标题 | `feat(祷告室 Phase 4B-R): 生产 mock 硬阻断 + Voice Diagnostics 验收工具` |
| 时间 | 2026-09-03 15:44:20 +0800 |
| 分支 | `main` |
| **父版本** | `c1ca1a2f7d300f9c8b19ee1b4a9b663146d0b604`（`feat(祷告室 Phase 4B): token 硬化 + 语音踢出 + Vite env 护栏`） |

**成因**：祷告室工作流与 Supabase Auth 迁移工作流在**同一个 Git working tree** 中并发进行。
祷告室侧执行 `git add -A` 时把当时尚在编写、未提交的 AUTH 文件一并纳入，
提交信息只描述了 Voice 侧工作。两条工作流本身都没有错误，错在共享了工作区。

---

## 2. AUTH 文件完整清单

### 2.1 纯 AUTH（整文件或整段改动均属 AUTH，回滚时可整体处理）

| 文件 | 改动 | 迁移职责 |
|---|---|---|
| `backend/src/auth/supabase.ts` | 新增 144 行 | **Supabase 身份适配层**。JWKS(ES256) 本地验签、`iss` 判别、角色现查（`fetchActiveRoles`）、管理角色集合、显示名解析。全后端唯一懂 Supabase 认证细节的模块 |
| `backend/src/middleware/auth.ts` | +64 / −11 | `requireAuth` 按 `iss` 分流双签发者（**互不兜底**）；关闭原 dev 模式 fail-open；`requireAdmin` 改为现查 Supabase 角色 |
| `backend/src/config.ts` | +10 | 新增 `config.supabase`：`url` / `serviceKey` / `acceptLegacy` 迁移开关 |
| `backend/src/test/supabase-auth.test.ts` | 新增 198 行 | AUTH-M2/M3 接入验收（9 项） |
| `services/authService.ts` | +63 | 前端适配：`register/login/me/logout/ensureFreshAccessToken` 内部改走 Supabase，**对外签名一字未改** |
| `services/supabaseAuth.ts` | 新增 75 行 | 前端唯一直接调用 Supabase Auth 的模块；会话、token、profile、角色（展示用） |

### 2.2 混合文件（AUTH 与 Voice 各占一部分，**不可整体回滚**）

| 文件 | AUTH 部分 | Voice 部分 |
|---|---|---|
| `package.json` | 依赖 `"@supabase/supabase-js": "^2.114.0"` | scripts：`build` 前置 `check-voice-config.mjs`、新增 `voice:guard` |
| `package-lock.json` | supabase-js 及其依赖树 | Voice 侧安装内容 |

### 2.3 与 AUTH 无关（**回滚 AUTH 时绝不可恢复/删除**）

```
backend/src/server.ts                      ← LiveKit 就绪状态启动日志，纯 Voice
components/VoiceRoom/PrayerRoomPanel.tsx
components/VoiceRoom/VoiceDiagnostics.tsx
components/VoiceRoom/useRoomVoice.ts
docs/PRAYER_VOICE_DEVICE_ACCEPTANCE.md
docs/PRAYER_VOICE_PHASE4BR_REPORT.md
scripts/check-voice-config.mjs
services/voiceTransport/index.ts
services/voiceTransport/voiceErrors.ts
tests/services/voiceReleaseGuard.test.ts
```

> ⚠️ `backend/src/server.ts` 极易被误判为 AUTH 相关（它在 backend 目录、且与配置有关），
> 实际改动只是 LiveKit 就绪日志。**AUTH 回滚不得触碰此文件。**

---

## 3. AUTH-only diff 范围

取该提交中 AUTH 部分的精确 diff：

```bash
git show 376344d -- \
  backend/src/auth/supabase.ts \
  backend/src/config.ts \
  backend/src/middleware/auth.ts \
  backend/src/test/supabase-auth.test.ts \
  services/authService.ts \
  services/supabaseAuth.ts
```

`package.json` / `package-lock.json` 需**逐行**判别，不能整文件取。

---

## 4. 如果必须回滚 AUTH：操作清单

**不要** `git revert 376344d` —— 那会同时抹掉 Voice 的 Phase 4B-R 成果。

按路径逐项恢复到父版本 `c1ca1a2`：

```bash
# 1) 纯 AUTH 文件：恢复到父版本（新增的两个文件在父版本不存在，恢复即删除）
git checkout c1ca1a2 -- backend/src/config.ts backend/src/middleware/auth.ts services/authService.ts
git rm -f backend/src/auth/supabase.ts backend/src/test/supabase-auth.test.ts services/supabaseAuth.ts

# 2) 混合文件：只摘掉 AUTH 那一行依赖，保留 Voice 的 scripts 改动
#    package.json → 删除 "@supabase/supabase-js" 一行
#    package-lock.json → 删除该依赖后重新 npm install 生成
npm uninstall @supabase/supabase-js

# 3) ★ 以下路径一律不动（Voice 工作流成果）
#    backend/src/server.ts, components/VoiceRoom/**, services/voiceTransport/**,
#    scripts/check-voice-config.mjs, docs/PRAYER_VOICE_*, tests/services/voiceReleaseGuard.test.ts
```

回滚后需重跑：backend `npm test`、前端 `npx vitest run`，确认 Voice 侧不受影响。

---

## 5. 当前测试结果（在混合 commit 上取得）

| 套件 | 结果 |
|---|---|
| `backend/src/test/supabase-auth.test.ts` | **9/9 PASS** |
| `backend` smoke（`npm test`） | **88/88 PASS** |
| 前端 `npx vitest run` | **106/106 PASS**（15 个测试文件） |

关键通过项：
- 撤销 Supabase 角色后，**同一张旧 JWT 立即失去管理权限**（App 此前不具备的能力）
- **aal1 普通 student 可正常读写学习数据**，全程不需要 TOTP
- 伪造签名的 Supabase token 被拒，**不回退到 legacy 验签**
- 无凭据一律 401（原 `APP_SECRET` 缺失时的 fail-open 已改为 fail-closed）

> ⚠️ 以上结果取自混合 commit。按决定，这些**不作为 Auth 分支的正式 baseline**——
> baseline 在 `auth/supabase-unification` worktree 中重新取得，记录于本文件 §7。

---

## 6. 为什么没有重写 Git 历史

`376344d` 已经推进 `main`，且**同时包含 Voice 与 AUTH 两条工作流的成果**。
可选的"清理"手段各有代价：

| 手段 | 为什么不做 |
|---|---|
| `force push` | 会破坏其他工作流基于该提交的本地状态；协作分支上属高风险操作 |
| `amend` 已共享提交 | 同上；且该提交并非最新未推送提交 |
| `rebase` 已共享主分支 | 会重写他人已获取的历史，冲突与丢失风险远大于收益 |
| 整体 `revert 376344d` | **会连带撤销 Voice 的 Phase 4B-R 成果**，制造一个新的、更难解释的破坏 |

**结论：为了"漂亮的 Git 历史"而增加工程风险是不划算的。**
接受历史已混合的事实，用本文件提供精确的 AUTH 边界与回滚路径，
把可追溯性从"提交信息"转移到"显式清单"——这在工程上是等价且更安全的。

---

## 7. Auth 分支 baseline

**分支**：`auth/supabase-unification`
**worktree**：`C:\Users\enosl\Desktop\amas-auth-worktree`（独立目录、独立 `node_modules`）
**分支基点**：`376344d`

> 自本文件起，**所有 AUTH 改动一律是独立 AUTH commit**，不再与任何其他工作流混合。
> 主工作目录 `amas---asian-missionary-theological-seminary` 继续由祷告室工作流使用，
> AUTH 侧不再修改该目录中的任何文件。

baseline 复跑结果见 §8（在本 worktree 中重新取得）。

---

## 8. Auth 分支 baseline 复跑结果

在独立 worktree `amas-auth-worktree`（独立目录、独立 node_modules）复跑：

| 套件 | 结果 |
|---|---|
| 前端 `npx vitest run` | **106/106 PASS**（15 个测试文件） |
| 后端 `npm test`（smoke） | **88/88 PASS** |
| `backend/src/test/supabase-auth.test.ts` | **9/9 PASS**（AUTH-M3 后扩至 14/14） |

**这是 `auth/supabase-unification` 分支的正式 baseline。**
§5 中混合 commit 上的结果仅作历史记录，不再被引用。

自此之后的 AUTH 改动（`_promote` 移除、AUTH-M6 dry-run 工具等）
均为独立 AUTH commit，不与任何其他工作流混合。
