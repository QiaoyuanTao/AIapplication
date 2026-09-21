<script setup>
import { PhLinkSimple } from "@phosphor-icons/vue";
/**
 * 功能：附件预览条（输入行正上方）。
 * Props: files:Array 附件项；error:String 报错；accept:String input accept；disabled:boolean 生成中禁用。
 * Emits: remove-file(id:number)；files-picked(FileList)。
 */
const props = defineProps({ files: { type: Array, default: () => [] }, error: { type: String, default: "" }, accept: { type: String, default: "" }, disabled: { type: Boolean, default: false } });
const emit = defineEmits(["remove-file", "files-picked"]);
/**
 * 功能：转发文件选择结果并重置 input。
 * @param {Event} event - change 事件。
 * @returns {void} 无返回值。
 */
function onChange(event) { emit("files-picked", event.target.files); event.target.value = ""; }
</script>
<template>
  <div>
    <div v-if="files.length" class="attach-bar">
      <div class="attach-list">
        <div v-for="item in files" :key="item.id" :class="['attach-chip', `kind-${item.kind}`]" :title="`${item.name}（${item.sizeText}）`">
          <span class="attach-thumb"><img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.name" /><span v-else class="attach-ext">{{ item.ext }}</span></span>
          <span class="attach-meta"><span class="attach-name">{{ item.name }}</span><span class="attach-size">{{ item.sizeText }}</span></span>
          <button type="button" class="attach-remove" title="移除该附件" @click="emit('remove-file', item.id)"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
      </div>
      <p v-if="error" class="attach-error">{{ error }}</p>
    </div>
    <p v-else-if="error" class="attach-error attach-error-alone">{{ error }}</p>
  </div>
</template>
<style scoped src="../style/attach-bar.css"></style>
