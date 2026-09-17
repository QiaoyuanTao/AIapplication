<script setup>
import { ref } from "vue";
import scrollToBottom from "./util/scrollToBottom";

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
const loading = ref(false);
const chatBox = ref(null);
// 是否请求模型的思考过程（对应 Ollama think 参数）
const thinkEnabled = ref(true);

// 空状态下的快捷提问（点击直接填入输入框）
const suggestions = [
  "用通俗的语言解释什么是机器学习",
  "帮我制定一个月的前端学习计划",
  "HTTP 和 HTTPS 的区别是什么？",
  "什么是 Promise？举个例子",
];

function toggleThink(item) {
  item.thinkOpen = !item.thinkOpen;
}

async function handleSubmit() {
  const question = input.value.trim();
  if (!question || loading.value) return; //空值和加载状态处理

  message.value.push({ role: "user", content: question });
  input.value = "";
  loading.value = true;
  newMessage.value.content = "";
  newMessage.value.thinking = "";
  newMessage.value.thinkingDone = false;
  newMessage.value.thinkOpen = true;

  await scrollToBottom(chatBox.value); //自动滚动到底部

  let botMessage = "";
  let botThinking = "";
  let thinkStartedAt = 0;

  try {
    //发送请求到后端
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, think: thinkEnabled.value }),
    });

    //错误处理
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      newMessage.value.content = err.error || "请求失败，请稍后重试";
      newMessage.value.thinkingDone = true;
      newMessage.value.thinkOpen = false;
      return;
    }

    const reader = res.body.getReader(); //获取字节流
    const decoder = new TextDecoder("utf-8"); //解码器
    let buffer = ""; //残留缓冲：分包可能把一行 JSON 从中间切断，半行留到下一轮拼接

    while (true) {
      const { done, value } = await reader.read(); //读取字节流
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); //按行拆分
      // 最后一段可能不完整，留到下一轮
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          // 思考增量：后端转发的字段名是 think
          if (data.think) {
            if (!thinkStartedAt) {
              thinkStartedAt = Date.now();
              // 首个 think 到达，隐藏"等待中"动画，切到思考展示
              if (loading.value) loading.value = false;
            }
            botThinking += data.think;
            newMessage.value.thinking = botThinking;
            newMessage.value.thinkOpen = true;
            await scrollToBottom(chatBox.value);
          }
          // 正式回答增量：后端转发的字段名是 answer
          if (data.answer) {
            // 首字到达，隐藏"等待中"动画，思考收起、标记完成
            if (loading.value) loading.value = false;
            if (!newMessage.value.thinkingDone) {
              newMessage.value.thinkingDone = true;
              // 回答开始后自动折叠思考过程，保持界面清爽
              if (newMessage.value.thinking) {
                newMessage.value.thinkOpen = false;
              }
            }
            botMessage += data.answer;
            newMessage.value.content = botMessage;
            await scrollToBottom(chatBox.value);
          }
        } catch (error) {
          console.error("解析 JSON 失败:", error);
        }
      }
    }

    // 处理最后一段没有换行符的残留
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.think) {
          botThinking += data.think;
          newMessage.value.thinking = botThinking;
        }
        if (data.answer) {
          botMessage += data.answer;
          newMessage.value.content = botMessage;
        }
      } catch (error) {
        console.error("解析 JSON 失败:", error);
      }
    }
  } catch (error) {
    console.error("请求失败:", error);
    // 已收到部分内容则保留，否则提示网络错误
    newMessage.value.content =
      newMessage.value.content || "网络错误，请稍后重试";
    newMessage.value.thinkingDone = true;
  } finally {
    loading.value = false;
    // 流结束：把 AI 回答（含思考过程）归档进消息列表，清空流式气泡
    if (newMessage.value.content || newMessage.value.thinking) {
      message.value.push({
        role: "ai",
        content: newMessage.value.content,
        thinking: newMessage.value.thinking,
        thinkingDone: true,
        // 归档后默认折叠思考过程，点击可展开
        thinkOpen: false,
      });
      newMessage.value.content = "";
      newMessage.value.thinking = "";
      newMessage.value.thinkingDone = false;
      newMessage.value.thinkOpen = true;
    } else if (botMessage || botThinking) {
      message.value.push({
        role: "ai",
        content: botMessage,
        thinking: botThinking,
        thinkingDone: true,
        thinkOpen: false,
      });
    } else {
      message.value.push({ role: "ai", content: "未收到回答" });
    }
    await scrollToBottom(chatBox.value);
  }
}
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
            !loading
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
          <p>基于本地 Ollama 模型的学习助手，回答逐字实时生成</p>
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
                <span
                  :class="['think-chevron', { open: item.thinkOpen }]"
                >
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
            <div
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
        <div
          v-if="newMessage.content || newMessage.thinking"
          class="msg-row ai"
        >
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
              <button
                type="button"
                class="think-head"
                @click="toggleThink(newMessage)"
              >
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
                    <path
                      d="M9.5 2a5.5 5.5 0 0 0-3.6 9.7c-.8.7-1.4 1.8-1.4 3.3H9"
                    />
                    <path
                      d="M14.5 2a5.5 5.5 0 0 1 3.6 9.7c.8.7 1.4 1.8 1.4 3.3H15"
                    />
                    <path d="M12 15v7" />
                  </svg>
                </span>
                <span class="think-title">
                  {{
                    newMessage.thinkingDone ? "已深度思考" : "正在思考…"
                  }}
                </span>
                <span
                  :class="[
                    'think-chevron',
                    { open: newMessage.thinkOpen },
                  ]"
                >
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
              <div v-show="newMessage.thinkOpen" class="think-content">
                {{ newMessage.thinking
                }}<span
                  v-if="!newMessage.thinkingDone"
                  class="think-caret"
                ></span>
              </div>
            </div>
            <!-- 流式正文 -->
            <div
              v-if="newMessage.content"
              class="bubble ai-bubble streaming"
            >
              {{ newMessage.content }}
            </div>
          </div>
        </div>

        <!-- 等待首字：思考中动画 -->
        <div v-if="loading" class="msg-row ai">
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

    <!-- ===== 底部输入区 ===== -->
    <form class="input-bar" @submit.prevent="handleSubmit">
      <div class="input-wrap">
        <div class="input-card">
          <input
            class="chat-input"
            type="text"
            placeholder="输入你的问题，按 Enter 发送…"
            v-model="input"
            :disabled="loading"
          />
          <button type="submit" class="send-btn" :disabled="loading">
            <svg
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
          </button>
        </div>
        <p class="input-hint">内容由 AI 生成，请注意甄别 · Enter 发送</p>
      </div>
    </form>
  </div>
</template>

<style scoped src="./style/index.css"></style>
