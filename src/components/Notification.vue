<template>
  <div class="notifications-container">
    <div 
      v-for="notification in notifications" 
      :key="notification.id" 
      class="notification" 
      :class="`notification-${notification.type}`"
    >
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

<script>
export default {
  name: 'Notification',
  data() {
    return {
      notifications: []
    }
  },
  methods: {
    // 获取不同类型消息的图标
    getIcon(type) {
      const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ',
        warning: '⚠'
      }
      return icons[type] || 'ℹ'
    },
    // 添加通知
    addNotification(title, message, type = 'info', duration = 3000) {
      const id = Date.now() + Math.random()
      const notification = {
        id,
        title,
        message,
        type
      }
      this.notifications.push(notification)
      
      // 自动移除通知
      if (duration > 0) {
        setTimeout(() => {
          this.removeNotification(id)
        }, duration)
      }
    },
    // 移除指定消息
    removeNotification(notificationId) {
      this.notifications = this.notifications.filter(n => n.id !== notificationId)
    }
  }
}
</script>

<style scoped>
@import './BattleArena.scss';
</style>