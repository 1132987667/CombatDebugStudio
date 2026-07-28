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
import { raf } from '@/shared/utils/RAF'

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
    raf.setTimeout(() => {
      removeNotification(id)
    }, duration)
  }
}

const removeNotification = (notificationId: number): void => {
  notifications.value = notifications.value.filter(n => n.id !== notificationId)
}

defineExpose({
  addNotification
})
</script>

