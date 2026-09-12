/**
 * 写操作的结果类型：成功带数据，失败带**原因**。
 *
 * ## 为什么要有这个文件
 *
 * 三个管理服务（图书馆书目 / 公告 / 课件）原来都是这么写的：
 *
 * ```ts
 * if (!res.ok) {
 *   console.warn('… backend rejected:', res.status);   // 状态码只进控制台
 *   return null;                                       // 界面拿到的只有 null
 * }
 * ```
 *
 * 于是 401、403、501、503、500、以及「请求根本没发出去」，到了界面上
 * **全都长一个样**。界面只好说一句「可能是没有管理权限，也可能是没连上服务器」。
 *
 * 这句话有两个毛病：
 *
 * ```
 * 漏了 503     服务在、答了、只是数据面没配 —— 本地联调下这是最常见的那个
 * 说错了归因   把 503 说成「没连上服务器」，让人白白去查网络
 * ```
 *
 * 503 不是推测出来的。本地联调实测（见 work/app-event-handoff.md §7）：
 * DB-13B / 13C 把书目 / 公告 / 目录的数据面切到 Postgres 之后**没有 SQLite
 * 回落**，未配 staging 时这些端点直接 503 `Staging database not configured.`。
 *
 * ## 边界
 *
 * 这一层只负责**如实转述服务端说了什么**。它不判断用户到底有没有权限
 * —— 那是服务端的事，前端连猜都不该猜。
 */

export type FailureReason =
  /** 这个构建里根本没配后端地址，请求没发出去 */
  | 'not-configured'
  /** 401 —— 没带上有效身份 */
  | 'unauthorized'
  /** 403 —— 身份有效，但服务端不让这个账号做 */
  | 'forbidden'
  /** 503 —— 服务在，数据面不可用 */
  | 'unavailable'
  /** 501 —— 服务端明确不支持这项操作（如课程目录写入被永久停用） */
  | 'not-supported'
  /** 其它 5xx */
  | 'server-error'
  /** 其它 4xx（400 / 404 / 409 …）—— 服务端不接受这次提交 */
  | 'rejected'
  /** fetch 抛了：请求没送到 */
  | 'network';

export interface ApiFailure {
  ok: false;
  reason: FailureReason;
  /** 实际 HTTP 状态码；没发出去的请求没有这个值 */
  status?: number;
  /** 服务端自报的 code，如 CATALOG_MUTATION_UNSUPPORTED */
  code?: string;
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

/**
 * 判失败要用这个函数，不要直接写 `if (!res.ok)`。
 *
 * 本仓的 tsconfig 没开 strictNullChecks，这种配置下 TypeScript **不会**按
 * 布尔字面量（ok: true / ok: false）收窄联合类型 —— 写 `if (!res.ok)` 之后
 * 访问 res.reason 会直接报 TS2339。用户自定义类型守卫两个分支都能正常收窄，
 * 所以统一走这里。（字符串字面量判别式也可以，但那样 ok 字段就得改名，
 * 读起来反而绕。）
 */
export const failed = <T,>(r: ApiResult<T>): r is ApiFailure => r.ok === false;

export const apiOk = <T>(data: T): ApiResult<T> => ({ ok: true, data });

export const apiFail = (
  reason: FailureReason,
  status?: number,
  code?: string,
): ApiFailure => ({ ok: false, reason, status, code });

/**
 * HTTP 状态码 → 失败原因。
 * 没有状态码（或 0）说明请求压根没发出去，归为网络问题。
 */
export function classifyFailure(status?: number): FailureReason {
  if (!status) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 501) return 'not-supported';
  if (status === 503) return 'unavailable';
  if (status >= 500) return 'server-error';
  return 'rejected';
}

/**
 * 从一个失败的 Response 造出 ApiFailure，顺带读一下服务端自报的 code。
 * 读 body 失败不影响分类 —— 状态码本身已经够用了。
 */
export async function failureFromResponse(res: Response): Promise<ApiFailure> {
  let code: string | undefined;
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    if (typeof body?.code === 'string') code = body.code;
  } catch {
    /* 有的响应没有 JSON body，无所谓 */
  }
  return apiFail(classifyFailure(res.status), res.status, code);
}

/**
 * 给用户看的一句话。`action` 是这个入口自己的动词（保存 / 发布 / 删除 /
 * 上传），这样同一套原因在不同入口说的是不同的事。
 *
 * 几条自己给自己定的规矩：
 *
 * ```
 * 只有 network 才提「连不上」        —— 503 是连上了的
 * 只有 401 / 403 才提登录与权限      —— 别的情况不许暗示用户没权限
 * 501 不叫人重试                     —— 重试一百次也还是不支持
 * 不写「一定是…」                    —— 服务端说了什么就转述什么
 * ```
 *
 * **只说「为什么没成」，不说后果。**「内容已保留」「书目未改动」
 * 「文件没有上传」这类话由各个入口自己接在后面 —— 只有它知道自己
 * 到底保留了什么。这一层最初把「内容已保留」写死在每句话里，结果
 * 图书馆那条「加载书目失败」的横幅也跟着说「内容已保留」，不知所云。
 */
export function failureMessage(reason: FailureReason, action: string): string {
  switch (reason) {
    case 'not-configured':
      return `${action}没有完成：这个版本没有配置后端地址，请求没有发出去。`;
    case 'unauthorized':
      return `${action}没有完成：登录状态已失效，请重新登录后再操作。`;
    case 'forbidden':
      return `${action}没有完成：服务端拒绝了，当前账号没有这项操作的权限。`;
    case 'unavailable':
      return `${action}没有完成：服务器答复数据服务暂时不可用，稍后可重试。`;
    case 'not-supported':
      return `${action}没有完成：服务端不支持这项操作。`;
    case 'server-error':
      return `${action}没有完成：服务器出错了，稍后可重试。`;
    case 'rejected':
      return `${action}没有完成：服务端不接受这次提交，请检查内容后再提交一次。`;
    case 'network':
    default:
      return `${action}没有完成：连不上服务器，稍后可重试。`;
  }
}

/** 只有这几种重试才有意义；501 / 403 重试一百次也一样。 */
export function isRetryable(reason: FailureReason): boolean {
  return reason === 'unavailable' || reason === 'server-error' || reason === 'network';
}
