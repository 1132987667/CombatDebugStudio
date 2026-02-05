<template>
  <div class="keybind-settings">
    <h3>快捷键设置</h3>
    
    <div class="settings-container">
      <div 
        v-for="setting in keybindSettings" 
        :key="setting.action"
        class="keybind-item"
      >
        <div class="keybind-info">
          <span class="keybind-description">{{ setting.description }}</span>
          <span class="keybind-default" v-if="setting.key !== setting.defaultKey">
            默认: {{ setting.defaultKey }}
          </span>
        </div>
        <div class="keybind-control">
          <div 
            class="keybind-key"
            :class="{ 'listening': listeningFor === setting.action }"
            @click="startListening(setting.action)"
          >
            {{ listeningFor === setting.action ? '按任意键...' : setting.key.toUpperCase() }}
          </div>
          <button 
            class="reset-btn"
            @click="resetKeybind(setting.action)"
            title="重置为默认值"
          >
            重置
          </button>
        </div>
      </div>
    </div>

    <div class="settings-actions">
      <button class="action-btn" @click="resetAll">重置所有</button>
      <button class="action-btn primary" @click="saveSettings">保存设置</button>
    </div>
    
    <!-- 通知组件 -->
    <Notification ref="notification" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { keybindManager } from '@/core/input/KeybindManager';
import type { KeybindAction, KeybindSetting } from '@/types/input';
import Notification from '../components/Notification.vue';

// 通知组件引用
const notification = ref(null);

const listeningFor = ref<string | null>(null);
const keybindSettings = ref<KeybindSetting[]>([]);

// 初始化快捷键设置
function initKeybindSettings() {
  const settings: KeybindSetting[] = [
    { action: 'attack', key: keybindManager.getKeybind('attack'), defaultKey: 'z', description: '普通攻击' },
    { action: 'skill', key: keybindManager.getKeybind('skill'), defaultKey: 'x', description: '技能' },
    { action: 'defend', key: keybindManager.getKeybind('defend'), defaultKey: 'c', description: '防御' },
    { action: 'item', key: keybindManager.getKeybind('item'), defaultKey: 'v', description: '使用物品' },
    { action: 'escape', key: keybindManager.getKeybind('escape'), defaultKey: 'escape', description: '取消/退出' },
    { action: 'menu', key: keybindManager.getKeybind('menu'), defaultKey: 'm', description: '打开菜单' },
    { action: 'pause', key: keybindManager.getKeybind('pause'), defaultKey: 'p', description: '暂停游戏' },
    { action: 'replay', key: keybindManager.getKeybind('replay'), defaultKey: 'r', description: '战斗回放' },
    { action: 'debug', key: keybindManager.getKeybind('debug'), defaultKey: 'd', description: '调试模式' }
  ];

  keybindSettings.value = settings;
}

// 开始监听按键输入
function startListening(action: KeybindAction) {
  listeningFor.value = action;
}

// 停止监听按键输入
function stopListening() {
  listeningFor.value = null;
}

// 重置单个快捷键
function resetKeybind(action: KeybindAction) {
  const setting = keybindSettings.value.find(s => s.action === action);
  if (setting) {
    keybindManager.setKeybind(action, setting.defaultKey);
    setting.key = setting.defaultKey;
  }
}

// 重置所有快捷键
function resetAll() {
  keybindManager.resetToDefaults();
  initKeybindSettings();
}

// 保存设置
function saveSettings() {
  // 由于每次修改都已经保存，这里主要是提供一个确认的反馈
  notification.value?.addNotification('成功', '快捷键设置已保存！', 'success');
}

// 处理键盘事件
function handleKeyDown(event: KeyboardEvent) {
  if (listeningFor.value) {
    const key = event.key.toLowerCase();
    
    // 检查按键是否可用
    if (keybindManager.isKeyAvailable(key, listeningFor.value)) {
      // 设置新的快捷键
      keybindManager.setKeybind(listeningFor.value, key);
      
      // 更新本地设置
      const setting = keybindSettings.value.find(s => s.action === listeningFor.value);
      if (setting) {
        setting.key = key;
      }
    } else {
      notification.value?.addNotification('提示', '该按键已被使用，请选择其他按键！', 'warning');
    }
    
    stopListening();
  }
}

onMounted(() => {
  initKeybindSettings();
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped>
@use'@/styles/main.scss';
</style>