<script setup>
import { PhLinkSimple } from "@phosphor-icons/vue";
import AttachBar from "./AttachBar.vue";
/**
 * 功能：底部输入卡片（附件条+输入行+发送按钮）。
 * Props: modelValue:string 输入文本（v-model）；action:Object 按钮态；files:Array 附件；error:String 附件报错；accept:String 文件类型；disabled:boolean 输入禁用。
 * Emits: update:modelValue；submit；open-picker；files-picked；remove-file。
 */
defineProps({ modelValue: { type: String, default: "" }, action: { type: Object, required: true }, files: { type: Array, default: () => [] }, error: { type: String, default: "" }, accept: { type: String, default: "" }, disabled: { type: Boolean, default: false } });
defineEmits(["update:modelValue", "submit", "open-picker", "files-picked", "remove-file"]);
</script>
<template>
  <div class="input-stack">
  <div class="input-card" :class="{ generating: action.mode !== 'send' }">
    <AttachBar :files="files" :error="error" @remove-file="$emit('remove-file', $event)" />
    <div class="input-row">
      <button type="button" class="attach-btn" title="添加图片或文档" aria-label="添加附件" :disabled="action.mode !== 'send'" @click="$emit('open-picker')"><PhLinkSimple :size="20" /></button>
      <input class="chat-input" type="text" :placeholder="action.mode === 'send' ? '输入你的问题，按 Enter 发送…' : '模型正在输出，点击右侧按钮暂停…'" :value="modelValue" :disabled="disabled" @input="$emit('update:modelValue', $event.target.value)" />
      <button type="submit" :class="['send-btn', action.mode]" :title="action.title" :aria-label="action.title" @click.prevent="$emit('submit')">
        <svg v-if="action.mode === 'send'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
        <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
      </button>
    </div>
    </div>
    <p class="input-hint">{{ action.mode === "send" ? "内容由 AI 生成，请注意甄别 · Enter 发送" : "模型正在输出 · 点击右侧按钮或按 Enter 暂停" }}</p>
  </div>
</template>
<style scoped src="../style/input-bar.css"></style>
