<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  cancelPendingScroll,
  scrollChatElToBottom,
  scrollThinkElToBottom,
  scrollThinkToBottom,
} from "./composables/useAutoScroll";
import { GenStatus, useGeneration } from "./composables/useGeneration";
import { useStickToBottom } from "./composables/useStickToBottom";
import { readNdjsonStream } from "./composables/useStreamReader";
import {
  ATTACH_ACCEPT,
  ATTACH_RULES,
  useAttachments,
} from "./composables/useAttachments";
import { PhLinkSimple } from "@phosphor-icons/vue";

const input = ref("");
const message = ref([]);
// 正在流式输出的 AI 气泡，thinking 与 content 分开存，完成后一起归档
const newMessage = ref({
  role: "ai",
  content: "",
  thinking: "",
  thinkingDone: false,
  thinkOpen: true,
});
// 生成状态机：idle / waiting / streaming / aborted，控制按钮样式与暂停
const generation = useGeneration();
const status = generation.status;
const chatBox = ref(null);
const thinkBox = ref(null);
// 是否请求模型的思考过程（对应 Ollama think 参数）
const thinkEnabled = ref(true);

// 粘性跟随：对话区 + 思考框各跟踪一份“用户想不想跟最新内容”
const chatStick = useStickToBottom(chatBox);
const thinkStick = useStickToBottom(thinkBox);

// 附件：纸夹按钮选取的本地文件，发送后清空
const attachments = useAttachments();
const fileInput = ref(null);

/**
 * 功能：打开系统文件选择框，用于选取图片/文档附件。
 * 前置条件：仅在空闲可发送状态（action.mode === 'send'）下有效，生成中点击无效。
 * @param {void} 无参数，依赖 fileInput 模板引用与 action 计算属性。
 * @returns {void} 无返回值，直接触发 fileInput.click()。
 */
function openFilePicker() {
  if (action.value.mode !== "send") return;
  fileInput.value?.click();
}

/**
 * 功能：将用户选取的文件加入附件列表，并重置 input 以支持重复选择同一文件。
 * @param {Event} event - 原生 change 事件，event.target.files 为 FileList，event.target 为 HTMLInputElement。
 * @returns {void} 无返回值，校验与报错由 useAttachments.addFiles 内部处理。
 */
function onFilesPicked(event) {
  attachments.addFiles(event.target.files);
  // 同一文件删后重选也要能触发 change
  event.target.value = "";
}

// 空状态下的快捷提问（点击直接填入输入框）
const suggestions = [
  "用通俗的语言解释什么是机器学习",
  "帮我制定一个月的前端学习计划",
  "HTTP 和 HTTPS 的区别是什么？",
  "什么是 Promise？举个例子",
];

/**
 * 功能：根据生成状态机派生发送按钮的展示态与行为。
 * @param {void} 无参数，依赖 status（GenStatus.IDLE / WAITING / STREAMING / ABORTED）。
 * @returns {{mode: 'send'|'waiting'|'stop', title: string, disabled: boolean}} 按钮模式、悬浮提示、是否禁用。
 */
const action = computed(() => {
  if (status.value === GenStatus.IDLE) {
    return { mode: "send", title: "发送", disabled: false };
  }
  if (status.value === GenStatus.WAITING) {
    return { mode: "waiting", title: "等待模型响应，点击取消", disabled: false };
  }
  // streaming：可暂停；aborted 的瞬间也按停止态展示，归档后回 idle
  return { mode: "stop", title: "停止生成", disabled: false };
});

/**
 * 功能：切换指定消息思考块的展开/折叠状态。
 * @param {Object} item - 消息对象，需含 thinkOpen 字段；传入 newMessage 或 message 列表中的 item。
 * @param {boolean} item.thinkOpen - 当前是否展开，函数内取反。
 * @returns {void} 无返回值，直接原地修改 item.thinkOpen。
 */
function toggleThink(item) {
  item.thinkOpen = !item.thinkOpen;
}

