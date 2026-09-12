import { useCallback, useRef, useState } from 'react';
import {
  cancelFriendRequest as apiCancelFriendRequest,
  unfriend as apiUnfriend,
  type OutgoingRequest,
} from '../../services/friendsService';

/**
 * 好友关系里两个**不可逆**操作的逻辑层：撤回自己发出的申请、解除好友。
 *
 * ## 为什么单独成一层
 *
 * 这两件事的难点全在异步与状态，不在 JSX：
 *
 * ```
 * 请求失败       界面**不能**先把关系删掉再说 —— 删了再回滚，用户会看见
 *                关系闪一下又回来；更糟的是回滚失败就等于凭空删了一段关系
 * 重复点击       连点两下会发两次 DELETE，第二次多半失败，
 *                于是明明成功了却弹「撤回失败」
 * 请求迟到       发起时是甲、回来时已经换成乙 —— 那个结果不能套在乙的列表上
 * ```
 *
 * 第三条跟本机存储那边是同一类问题（见 `services/scopedLocalStore.ts` 的
 * `owner` 绑定）。这里同样在**发起时**把身份记下来，回来再核一次。
 *
 * 放在 hook 里，`CommunityView` 只管画界面，这三条可以单独验
 * （`tests/components/Community/friendRelations.test.tsx`）。
 *
 * ## 边界
 *
 * 这一层只做「调用既有服务 + 成功了才改本地列表」。
 * **没有新增任何后端契约**：`cancelFriendRequest` / `unfriend` 与对应端点
 * 早就在仓里，只是此前没有任何界面调用过。
 */

export interface FriendRelationsOptions {
  /** 当前身份。请求迟到时靠它判断结果还算不算数。 */
  currentUserId?: string | null;
  showToast: (msg: string) => void;
  /** 撤回成功后从「我发出的」里移掉。 */
  onRequestCancelled: (requestId: string) => void;
  /** 解除成功后把这个人的状态改回未连接。 */
  onUnfriended: (userId: string) => void;
}

export interface FriendRelations {
  /** 正在处理中的 id 集合 —— 用来禁用按钮、挡住连点。 */
  busyIds: ReadonlySet<string>;
  cancelRequest: (req: OutgoingRequest) => Promise<void>;
  unfriendUser: (userId: string, displayName: string) => Promise<void>;
}

export function useFriendRelations(opts: FriendRelationsOptions): FriendRelations {
  const { currentUserId, showToast, onRequestCancelled, onUnfriended } = opts;
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  /* 判断「请求回来时是不是还是同一个人」，必须读**此刻**的身份。
     直接在 useCallback 里读 currentUserId 是不行的：正在跑的那次调用
     捏着的是发起时的闭包，换人之后它读到的还是旧值，守卫等于没写
     —— 第一版就是这样，三条迟到用例全红。用 ref 每次渲染同步。 */
  const currentIdRef = useRef<string | null>(currentUserId ?? null);
  currentIdRef.current = currentUserId ?? null;
  /* 用 ref 挡连点：setState 是异步的，连点两下时第二下读到的 busyIds
     还是旧值，挡不住。 */
  const inFlight = useRef<Set<string>>(new Set());

  const begin = useCallback((id: string): boolean => {
    if (inFlight.current.has(id)) return false;
    inFlight.current.add(id);
    setBusyIds(new Set(inFlight.current));
    return true;
  }, []);

  const end = useCallback((id: string) => {
    inFlight.current.delete(id);
    setBusyIds(new Set(inFlight.current));
  }, []);

  const cancelRequest = useCallback(async (req: OutgoingRequest) => {
    if (!begin(req.id)) return;                 // 连点：第二下直接忽略
    const owner = currentIdRef.current;        // 发起时的身份
    let ok = false;
    try {
      ok = await apiCancelFriendRequest(req.id);
    } catch {
      ok = false;
    } finally {
      end(req.id);
    }
    /* 回来时已经换人了：这个结果属于上一个身份，不能动现在这份列表。
       也不提示 —— 现在这个人没做过这件事，跟他说什么都是误导。 */
    if (currentIdRef.current !== owner) return;
    if (!ok) { showToast('撤回失败，请稍后重试'); return; }
    onRequestCancelled(req.id);                 // 只有成功才改列表
    showToast('已撤回申请');
  }, [begin, end, currentUserId, showToast, onRequestCancelled]);

  const unfriendUser = useCallback(async (userId: string, displayName: string) => {
    if (!begin(userId)) return;
    const owner = currentIdRef.current;
    let ok = false;
    try {
      ok = await apiUnfriend(userId);
    } catch {
      ok = false;
    } finally {
      end(userId);
    }
    if (currentIdRef.current !== owner) return;
    if (!ok) { showToast('解除失败，请稍后重试'); return; }
    onUnfriended(userId);                       // 失败时**一点都不动**这段关系
    showToast(`已解除与 ${displayName} 的好友关系`);
  }, [begin, end, currentUserId, showToast, onUnfriended]);

  return { busyIds, cancelRequest, unfriendUser };
}

export default useFriendRelations;
