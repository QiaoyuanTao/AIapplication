<script setup>
import { ref } from "vue";

// 抽屉是否展开
const visible = defineModel("visible", { type: Boolean, default: false });

// 历史记录数据由父组件传入
const props = defineProps({
  history: {
    type: Array,
    default: () => [],
  },
  currentId: {
    type: [String, Number],
    default: null,
  },
});

// 点击历史项时通知父组件
const emit = defineEmits(["select", "clear"]);

// 菜单项：对话 / 历史记录
const menu = ref([
  { key: "chat", label: "对话", icon: "M4 5h16v11H8l-4 4z" },
  { key: "history", label: "历史记录", icon: "M12 7v5l3 3M12 3a9 9 0 1 0 9 9" },
]);
const activeKey = ref("history");

function pick(key) {
  activeKey.value = key;
}
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：点击关闭，位于顶部栏之上但抽屉在其下方 -->
    <Transition name="fade">
      <div
        v-if="visible"
        class="history-mask"
        @click="visible = false"
      ></div>
    </Transition>

    <!-- 左侧抽屉 -->
    <Transition name="slide">
      <aside v-if="visible" class="history-drawer">
        <!-- 抽屉头部 -->
        <div class="drawer-head">
          <h2 class="drawer-title">导航</h2>
          <button class="close-btn" type="button" @click="visible = false">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <!-- 两个入口：对话 / 历史记录 -->
        <nav class="menu-list">
          <button
            v-for="item in menu"
            :key="item.key"
            type="button"
            :class="['menu-item', { active: activeKey === item.key }]"
            @click="pick(item.key)"
          >
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
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <!-- 历史记录区块 -->
        <div class="history-section">
          <div class="history-head">
            <span>历史记录</span>
            <button
              v-if="history.length"
              class="clear-btn"
              type="button"
              @click="emit('clear')"
            >
              清空
            </button>
          </div>

          <div class="history-list">
            <p v-if="!history.length" class="empty-tip">
              暂无历史记录，去开启第一段对话吧
            </p>

            <button
              v-for="(item, index) in history"
              :key="index"
              type="button"
              :class="['history-item', { active: item.id === currentId }]"
              @click="emit('select', item)"
            >
              <span class="item-title">{{ item.title }}</span>
              <span class="item-time">{{ item.time }}</span>
            </button>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ===== 遮罩：暗色半透明，盖住除顶部栏外的一切（z-index 低于 header 和抽屉） ===== */
.history-mask {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 15, 0.6);
  backdrop-filter: blur(3px);
  z-index: 998;
}

/* ===== 抽屉：固定在左侧、顶部栏之下，不覆盖顶部栏 ===== */
.history-drawer {
  position: fixed;
  top: 61px; /* 顶部栏高度（约 60px）+ 1px 边框，正好从其下方开始 */
  left: 0;
  bottom: 0;
  width: 300px;
  display: flex;
  flex-direction: column;
  background: #10141f;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 24px 0 60px rgba(0, 0, 0, 0.45);
  z-index: 999; /* 高于遮罩，低于顶部栏（顶部栏需 1000） */
}

/* ===== 头部 ===== */
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 10px;
}

.drawer-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #9aa3b8;
}

.close-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  color: #8b93a7;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

/* ===== 菜单项（对话 / 历史记录） ===== */
.menu-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  color: #c3c9d9;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.menu-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.menu-item.active {
  color: #fff;
  background: linear-gradient(
    135deg,
    rgba(109, 94, 252, 0.28),
    rgba(139, 92, 246, 0.18)
  );
  box-shadow: inset 0 0 0 1px rgba(139, 124, 255, 0.35);
}

/* ===== 历史记录区块 ===== */
.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 允许内部列表滚动 */
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 8px;
  font-size: 12px;
  color: #8b93a7;
  letter-spacing: 1px;
}

.clear-btn {
  border: none;
  background: transparent;
  font-size: 12px;
  color: #8b93a7;
  cursor: pointer;
  transition: color 0.2s;
}

.clear-btn:hover {
  color: #f87171;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-tip {
  margin-top: 20px;
  font-size: 13px;
  color: #5c6478;
  text-align: center;
  line-height: 1.8;
}

/* 单条历史记录 */
.history-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 11px 13px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

/* 当前选中的会话：品牌渐变描边 + 微光 */
.history-item.active {
  background: linear-gradient(
    135deg,
    rgba(109, 94, 252, 0.2),
    rgba(139, 92, 246, 0.1)
  );
  border-color: rgba(139, 124, 255, 0.4);
  box-shadow: 0 4px 14px rgba(124, 108, 255, 0.15);
}

.item-title {
  font-size: 13.5px;
  color: #dfe3ee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 标题过长显示省略号 */
}

.item-time {
  font-size: 11.5px;
  color: #6b7387;
}

/* ===== 进出场动画 ===== */

/* 遮罩淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 抽屉左侧滑入滑出 */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