/**
 * 功能：处理 think 流增量——强制展开思考框，并按粘性跟随意图滚动。
 * @param {void} 无参数，读取 newMessage.thinking / thinkStick / chatStick / thinkBox / chatBox 响应式状态。
 * @returns {Promise<void>} 异步返回滚动完成的 Promise，无业务返回值。
 */
async function handleThinkChunk() {
  newMessage.value.thinkOpen = true;
  // 情况 A：框内跟随 -> 框内滚到底；对话区看 chatStick 决定跟不跟
  // 情况 B：用户在框内上翻 -> 只滚对话区（如果对话区还想跟），框内不动
  if (thinkStick.isStick.value) {
    await scrollThinkElToBottom(thinkBox.value);
  }
  if (chatStick.isStick.value) {
    await scrollChatElToBottom(chatBox.value);
  }
}

/**
 * 功能：处理 answer 流增量——首个回答到达时标记思考完成并自动折叠思考框，再按跟随意图滚对话区到底。
 * @param {void} 无参数，读取并修改 newMessage.thinkingDone / thinkOpen / content，依赖 chatStick / chatBox。
 * @returns {Promise<void>} 异步返回滚动完成的 Promise，无业务返回值。
 */
async function handleAnswerChunk() {
  if (!newMessage.value.thinkingDone) {
    newMessage.value.thinkingDone = true;
    if (newMessage.value.thinking) {
      newMessage.value.thinkOpen = false;
    }
  }
  if (chatStick.isStick.value) {
    await scrollChatElToBottom(chatBox.value);
  }
}

/**
 * 功能：用户点击“回到底部”——恢复对话区与思考框的跟随态，并将两层滚动条一次性滚到底。
 * @param {void} 无参数，依赖 chatStick / thinkStick / thinkBox / chatBox。
 * @returns {Promise<void>} 异步返回双层滚动完成的 Promise，无业务返回值。
 */
async function backToBottom() {
  chatStick.stick();
  thinkStick.stick();
  await scrollThinkElToBottom(thinkBox.value);
  await scrollChatElToBottom(chatBox.value);
}

/**
 * 功能：判断是否展示“回到底部”悬浮按钮——仅当用户上翻脱离底部且存在可回看内容时展示。
 * @param {void} 无参数，依赖 chatStick.isStick / message / newMessage。
 * @returns {boolean} true 展示按钮，false 隐藏。
 */
const showBackToBottom = computed(() => {
  if (chatStick.isStick.value) return false;
  return message.value.length > 0 || !!newMessage.value.content || !!newMessage.value.thinking;
});

/**
 * 功能：清空流式草稿（newMessage），回到初始待机态，供新一轮提问前调用。
 * @param {void} 无参数，直接重置 newMessage 的 content / thinking / thinkingDone / thinkOpen。
 * @returns {void} 无返回值。
 */
function resetStreaming() {
  newMessage.value.content = "";
  newMessage.value.thinking = "";
  newMessage.value.thinkingDone = false;
  newMessage.value.thinkOpen = true;
}

/**
 * 功能：表单提交总入口————生成中则暂停输出；空闲时校验输入并发起 POST /api/ask 流式问答，全程归档与收尾。
 * @param {void} 无参数，读取 input / attachments / generation / thinkEnabled，副作用：push 用户消息与 AI 回复、更新 newMessage。
 * @returns {Promise<void>} 异步返回整轮问答结束的 Promise；暂停分支提前 return，无业务返回值。
 */
