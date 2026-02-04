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

/* 不同类型通知的样式 */
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