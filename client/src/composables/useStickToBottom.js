import { onUnmounted, ref } from "vue";

// 判定“贴底”的容差（px）：用户停在底部附近都算想跟随，
// 避免 1~2px 的舍入误差导致状态抖动
const STICK_THRESHOLD = 48;

/**
 * 粘性跟随：跟踪用户“想不想跟最新内容”。
 * - 用户滚到底部附近 => stick=true，后续新内容自动跟；
 * - 用户主动往上翻 => stick=false，新内容不再抢滚动；
 * - 用户再滚回底部 / 点回到底部按钮 => 恢复 stick=true。
 *
 * elRef 绑定后自动监听 scroll，返回 isStick 状态 + 手动恢复方法。
 */
export function useStickToBottom(elRef, threshold = STICK_THRESHOLD) {
  const isStick = ref(true);

  function isNearBottom(el) {
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }

  function onScroll() {
    const el = elRef.value;
    if (!el) return;
    isStick.value = isNearBottom(el);
  }

  function stick() {
    isStick.value = true;
  }

  function unstick() {
    isStick.value = false;
  }

  /** 新一轮生成开始：默认恢复跟随（用户刚提问，意图就是看新回答） */
  function reset() {
    isStick.value = true;
  }

  function attach() {
    elRef.value?.addEventListener("scroll", onScroll, { passive: true });
  }

  function detach() {
    elRef.value?.removeEventListener("scroll", onScroll);
  }

  onUnmounted(() => {
    detach();
  });

  return { isStick, isNearBottom, stick, unstick, reset, attach, detach };
}
