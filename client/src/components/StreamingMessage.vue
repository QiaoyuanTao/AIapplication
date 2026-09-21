<script setup>
import ThinkBlock from "./ThinkBlock.vue";
/**
 * 功能：流式输出中的 AI 气泡（含思考+正文）。
 * Props: draft:Object newMessage 草稿；Emits: toggle-think(draft:Object)。
 */
defineProps({ draft: { type: Object, required: true } });
defineEmits(["toggle-think"]);
</script>
<template>
  <div class="msg-row ai">
    <div class="avatar ai"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg></div>
    <div class="msg-body">
      <ThinkBlock v-if="draft.thinking" :thinking="draft.thinking" :think-open="draft.thinkOpen" :done="draft.thinkingDone" :live="true" @toggle="$emit('toggle-think', draft)" />
      <div v-if="draft.content" class="bubble ai-bubble streaming">{{ draft.content }}</div>
    </div>
  </div>
</template>
<style scoped src="../style/message-item.css"></style>
