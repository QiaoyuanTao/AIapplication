<script setup>
/**
 * 功能：空状态欢迎与快捷提问。
 * Props: suggestions:string[] 快捷问题；Emits: select(text:string)。
 */
defineProps({ suggestions: { type: Array, default: () => [] } });
defineEmits(["select"]);
</script>
<template>
  <div class="empty-state">
    <div class="empty-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg></div>
    <h1>有什么可以帮你？</h1>
    <p>基于本地 Ollama 模型的学习助手</p>
    <div class="suggest-list"><button v-for="s in suggestions" :key="s" type="button" @click="$emit('select', s)">{{ s }}</button></div>
  </div>
</template>
<style scoped src="../style/empty-state.css"></style>
