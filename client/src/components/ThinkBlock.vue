<script setup>
/**
 * 功能：思考过程折叠块（历史与流式共用）。
 * Props: thinking:string 内容；thinkOpen:boolean 是否展开；done:boolean 是否完成；stopped:boolean 是否被暂停；live:boolean 是否流式旋转。
 * Emits: toggle 切换展开。
 */
defineProps({
  thinking: { type: String, default: "" },
  thinkOpen: { type: Boolean, default: true },
  done: { type: Boolean, default: true },
  stopped: { type: Boolean, default: false },
  live: { type: Boolean, default: false },
});
defineEmits(["toggle"]);
</script>
<template>
  <div :class="['think-block', done ? 'done' : 'thinking']">
    <button type="button" class="think-head" @click="$emit('toggle')">
      <span :class="['think-icon', { spin: live && !done }]">
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
      <span class="think-title">{{ done ? "已深度思考" : "正在思考…" }}</span>
      <span class="think-stopped" v-if="stopped">已暂停</span>
      <span :class="['think-chevron', { open: thinkOpen }]">
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
    <div v-show="thinkOpen" class="think-content">
      <slot />
      {{ thinking }}
      <span v-if="live && !done" class="think-caret"></span>
    </div>
  </div>
</template>
<style scoped src="../style/think-block.css"></style>
