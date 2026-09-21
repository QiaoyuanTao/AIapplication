<script setup>
import ChatHeader from "./components/ChatHeader.vue";
import EmptyState from "./components/EmptyState.vue";
import MessageItem from "./components/MessageItem.vue";
import StreamingMessage from "./components/StreamingMessage.vue";
import InputBar from "./components/InputBar.vue";
import { GenStatus } from "./composables/useGeneration";
import { ATTACH_ACCEPT } from "./composables/useAttachments";
import { useChat } from "./composables/useChat";

const {
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
} = useChat();
</script>

<template>
  <div class="chat-page">
    <ChatHeader
      :think-enabled="thinkEnabled"
      @update:think-enabled="thinkEnabled = $event"
    />
    <div class="chat-area" ref="chatBox">
      <div class="chat-inner">
        <EmptyState
          v-if="
            !message.length &&
            !newMessage.content &&
            !newMessage.thinking &&
            status === GenStatus.IDLE
          "
          :suggestions="suggestions"
          @select="input = $event"
        />
        <MessageItem
          v-for="(item, index) in message"
          :key="index"
          :item="item"
          @toggle-think="toggleThink"
        />
        <StreamingMessage
          v-if="newMessage.content || newMessage.thinking"
          ref="thinkBox"
          :draft="newMessage"
          @toggle-think="toggleThink"
        />
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
    <form class="input-bar" @submit.prevent="handleSubmit">
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
        <InputBar
          v-model="input"
          :action="action"
          :files="attachments.files.value"
          :error="attachments.error.value"
          :accept="ATTACH_ACCEPT"
          :disabled="action.mode !== 'send'"
          @submit="handleSubmit"
          @open-picker="openFilePicker"
          @files-picked="onFilesPicked"
          @remove-file="attachments.removeFile($event)"
        />
        <input
          ref="fileInput"
          type="file"
          class="file-input-hidden"
          :accept="ATTACH_ACCEPT"
          multiple
          tabindex="-1"
          @change="onFilesPicked"
        />
      </div>
    </form>
  </div>
</template>

<style scoped src="./style/chat-area.css"></style>
<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: #e8ebf4;
  background:
    radial-gradient(
      1100px 700px at 82% -10%,
      rgba(124, 108, 255, 0.16),
      transparent 60%
    ),
    radial-gradient(
      900px 650px at 0% 110%,
      rgba(34, 211, 238, 0.1),
      transparent 60%
    ),
    #0b0f1a;
}
.input-bar {
  position: relative;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
}
.input-wrap {
  max-width: 780px;
  margin: 0 auto;
}
.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
