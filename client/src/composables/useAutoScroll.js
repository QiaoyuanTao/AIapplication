import { nextTick } from "vue";

// 滚动节流：流式每秒几十个 token，直接同步 scroll 会掉帧，
// 用 rAF 把多次滚动合并成一帧一次
let chatRafId = 0;
let thinkRafId = 0;

function rafChat(fn) {
  cancelAnimationFrame(chatRafId);
  chatRafId = requestAnimationFrame(fn);
}

function rafThink(fn) {
  cancelAnimationFrame(thinkRafId);
  thinkRafId = requestAnimationFrame(fn);
}

/** 原子滚动：对话区滚到底，不做任何意图判断 */
export async function scrollChatElToBottom(chatBoxEl) {
  if (!chatBoxEl) return;
  await nextTick();
  rafChat(() => {
    chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
  });
}

/** 原子滚动：思考框内部滚到底，不做任何意图判断 */
export async function scrollThinkElToBottom(thinkEl) {
  if (!thinkEl) return;
  await nextTick();
  rafThink(() => {
    thinkEl.scrollTop = thinkEl.scrollHeight;
  });
}

/**
 * 遗留入口：思考框内部滚到底 + 对话区跟随
 * 仅用于非流式场景（如提交问题后）；流式中请走跟随门控版本
 */
export async function scrollThinkToBottom(thinkEl, chatBoxEl) {
  await scrollThinkElToBottom(thinkEl);
  await scrollChatElToBottom(chatBoxEl);
}

/** 取消未执行的滚动帧，组件卸载时调用 */
export function cancelPendingScroll() {
  cancelAnimationFrame(chatRafId);
  cancelAnimationFrame(thinkRafId);
}
