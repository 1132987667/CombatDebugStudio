<template>
  <div class="keybind-hint-panel" :class="{ 'visible': isVisible }">
    <div class="panel-header">
      <h4>快捷键提示</h4>
      <button class="close-btn" @click="closePanel">×</button>
    </div>
    
    <div class="hint-grid">
      <div 
        v-for="(setting, index) in keybindHints" 
        :key="setting.action"
        class="hint-item"
      >
        <div class="hint-key">
          <span class="key-text">{{ setting.key.toUpperCase() }}</span>
        </div>
        <div class="hint-description">{{ setting.description }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { keybindManager } from '@/core/input/KeybindManager';
import type { KeybindHint } from '@/types/input';

const isVisible = ref(false);
const keybindHints = ref<KeybindHint[]>([]);

// 初始化快捷键提示
function initKeybindHints() {
  const hints: KeybindHint[] = [
    { action: 'attack', key: keybindManager.getKeybind('attack'), description: '普通攻击' },
    { action: 'skill', key: keybindManager.getKeybind('skill'), description: '技能' },
    { action: 'defend', key: keybindManager.getKeybind('defend'), description: '防御' },
    { action: 'item', key: keybindManager.getKeybind('item'), description: '使用物品' },
    { action: 'escape', key: keybindManager.getKeybind('escape'), description: '取消/退出' },
    { action: 'menu', key: keybindManager.getKeybind('menu'), description: '打开菜单' },
    { action: 'pause', key: keybindManager.getKeybind('pause'), description: '暂停游戏' },
    { action: 'replay', key: keybindManager.getKeybind('replay'), description: '战斗回放' },
    { action: 'debug', key: keybindManager.getKeybind('debug'), description: '调试模式' }
  ];

  keybindHints.value = hints;
}

// 显示面板
function showPanel() {
  isVisible.value = true;
}

// 关闭面板
function closePanel() {
  isVisible.value = false;
}

// 切换面板显示状态
function togglePanel() {
  isVisible.value = !isVisible.value;
}

// 监听快捷键事件，当按下H键时显示/隐藏面板
function handleKeyDown(event: KeyboardEvent) {
  if (event.key.toLowerCase() === 'h' && !isVisible.value) {
    event.preventDefault();
    showPanel();
  } else if (event.key.toLowerCase() === 'escape' && isVisible.value) {
    closePanel();
  }
}

onMounted(() => {
  initKeybindHints();
  window.addEventListener('keydown', handleKeyDown);
});

// 暴露方法给父组件
defineExpose({
  showPanel,
  closePanel,
  togglePanel
});
</script>

<style scoped>
@use'@/styles/main.scss';
</style>