import { onUnmounted, ref } from "vue";

// 生成状态机：idle 空闲 / waiting 首字等待中 / streaming 流式输出中 / aborted 已暂停
export const GenStatus = {
  IDLE: "idle",
  WAITING: "waiting",
  STREAMING: "streaming",
  ABORTED: "aborted",
};

export function useGeneration() {
  // 当前生成状态，对外只读
  const status = ref(GenStatus.IDLE);
  // fetch 的取消控制器，每次生成新建一个，暂停/卸载时 abort
  const aborter = ref(null);

  const isIdle = () => status.value === GenStatus.IDLE;
  const isActive = () =>
    status.value === GenStatus.WAITING ||
    status.value === GenStatus.STREAMING;
  const isAborted = () => status.value === GenStatus.ABORTED;

  /** 是否正在输出（think 或 answer 任一到达即为 true，首字动画隐藏） */
  function markFirstToken() {
    if (status.value === GenStatus.WAITING) {
      status.value = GenStatus.STREAMING;
    }
  }

  /** 开始一次生成：建新控制器，状态置 waiting */
  function start() {
    aborter.value?.abort();
    aborter.value = new AbortController();
    status.value = GenStatus.WAITING;
    return aborter.value.signal;
  }

  /** 用户点击暂停：abort + 状态置 aborted，finally 负责归档已输出部分 */
  function abort() {
    if (!isActive()) return;
    aborter.value?.abort();
    status.value = GenStatus.ABORTED;
  }

  /** 生成正常结束 / 出错：状态回 idle。aborted 不覆盖，归档时要区分 */
  function finish() {
    if (status.value !== GenStatus.ABORTED) {
      status.value = GenStatus.IDLE;
    } else {
      // 暂停后再收尾，保持 aborted 供归档分支判断，调用方手动 reset
    }
  }

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