async function handleSubmit() {
  if (generation.isActive()) {
    generation.abort();
    return;
  }

  const question = input.value.trim();
  if ((!question && !attachments.hasFiles.value) || !generation.isIdle())
    return;

  // 用户消息：文本 + 附件名一起归档（附件二进制后续接 /upload 再传）
  message.value.push({
    role: "user",
    content: question,
    files: attachments.files.value.map((item) => ({
      name: item.name,
      sizeText: item.sizeText,
      kind: item.kind,
    })),
  });
  const pendingFiles = attachments.files.value.map((item) => item.file);
  input.value = "";
  attachments.clear();
  resetStreaming();
  // 新一轮生成：默认恢复跟随（用户刚提问，意图就是看新回答）
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
      onThink: async (_delta, total) => {
        generation.markFirstToken();
        newMessage.value.thinking = total;
        await handleThinkChunk();
      },
      onAnswer: async (_delta, total) => {
        generation.markFirstToken();
        newMessage.value.content = total;
        await handleAnswerChunk();
      },
    });

    // 尾段兜底：回调已逐次同步文本，这里只做完成态收尾
    if (think || answer) {
      generation.markFirstToken();
      if (answer && !newMessage.value.thinkingDone) {
        newMessage.value.thinkingDone = true;
        if (think) newMessage.value.thinkOpen = false;
      }
    }
    // 收尾只在还想跟随时滚：用户上翻查看历史时不被拽回底部
    if (chatStick.isStick.value) {
      await scrollChatElToBottom(chatBox.value);
    }
  } catch (error) {
    if (error?.name === "AbortError" || generation.isAborted()) {
      // 用户主动暂停：保留已输出部分，归档时标注
      newMessage.value.thinkingDone = true;
    } else {
      console.error("请求失败:", error);
      newMessage.value.content =
        newMessage.value.content || "网络错误，请稍后重试";
      newMessage.value.thinkingDone = true;
    }
  } finally {
    const wasAborted = generation.isAborted();
    // 流结束：把 AI 回答（含思考过程）归档进消息列表，清空流式气泡
    if (newMessage.value.content || newMessage.value.thinking) {
      message.value.push({
        role: "ai",
        content: newMessage.value.content,
        thinking: newMessage.value.thinking,
        thinkingDone: true,
        // 归档后默认折叠思考过程，点击可展开
        thinkOpen: false,
        stopped: wasAborted,
      });
      resetStreaming();
    } else if (!wasAborted) {
      message.value.push({ role: "ai", content: "未收到回答" });
    } else {
      message.value.push({ role: "ai", content: "已停止生成" });
    }
    generation.finish();
    if (wasAborted) generation.reset();
    // 归档后只在还想跟随时滚：暂停/完成后用户可能在看上面的内容
    if (chatStick.isStick.value) {
      await scrollChatElToBottom(chatBox.value);
    }
  }
}

// 状态回到 idle 时取消未执行的滚动帧，避免切题后空滚
watch(status, (val) => {
  if (val === GenStatus.IDLE) cancelPendingScroll();
});

// think 框是条件渲染（v-show + 流式时才挂载），挂载后补绑 scroll 监听
watch(
  () => !!newMessage.value.thinking,
  (has) => {
    if (has) thinkStick.attach();
  },
);

onMounted(() => {
  chatStick.attach();
  // 思考框监听用事件委托：.think-content 是条件渲染的，
  // 直接绑 ref 可能拿到 null，委托到 chatBox 上统一处理
  chatBox.value?.addEventListener(
    "scroll",
    (e) => {
      const target = e.target;
      if (target?.classList?.contains("think-content")) {
        thinkStick.isStick.value = thinkStick.isNearBottom(target);
      }
    },
    { passive: true, capture: true },
  );
});

onUnmounted(() => {
  cancelPendingScroll();
  chatStick.detach();
  thinkStick.detach();
});
</script>

