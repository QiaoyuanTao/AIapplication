<script setup>
import { ref } from "vue";

// 当前激活的菜单项
const active = defineModel("active", { type: String, default: "chat" });

// 两个入口：对话 / 历史记录
const menu = ref([
  {
    key: "chat",
    label: "对话",
    desc: "开启新对话",
    icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  },
  {
    key: "history",
    label: "历史记录",
    desc: "查看过往会话",
    icon: "M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2",
  },
]);

const emit = defineEmits(["new-chat", "open-history"]);
</script>

<template>
  <aside class="sidebar">
    <!-- 品牌区 -->
    <div class="side-brand">
      <span class="side-logo">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />
        </svg>
      </span>
      <span class="side-name">AI Study</span>
    </div>

    <!-- 新建对话按钮 -->
    <button class="new-chat-btn" type="button" @click="emit('new-chat')">
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      新建对话
    </button>

    <!-- 导航菜单：对话 / 历史记录 -->
    <nav class="side-menu">
      <button
        v-for="item in menu"
        :key="item.key"
        type="button"
        :class="['side-item', { active: active === item.key }]"
        @click="emit(item.key === 'chat' ? 'new-chat' : 'open-history')"
      >
        <span class="side-item-icon">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="item.icon" />
          </svg>
        </span>
        <span class="side-item-text">
          <span class="side-item-label">{{ item.label }}</span>
          <span class="side-item-desc">{{ item.desc }}</span>
        </span>
        <!-- 激活态右侧小圆点 -->
        <span v-if="active === item.key" class="side-item-dot"></span>
      </button>
    </nav>

    <!-- 底部：模型状态 -->
    <div class="side-footer">
      <span class="side-dot"></span>
      <span>qwen3:14b · 本地运行</span>
    </div>
  </aside>
</template>

<style scoped src="../style/sidebar.css"></style>
