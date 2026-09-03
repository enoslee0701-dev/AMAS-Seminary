# Android Native Build Environment

**日期**：2026-09-03 · **阶段**：AUTH-M6.5B-Mobile
**状态**：**`Android Native Build Environment: READY`**

> 判定依据是**至少完成了一次真实 native build**，不是 `cap sync` 通过。

---

## 1. 版本依据（从工程实际配置推出，不是猜的）

| 来源 | 值 |
|---|---|
| `@capacitor/android` | `8.5.1` |
| `android/build.gradle` | AGP `8.13.0` |
| `gradle-wrapper.properties` | Gradle `8.14.3` |
| `android/variables.gradle` | `minSdk 24` · `compileSdk 36` · `targetSdk 36` |

→ AGP 8.x 需 JDK 17+；Capacitor 8 走 JDK 21 LTS。选 **Temurin 21**。

---

## 2. 已安装

| 项 | 版本 / 位置 |
|---|---|
| JDK | Temurin **21.0.12.1** LTS · `C:\Users\enosl\scoop\apps\temurin21-jdk\current` |
| Android SDK | `C:\Users\enosl\scoop\apps\android-clt\current`（scoop `android-clt`） |
| SDK Platform | `platforms/android-36`（`android.jar` 已就位） |
| Build Tools | `build-tools/36.0.0` |
| Platform Tools | `platform-tools`，**adb 1.0.41** |
| SDK licenses | 7 项全部接受（`$ANDROID_HOME/licenses/`） |

安装命令：

```bash
scoop bucket add java && scoop install temurin21-jdk
scoop bucket add extras && scoop install android-clt
# licenses：sdkmanager.bat 的 .bat 包装不吃 PowerShell 管道，需用 cmd 重定向
cmd /c "sdkmanager.bat --sdk_root=%ANDROID_HOME% --licenses < yes.txt"
sdkmanager --sdk_root=%ANDROID_HOME% "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

---

## 3. 环境变量（已写入用户级）

```
JAVA_HOME        = C:\Users\enosl\scoop\apps\temurin21-jdk\current
ANDROID_HOME     = C:\Users\enosl\scoop\apps\android-clt\current
ANDROID_SDK_ROOT = 同上
PATH            += %ANDROID_HOME%\platform-tools
                 + %ANDROID_HOME%\cmdline-tools\latest\bin
```

`android/local.properties` 由本机生成并已 gitignore（含机器绝对路径，不入库）。

---

## 4. 验收结果

| # | 项目 | 结果 |
|---|---|---|
| 1 | 确定所需 JDK 版本 | **PASS** 由 AGP/Gradle/Capacitor 版本推出 JDK 21 |
| 2 | 安装并确认 JDK | **PASS** `openjdk 21.0.12.1 LTS` |
| 3 | Android SDK | **PASS** |
| 4 | `ANDROID_HOME` | **PASS** 用户级持久化 |
| 5 | SDK Platform | **PASS** `android-36` |
| 6 | Build Tools | **PASS** `36.0.0` |
| 7 | Platform Tools / adb | **PASS** `adb 1.0.41` |
| 8 | Gradle 环境 | **PASS** wrapper 8.14.3 自动下载可用 |
| 9 | `npx cap sync android` | **PASS** |
| 10 | **native Gradle build** | **PASS** `BUILD SUCCESSFUL in 3m 11s`，185 tasks |
| 11 | debug APK | **PASS** `app-debug.apk` **23.3 MB** |
| 12 | adb 识别真机 | **未满足** —— adb 可用，但**当前无真机连接** |

### 额外核验：deep link 真的进了 APK

不只是读源码 XML，而是用 `aapt2 dump xmltree` 从**编译产物**里反查：

```
OK 包含 amas-seminary
OK 包含 "auth"
OK 包含 "/recovery"
OK 无 pathPrefix
```

这证明 D-AUTH-R3 的精确路由约束真的编进了 APK，不是只写在源文件里。

---

## 5. 结论与限制

**`Android Native Build Environment: READY`**（第 12 项除外）

- 第 12 项需要插入 Android 真机并开启 USB 调试。`adb devices` 当前只显示一个
  `emulator-5554 offline`（既有的模拟器进程，非真机，且未就绪）。
- **emulator PASS ≠ 真机 PASS。** 真机验收清单见下。

---

## 6. 真机验收待办（`Android Recovery Acceptance`）

环境已就绪，插上真机即可执行：

**Launch state**：App 完全关闭 / 后台 / 前台三态**从真实邮件点击** recovery deep link，
三者必须进入**相同**的 canonical handler 与 normalized recovery flow。
（路由本身的 wrong scheme/host/path 用上面 (a) 的非秘密占位值验证。）

**Credential**：设置新密码 · password mutation 恰好一次 · Person ID 不变 ·
roles 不变 · application / student / CP / learning owner 均不变。

**Session**：recovery 后 session 建立 · kill App · 重开 · session restore ·
token refresh · logout · logout 后旧 session 不可继续使用。

**Link safety**：replay · expired · 同一邮件重复点击 · 同 deep link 连点 5 次 ·
wrong scheme / host / path · malformed credential。

**Weak network**：finalize 前断网 · processing 中网络异常 · 网络恢复 ·
`failed_retryable` 正常恢复 · 不产生第二 active flow · password mutation 仍最多一次。

**Secret exposure**：Android logcat · console · WebView URL · recent navigation state ·
crash/error output —— 均不得出现 recovery credential 或密码明文。

### 两类验证必须分开，不能混用

**(a) Routing-only —— 只验 intent 路由，禁止使用真实凭据**

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# ★ 只用**明确的非秘密占位值**。这条命令仅用于验证 Android intent routing，
#   **不用于真实 credential recovery**。
adb shell am start -a android.intent.action.VIEW -d "amas-seminary://auth/recovery#access_token=TEST_ONLY_NON_SECRET"

# 反例路由（应当不唤起 / 不进入 recovery）
adb shell am start -a android.intent.action.VIEW -d "amasapp://auth/recovery#access_token=TEST_ONLY_NON_SECRET"
adb shell am start -a android.intent.action.VIEW -d "amas-seminary://evil/recovery#access_token=TEST_ONLY_NON_SECRET"
adb shell am start -a android.intent.action.VIEW -d "amas-seminary://auth/login#access_token=TEST_ONLY_NON_SECRET"
```

> **绝不要把真实 `access_token` / `refresh_token` / recovery token 写进 adb 命令行。**
> 命令行会进入 shell history、terminal capture、调试输出、CI 日志与排障记录，
> 那等于给一次性凭据做了多份持久副本。

**(b) 真实 recovery 验收 —— 必须走完整邮件链路**

```
测试/正式邮箱收到 Supabase recovery mail
  → 在 Android 真机的邮件客户端里**点击**
  → 系统唤起 AMAS App
  → canonical recovery handler
  → Supabase credential validation
  → AMAS recovery flow
  → password finalization
```

> **不要**从真实邮件里把 token 复制出来再塞进 `adb am start`。
> 那既制造了凭据副本，也绕过了真正要验的东西 —— 邮件客户端到 App 的唤起链路。
