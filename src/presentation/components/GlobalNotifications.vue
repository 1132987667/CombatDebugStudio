<template>
  <div class="notifications-container" aria-live="polite">
    <div v-for="n in store.items" :key="n.id" class="notification" :class="`notification-${n.type}`">
      <div class="notification-icon" aria-hidden="true">{{ icon(n.type) }}</div>
      <div class="notification-content">
        <div v-if="n.title" class="notification-title">{{ n.title }}</div>
        <div class="notification-message">{{ n.message }}</div>
      </div>
      <button class="notification-close" aria-label="关闭通知" @click="store.dismiss(n.id)">&times;</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNotificationStore, type NotificationType } from '@/presentation/stores/notificationStore'

const store = useNotificationStore()

const ICONS: Record<NotificationType, string> = {
  success: '✓',
  error: '✗',
  info: 'i',
  warning: '!',
}

const icon = (t: NotificationType): string => ICONS[t] ?? 'i'
</script>