<template>
  <div class="chat-page">
    <!-- ===== 顶部栏 ===== -->
    <header class="chat-header">
      <div class="brand">
        <span class="brand-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path
              d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"
            />
          </svg>
        </span>
        <span class="brand-name">AI Study</span>
      </div>
      <div class="header-right">
        <!-- 深度思考开关：关闭后不再请求/展示 think -->
        <button
          type="button"
          :class="['think-toggle', { on: thinkEnabled }]"
          :title="thinkEnabled ? '已开启深度思考展示' : '已关闭深度思考展示'"
          @click="thinkEnabled = !thinkEnabled"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9.5 2a5.5 5.5 0 0 0-3.6 9.7c-.8.7-1.4 1.8-1.4 3.3H9" />
            <path d="M14.5 2a5.5 5.5 0 0 1 3.6 9.7c.8.7 1.4 1.8 1.4 3.3H15" />
            <path d="M12 15v7" />
          </svg>
          {{ thinkEnabled ? "深度思考开" : "深度思考关" }}
        </button>
        <div class="model-badge">
          <span class="status-dot"></span>
          qwen3:14b · 本地运行
        </div>
      </div>
    </header>

    <!-- ===== 对话区域 ===== -->
    <div class="chat-area" ref="chatBox">
      <div class="chat-inner">
        <!-- 空状态：欢迎引导 -->
        <div
          v-if="
            !message.length &&
            !newMessage.content &&
            !newMessage.thinking &&
            status === GenStatus.IDLE
          "
          class="empty-state"
        >
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path
                d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"
              />
            </svg>
          </div>
          <h1>有什么可以帮你？</h1>
          <p>基于本地 Ollama 模型的学习助手</p>
          <div class="suggest-list">
            <button
              v-for="s in suggestions"
              :key="s"
              type="button"
              @click="input = s"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <!-- 已完成的消息 -->
        <div
          v-for="(item, index) in message"
          :key="index"
          :class="['msg-row', item.role]"
        >
          <div class="avatar" :class="item.role">
            <svg
              v-if="item.role === 'ai'"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="currentColor"
            >
              <path
                d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
            </svg>
          </div>
          <div class="msg-body">
            <!-- 思考过程（可折叠） -->
            <div v-if="item.thinking" class="think-block done">
              <button
                type="button"
                class="think-head"
                @click="toggleThink(item)"
              >
                <span class="think-icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M9.5 2a5.5 5.5 0 0 0-3.6 9.7c-.8.7-1.4 1.8-1.4 3.3H9"
                    />
                    <path
                      d="M14.5 2a5.5 5.5 0 0 1 3.6 9.7c.8.7 1.4 1.8 1.4 3.3H15"
                    />
                    <path d="M12 15v7" />
                  </svg>
                </span>
                <span class="think-title">已深度思考</span>
                <span class="think-stopped" v-if="item.stopped">已暂停</span>
                <span :class="['think-chevron', { open: item.thinkOpen }]">
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              <div v-show="item.thinkOpen" class="think-content">
                {{ item.thinking }}
              </div>
            </div>
            <div v-if="item.files?.length" class="msg-files">
              <span v-for="f in item.files" :key="f.name" class="msg-file-chip">
                <span class="msg-file-kind">{{ f.kind }}</span>
                <span class="msg-file-name">{{ f.name }}</span>
                <span class="msg-file-size">{{ f.sizeText }}</span>
              </span>
            </div>
            <div
              v-if="item.content"
              :class="[
                'bubble',
                item.role === 'user' ? 'user-bubble' : 'ai-bubble',
              ]"
            >
              {{ item.content }}
            </div>
          </div>
        </div>

        <!-- AI 正在流式输出（含思考过程） -->
        <div v-if="newMessage.content || newMessage.thinking" class="msg-row ai">
          <div class="avatar ai">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path
                d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"
              />
            </svg>
          </div>
          <div class="msg-body">
            <!-- 流式思考过程 -->
            <div
              v-if="newMessage.thinking"
              :class="[
                'think-block',
                newMessage.thinkingDone ? 'done' : 'thinking',
              ]"
            >
              <button type="button" class="think-head" @click="toggleThink(newMessage)">
                <span class="think-icon spin">
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M9.5 2a5.5 5.5 0 0 0-3.6 9.7c-.8.7-1.4 1.8-1.4 3.3H9" />
                    <path d="M14.5 2a5.5 5.5 0 0 1 3.6 9.7c.8.7 1.4 1.8 1.4 3.3H15" />
                    <path d="M12 15v7" />
                  </svg>
                </span>
                <span class="think-title">
                  {{ newMessage.thinkingDone ? "已深度思考" : "正在思考…" }}
                </span>
                <span :class="['think-chevron', { open: newMessage.thinkOpen }]">
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              <div v-show="newMessage.thinkOpen" class="think-content" ref="thinkBox">
                {{ newMessage.thinking
                }}<span v-if="!newMessage.thinkingDone" class="think-caret"></span>
              </div>
            </div>
            <!-- 流式正文 -->
            <div v-if="newMessage.content" class="bubble ai-bubble streaming">
              {{ newMessage.content }}
            </div>
          </div>
        </div>

        <!-- 等待首字：思考中动画 -->
        <div v-if="status === GenStatus.WAITING" class="msg-row ai">
          <div class="avatar ai">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path
                d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"
              />
            </svg>
          </div>
          <div class="bubble ai-bubble typing">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 底部输入区：idle 发送，生成中暂停 ===== -->
    <form class="input-bar" @submit.prevent="handleSubmit">
      <!-- 回到底部：用户上翻后出现，点击恢复跟随 -->
      <Transition name="back-bottom">
        <button
          v-if="showBackToBottom"
          type="button"
          class="back-to-bottom"
          @click="backToBottom"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
          </svg>
          回到底部
        </button>
      </Transition>
      <div class="input-wrap">
        <!-- 输入框卡片：附件预览条 + 输入行包在同一张卡里，形成“包裹”效果 -->
        <div class="input-card" :class="{ generating: action.mode !== 'send' }">
          <!-- 附件预览条：有文件时显示在输入行正上方 -->
          <div v-if="attachments.hasFiles.value" class="attach-bar">
            <div class="attach-list">
                <div
                  v-for="item in attachments.files.value"
                  :key="item.id"
                  :class="['attach-chip', `kind-${item.kind}`]"
                  :title="`${item.name}（${item.sizeText}）`"
                >
                  <span class="attach-thumb">
                    <img
                      v-if="item.previewUrl"
                      :src="item.previewUrl"
                      :alt="item.name"
                    />
                    <span v-else class="attach-ext">{{ item.ext }}</span>
                  </span>
                  <span class="attach-meta">
                    <span class="attach-name">{{ item.name }}</span>
                    <span class="attach-size">{{ item.sizeText }}</span>
                  </span>
                  <button
                    type="button"
                    class="attach-remove"
                    title="移除该附件"
                    aria-label="移除附件"
                    @click="attachments.removeFile(item.id)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>
              <p v-if="attachments.error.value" class="attach-error">
                {{ attachments.error.value }}
              </p>
          </div>
          <p
            v-else-if="attachments.error.value"
            class="attach-error attach-error-alone"
          >
            {{ attachments.error.value }}
          </p>

          <div class="input-row">
            <!-- 附件按钮：Phosphor 链接图标，点击选取图片/文档 -->
            <button
              type="button"
              class="attach-btn"
              title="添加图片或文档（图片/PDF/Office/文本，单个≤20MB，最多5个）"
              aria-label="添加附件"
              :disabled="action.mode !== 'send'"
              @click="openFilePicker"
            >
              <PhLinkSimple :size="20" />
            </button>
            <input
              ref="fileInput"
              type="file"
              class="file-input-hidden"
              :accept="ATTACH_ACCEPT"
              multiple
              tabindex="-1"
              @change="onFilesPicked"
            />
            <input
              class="chat-input"
              type="text"
              :placeholder="
                action.mode === 'send' ? '输入你的问题，按 Enter 发送…' : '模型正在输出，点击右侧按钮暂停…'
              "
              v-model="input"
              :disabled="action.mode !== 'send'"
            />
            <!-- 发送态：上箭头；等待/输出态：方形停止键 -->
            <button
              type="submit"
              :class="['send-btn', action.mode]"
              :title="action.title"
              :aria-label="action.title"
            >
              <svg
                v-if="action.mode === 'send'"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="2.5" />
              </svg>
            </button>
          </div>
        </div>
        <p class="input-hint">
          {{
            action.mode === "send"
              ? "内容由 AI 生成，请注意甄别 · Enter 发送"
              : "模型正在输出 · 点击右侧按钮或按 Enter 暂停"
          }}
        </p>
      </div>
    </form>
  </div>
</template>

<style scoped src="./style/index.css"></style>
