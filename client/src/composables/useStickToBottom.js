import { onUnmounted, ref } from "vue";

// 判定“贴底”的容差（px）：用户停在底部附近都算想跟随，
// 避免 1~2px 的舍入误差导致状态抖动
const STICK_THRESHOLD = 48;

/**
 * 功能：创建粘性跟随状态，跟踪用户“想不想跟最新内容”。
 * @param {import("vue").Ref<HTMLElement|null>} elRef - 滚动容器的模板引用。
 * @param {number} [threshold=48] - 判定贴底的像素容差。
 * @returns {{isStick: import("vue").Ref<boolean>, isNearBottom: Function, stick: Function, unstick: Function, reset: Function, attach: Function, detach: Function}} 跟随状态与操作方法集合。
 */
export function useStickToBottom(elRef, threshold = STICK_THRESHOLD) {
  const isStick = ref(true);

  /**
   * 功能：判断元素是否滚动到接近底部。
   * @param {HTMLElement|null} el - 待判断的滚动容器。
   * @returns {boolean} true 为贴底（含容差），false 为用户已上翻。
   */
  function isNearBottom(el) {
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }

  /**
   * 功能：scroll 事件回调，根据当前位置刷新跟随态。
   * @param {void} 无参数，读取 elRef.value。
   * @returns {void} 无返回值。
   */
  function onScroll() {
    const el = elRef.value;
    if (!el) return;
    isStick.value = isNearBottom(el);
  }

  /**
   * 功能：手动恢复跟随（用户点回到底部时调用）。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function stick() {
    isStick.value = true;
  }

  /**
   * 功能：手动取消跟随。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function unstick() {
    isStick.value = false;
  }

  /**
   * 功能：新一轮生成开始时默认恢复跟随（用户刚提问，意图就是看新回答）。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function reset() {
    isStick.value = true;
  }

  /**
   * 功能：给滚动容器绑定 scroll 监听。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function attach() {
    elRef.value?.addEventListener("scroll", onScroll, { passive: true });
  }

  /**
   * 功能：解绑 scroll 监听，组件卸载时调用。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function detach() {
    elRef.value?.removeEventListener("scroll", onScroll);
  }

  onUnmounted(() => {
    detach();
  });

  return { isStick, isNearBottom, stick, unstick, reset, attach, detach };
}
