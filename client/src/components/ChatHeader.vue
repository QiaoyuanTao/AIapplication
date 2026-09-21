<script setup>
/**
 * 功能：顶部栏展示品牌与深度思考开关。
 * Props: thinkEnabled:boolean 是否开启思考；Emits: update:thinkEnabled。
 */
defineProps({ thinkEnabled: { type: Boolean, default: true } });
defineEmits(["update:thinkEnabled"]);
</script>
<template>
  <header class="chat-header">
    <div class="brand">
      <span class="brand-icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />
        </svg>
      </span>
      <span class="brand-name">AI Study</span>
    </div>
    <div class="header-right">
      <button
        type="button"
        :class="['think-toggle', { on: thinkEnabled }]"
        :title="thinkEnabled ? '已开启深度思考展示' : '已关闭深度思考展示'"
        @click="$emit('update:thinkEnabled', !thinkEnabled)"
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
</template>
<style scoped src="../style/chat-header.css"></style>
