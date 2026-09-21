import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  cancelPendingScroll,
  scrollChatElToBottom,
  scrollThinkElToBottom,
} from "./useAutoScroll";
import { GenStatus, useGeneration } from "./useGeneration";
import { useStickToBottom } from "./useStickToBottom";
import { readNdjsonStream } from "./useStreamReader";
import { useAttachments } from "./useAttachments";

/**
 * 功能：创建聊天页全部状态与行为（消息列表/流式问答/滚动跟随/附件）。
 * @param {void} 无参数。
 * @returns {{input: Ref<string>, message: Ref<Array>, newMessage: Ref<Object>, status: Ref<string>, action: ComputedRef<Object>, suggestions: string[], thinkEnabled: Ref<boolean>, chatBox: Ref, thinkBox: Ref, attachments: Object, showBackToBottom: ComputedRef<boolean>, handleThinkChunk: Function, handleAnswerChunk: Function, backToBottom: Function, resetStreaming: Function, handleSubmit: Function, openFilePicker: Function, onFilesPicked: Function, toggleThink: Function}} 聊天状态与方法集合。
 */
export function useChat() {
  const input = ref("");
  const message = ref([]);
  const newMessage = ref({
    role: "ai",
    content: "",
    thinking: "",
    thinkingDone: false,
    thinkOpen: true,
  });
  const generation = useGeneration();
  const status = generation.status;
  const chatBox = ref(null);
  const thinkBox = ref(null);
  const thinkEnabled = ref(true);
  const chatStick = useStickToBottom(chatBox);
  const thinkStick = useStickToBottom(thinkBox);
  const attachments = useAttachments();
  const fileInput = ref(null);
  const suggestions = [
    "用通俗的语言解释什么是机器学习",
    "帮我制定一个月的前端学习计划",
    "HTTP 和 HTTPS 的区别是什么？",
    "什么是 Promise？举个例子",
  ];

  /**
   * 功能：根据生成状态派生发送按钮展示态。
   * @param {void} 无参数，依赖 status。
   * @returns {{mode: string, title: string, disabled: boolean}} 按钮模式与提示。
   */
  const action = computed(() => {
    if (status.value === GenStatus.IDLE)
      return { mode: "send", title: "发送", disabled: false };
    if (status.value === GenStatus.WAITING)
      return {
        mode: "waiting",
        title: "等待模型响应，点击取消",
        disabled: false,
      };
    return { mode: "stop", title: "停止生成", disabled: false };
  });

  /**
   * 功能：判断是否展示回到底部按钮。
   * @param {void} 无参数，依赖 chatStick/message/newMessage。
   * @returns {boolean} true 展示。
   */
  const showBackToBottom = computed(() => {
    if (chatStick.isStick.value) return false;
    return (
      message.value.length > 0 ||
      !!newMessage.value.content ||
      !!newMessage.value.thinking
    );
  });

  /**
   * 功能：打开系统文件选择框。
   * @param {void} 无参数，依赖 action/fileInput。
   * @returns {void} 无返回值。
   */
  function openFilePicker() {
    if (action.value.mode !== "send") return;
    fileInput.value?.click();
  }

  /**
   * 功能：文件选中后加入附件列表并重置 input。
   * @param {Event} event - change 事件，event.target.files 为 FileList。
   * @returns {void} 无返回值。
   */
  function onFilesPicked(event) {
    attachments.addFiles(event.target.files);
    event.target.value = "";
  }

  /**
   * 功能：切换思考块展开/折叠。
   * @param {Object} item - 消息对象，需含 thinkOpen:boolean。
   * @returns {void} 无返回值。
   */
  function toggleThink(item) {
    item.thinkOpen = !item.thinkOpen;
  }

  /**
   * 功能：获取思考框 DOM，优先用 thinkBox 引用，子组件化后兜底查 DOM。
   * @param {void} 无参数。
   * @returns {HTMLElement|null} 思考正文容器。
   */
  function resolveThinkEl() {
    return (
      thinkBox.value?.$el?.querySelector?.(".think-content") ??
      thinkBox.value ??
      document.querySelector(".think-content")
    );
  }

  /**
   * 功能：处理 think 流增量并按跟随意图滚动。
   * @param {void} 无参数。
   * @returns {Promise<void>} 滚动完成。
   */
  async function handleThinkChunk() {
    newMessage.value.thinkOpen = true;
    if (thinkStick.isStick.value) await scrollThinkElToBottom(resolveThinkEl());
    if (chatStick.isStick.value) await scrollChatElToBottom(chatBox.value);
  }

  /**
   * 功能：处理 answer 流增量，折叠思考并滚对话区到底。
   * @param {void} 无参数。
   * @returns {Promise<void>} 滚动完成。
   */
  async function handleAnswerChunk() {
    if (!newMessage.value.thinkingDone) {
      newMessage.value.thinkingDone = true;
      if (newMessage.value.thinking) newMessage.value.thinkOpen = false;
    }
    if (chatStick.isStick.value) await scrollChatElToBottom(chatBox.value);
  }

  /**
   * 功能：恢复跟随并双层滚到底。
   * @param {void} 无参数。
   * @returns {Promise<void>} 滚动完成。
   */
  async function backToBottom() {
    chatStick.stick();
    thinkStick.stick();
    await scrollThinkElToBottom(resolveThinkEl());
    await scrollChatElToBottom(chatBox.value);
  }

  /**
   * 功能：清空流式草稿回待机态。
   * @param {void} 无参数。
   * @returns {void} 无返回值。
   */
  function resetStreaming() {
    newMessage.value.content = "";
    newMessage.value.thinking = "";
    newMessage.value.thinkingDone = false;
    newMessage.value.thinkOpen = true;
  }

  /**
   * 功能：提交总入口，生成中则暂停，空闲则发起流式问答并归档。
   * @param {void} 无参数，读取 input/attachments/generation。
   * @returns {Promise<void>} 整轮问答结束。
   */
  async function handleSubmit() {
    if (generation.isActive()) {
      generation.abort();
      return;
    }
    const question = input.value.trim();
    if ((!question && !attachments.hasFiles.value) || !generation.isIdle())
      return;
    message.value.push({
      role: "user",
      content: question,
      files: attachments.files.value.map((i) => ({
        name: i.name,
        sizeText: i.sizeText,
        kind: i.kind,
      })),
    });
    input.value = "";
    attachments.clear();
    resetStreaming();
    chatStick.reset();
    thinkStick.reset();
    const signal = generation.start();
    await scrollChatElToBottom(chatBox.value);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, think: thinkEnabled.value }),
        signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        newMessage.value.content = err.error || "请求失败，请稍后重试";
        newMessage.value.thinkingDone = true;
        newMessage.value.thinkOpen = false;
        return;
      }
      const { think, answer } = await readNdjsonStream({
        response: res,
        signal,
        onThink: async (_d, total) => {
          generation.markFirstToken();
          newMessage.value.thinking = total;
          await handleThinkChunk();
        },
        onAnswer: async (_d, total) => {
          generation.markFirstToken();
          newMessage.value.content = total;
          await handleAnswerChunk();
        },
      });
      if (think || answer) {
        generation.markFirstToken();
        if (answer && !newMessage.value.thinkingDone) {
          newMessage.value.thinkingDone = true;
          if (think) newMessage.value.thinkOpen = false;
        }
      }
      if (chatStick.isStick.value) await scrollChatElToBottom(chatBox.value);
    } catch (error) {
      if (error?.name === "AbortError" || generation.isAborted())
        newMessage.value.thinkingDone = true;
      else {
        console.error("请求失败:", error);
        newMessage.value.content =
          newMessage.value.content || "网络错误，请稍后重试";
        newMessage.value.thinkingDone = true;
      }
    } finally {
      const wasAborted = generation.isAborted();
      if (newMessage.value.content || newMessage.value.thinking) {
        message.value.push({
          role: "ai",
          content: newMessage.value.content,
          thinking: newMessage.value.thinking,
          thinkingDone: true,
          thinkOpen: false,
          stopped: wasAborted,
        });
        resetStreaming();
      } else if (!wasAborted)
        message.value.push({ role: "ai", content: "未收到回答" });
      else message.value.push({ role: "ai", content: "已停止生成" });
      generation.finish();
      if (wasAborted) generation.reset();
      if (chatStick.isStick.value) await scrollChatElToBottom(chatBox.value);
    }
  }

  watch(status, (val) => {
    if (val === GenStatus.IDLE) cancelPendingScroll();
  });
  watch(
    () => !!newMessage.value.thinking,
    (has) => {
      if (has) thinkStick.attach();
    },
  );
  onMounted(() => {
    chatStick.attach();
    chatBox.value?.addEventListener(
      "scroll",
      (e) => {
        const t = e.target;
        if (t?.classList?.contains("think-content"))
          thinkStick.isStick.value = thinkStick.isNearBottom(t);
      },
      { passive: true, capture: true },
    );
  });
  onUnmounted(() => {
    cancelPendingScroll();
    chatStick.detach();
    thinkStick.detach();
  });

  return {
    input,
    message,
    newMessage,
    status,
    action,
    suggestions,
    thinkEnabled,
    chatBox,
    thinkBox,
    fileInput,
    attachments,
    showBackToBottom,
    openFilePicker,
    onFilesPicked,
    toggleThink,
    backToBottom,
    handleSubmit,
  };
}
