import { nextTick } from "vue";
export default async function scrollToBottom(chatBox) {
  await nextTick(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}
