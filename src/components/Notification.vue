<!--
 * 文件: Notification.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 通知组件
 * 描述: 显示系统通知消息，支持不同类型通知和自动关闭功能
 * 版本: 1.0.0
-->

<template>
  <div class="notifications-container">
    <div v-for="notification in notifications" :key="notification.id" class="notification"
      :class="`notification-${notification.type}`">
      <div class="notification-icon">
        {{ getIcon(notification.type) }}
      </div>
      <div class="notification-content">
        <div class="notification-title">{{ notification.title }}</div>
        <div class="notification-message">{{ notification.message }}</div>
      </div>
      <div class="notification-close" @click="removeNotification(notification.id)">
        &times;
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface NotificationItem {
  id: number
  title: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

const notifications = ref<NotificationItem[]>([])

const getIcon = (type: string): string => {
  const icons: Record<string, string> = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
    warning: '⚠'
  }
  return icons[type] || 'ℹ'
}

const addNotification = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration: number = 3000): void => {
  const id = Date.now() + Math.random()
  const notification: NotificationItem = {
    id,
    title,
    message,
    type
  }
  notifications.value.push(notification)

  if (duration > 0) {
    setTimeout(() => {
      removeNotification(id)
    }, duration)
  }
}

const removeNotification = (notificationId: number): void => {
  notifications.value = notifications.value.filter(n => n.id !== notificationId)
}

defineExpose({
  addNotification,
  removeNotification
})
</script>

<style scoped>
.notifications-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 15px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 300px;
  max-width: 400px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.notification-icon {
  font-size: 18px;
  font-weight: bold;
  min-width: 20px;
  text-align: center;
}

.notification-content {
  flex: 1;
  overflow: hidden;
}

.notification-title {
  font-size: 14px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 4px;
}

.notification-message {
  font-size: 12px;
  color: #606266;
  line-height: 1.4;
}

.notification-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #c0c4cc;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s;
}

.notification-close:hover {
  background: #ecf5ff;
  color: #409eff;
}

.notification-success {
  border-left: 4px solid #67c23a;
}

.notification-success .notification-icon {
  color: #67c23a;
}

.notification-error {
  border-left: 4px solid #f56c6c;
}

.notification-error .notification-icon {
  color: #f56c6c;
}

.notification-warning {
  border-left: 4px solid #e6a23c;
}

.notification-warning .notification-icon {
  color: #e6a23c;
}

.notification-info {
  border-left: 4px solid #409eff;
}

.notification-info .notification-icon {
  color: #409eff;
}
</style>
