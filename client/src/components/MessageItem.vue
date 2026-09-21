<script setup>
import ThinkBlock from "./ThinkBlock.vue";
/**
 * 功能：单条历史消息（头像+思考+附件+气泡）。
 * Props: item:Object 消息对象；Emits: toggle-think(item:Object)。
 */
defineProps({ item: { type: Object, required: true } });
defineEmits(["toggle-think"]);
</script>
<template>
  <div :class="['msg-row', item.role]">
    <div class="avatar" :class="item.role">
      <svg v-if="item.role === 'ai'" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg>
      <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
    </div>
    <div class="msg-body">
      <ThinkBlock v-if="item.thinking" :thinking="item.thinking" :think-open="item.thinkOpen" :done="true" :stopped="!!item.stopped" @toggle="$emit('toggle-think', item)" />
      <div v-if="item.files?.length" class="msg-files"><span v-for="f in item.files" :key="f.name" class="msg-file-chip"><span class="msg-file-kind">{{ f.kind }}</span><span class="msg-file-name">{{ f.name }}</span><span class="msg-file-size">{{ f.sizeText }}</span></span></div>
      <div v-if="item.content" :class="['bubble', item.role === 'user' ? 'user-bubble' : 'ai-bubble']">{{ item.content }}</div>
    </div>
  </div>
</template>
<style scoped src="../style/message-item.css"></style>
