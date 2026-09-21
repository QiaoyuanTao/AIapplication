import { nextTick } from "vue";

// 滚动节流：流式每秒几十个 token，直接同步 scroll 会掉帧，
// 用 rAF 把多次滚动合并成一帧一次
let chatRafId = 0;
let thinkRafId = 0;

/**
 * 功能：将回调推迟到下一动画帧执行，合并高频滚动，避免掉帧。
 * @param {Function} fn - 实际执行滚动的回调函数，无参数。
 * @returns {void} 无返回值。
 */
function rafChat(fn) {
  cancelAnimationFrame(chatRafId);
  chatRafId = requestAnimationFrame(fn);
}

/**
 * 功能：将思考框滚动回调推迟到下一动画帧执行，与对话区滚动互不干扰。
 * @param {Function} fn - 实际执行滚动的回调函数，无参数。
 * @returns {void} 无返回值。
 */
function rafThink(fn) {
  cancelAnimationFrame(thinkRafId);
  thinkRafId = requestAnimationFrame(fn);
}

/**
 * 功能：对话区原子滚动到底，不做任何跟随意图判断。
 * @param {HTMLElement|null} chatBoxEl - 对话区滚动容器（.chat-area）。
 * @returns {Promise<void>} 异步返回滚动调度完成的 Promise，无业务返回值。
 */
export async function scrollChatElToBottom(chatBoxEl) {
  if (!chatBoxEl) return;
  await nextTick();
  rafChat(() => {
    chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
  });
}

/**
 * 功能：思考框内部原子滚动到底，不做任何跟随意图判断。
 * @param {HTMLElement|null} thinkEl - 思考正文容器（.think-content）。
 * @returns {Promise<void>} 异步返回滚动调度完成的 Promise，无业务返回值。
 */
export async function scrollThinkElToBottom(thinkEl) {
  if (!thinkEl) return;
  await nextTick();
  rafThink(() => {
    thinkEl.scrollTop = thinkEl.scrollHeight;
  });
}

/**
 * 功能：遗留入口，一次性将思考框内部与对话区都滚到底。
 * @param {HTMLElement|null} thinkEl - 思考正文容器，仅非流式场景使用。
 * @param {HTMLElement|null} chatBoxEl - 对话区滚动容器。
 * @returns {Promise<void>} 异步返回双层滚动完成的 Promise，无业务返回值。
 */
export async function scrollThinkToBottom(thinkEl, chatBoxEl) {
  await scrollThinkElToBottom(thinkEl);
  await scrollChatElToBottom(chatBoxEl);
}

/**
 * 功能：取消未执行的 rAF 滚动帧，组件卸载或状态回 idle 时调用。
 * @param {void} 无参数。
 * @returns {void} 无返回值。
 */
export function cancelPendingScroll() {
  cancelAnimationFrame(chatRafId);
  cancelAnimationFrame(thinkRafId);
}
