import { onUnmounted, ref } from "vue";

// 生成状态机：idle 空闲 / waiting 首字等待中 / streaming 流式输出中 / aborted 已暂停
export const GenStatus = {
  IDLE: "idle",
  WAITING: "waiting",
  STREAMING: "streaming",
  ABORTED: "aborted",
};

/**
 * 功能：创建问答生成状态机，管理 idle/waiting/streaming/aborted 流转与取消控制器。
 * @param {void} 无参数。
 * @returns {{status: import("vue").Ref<string>, aborter: import("vue").Ref<AbortController|null>, isIdle: Function, isActive: Function, isAborted: Function, markFirstToken: Function, start: Function, abort: Function, finish: Function, reset: Function}} 状态与操作方法集合。
 */
export function useGeneration() {
  // 当前生成状态，对外只读
  const status = ref(GenStatus.IDLE);
  // fetch 的取消控制器，每次生成新建一个，暂停/卸载时 abort
  const aborter = ref(null);

  /**
   * 功能：判断当前是否空闲，可发起新问答。
   * @param {void} 无参数。
   * @returns {boolean} true 为 idle。
   */
  const isIdle = () => status.value === GenStatus.IDLE;

  /**
   * 功能：判断当前是否处于生成中（waiting 或 streaming），提交按钮据此切换为暂停。
   * @param {void} 无参数。
   * @returns {boolean} true 为生成中。
   */
  const isActive = () =>
    status.value === GenStatus.WAITING ||
    status.value === GenStatus.STREAMING;

  /**
   * 功能：判断当前是否为用户主动暂停态。
   * @param {void} 无参数。
   * @returns {boolean} true 为已暂停。
   */
  const isAborted = () => status.value === GenStatus.ABORTED;

  /**
   * 功能：首个 think/answer 到达时由 waiting 切为 streaming，隐藏首字等待动画。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function markFirstToken() {
    if (status.value === GenStatus.WAITING) {
      status.value = GenStatus.STREAMING;
    }
  }

  /**
   * 功能：开始一次生成，废弃旧控制器并新建，状态置 waiting。
   * @param {void} 无参数。
   * @returns {AbortSignal} 新控制器的 signal，透传给 fetch 与流解析器。
   */
  function start() {
    aborter.value?.abort();
    aborter.value = new AbortController();
    status.value = GenStatus.WAITING;
    return aborter.value.signal;
  }

  /**
   * 功能：用户点击暂停，中断请求并置 aborted，finally 负责归档已输出部分。
   * @param {void} 无参数，非 active 态直接返回。
   * @returns {void} 无返回值。
   */
  function abort() {
    if (!isActive()) return;
    aborter.value?.abort();
    status.value = GenStatus.ABORTED;
  }

  /**
   * 功能：生成正常结束或出错时收尾，非 aborted 回 idle；aborted 保持以供归档区分。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function finish() {
    if (status.value !== GenStatus.ABORTED) {
      status.value = GenStatus.IDLE;
    } else {
      // 暂停后再收尾，保持 aborted 供归档分支判断，调用方手动 reset
    }
  }

  /**
   * 功能：暂停归档后手动回到 idle，清空控制器。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function reset() {
    status.value = GenStatus.IDLE;
    aborter.value = null;
  }

  onUnmounted(() => {
    aborter.value?.abort();
  });

  return {
    status,
    aborter,
    isIdle,
    isActive,
    isAborted,
    markFirstToken,
    start,
    abort,
    finish,
    reset,
  };
}
