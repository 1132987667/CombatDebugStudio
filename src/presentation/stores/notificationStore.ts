/**
 * 文件: notificationStore.ts
 * 功能: 全局通知中心（pinia）
 * 描述: 统一全项目通知体系（昊天镜 toast / 唤灵台·封神榜 Notification 双体系并存的问题）。
 *       任一模块调用 notify()，由全局挂载的 <GlobalNotifications /> 统一渲染。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface GlobalNotification {
  id: number
  title: string
  message: string
  type: NotificationType
}

export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<GlobalNotification[]>([])
  let seq = 0

  function dismiss(id: number): void {
    items.value = items.value.filter((n) => n.id !== id)
  }

  /** 统一通知入口（签名兼容旧 Notification.addNotification） */
  function notify(
    title: string,
    message: string,
    type: NotificationType = 'info',
    duration = 3000,
  ): void {
    const id = ++seq
    items.value.push({ id, title, message, type })
    if (duration > 0) {
      window.setTimeout(() => dismiss(id), duration)
    }
  }

  /** 单消息便捷入口（昊天镜类 toast 语义）：无标题，默认 info */
  function toast(message: string, type: NotificationType = 'info', duration = 3000): void {
    notify('', message, type, duration)
  }

  return { items, notify, toast, dismiss }
})
