// 游戏系统演示入口点
import { initializeContainer } from '@/core/di/Container'
initializeContainer()


import { createApp } from 'vue'
import { createPinia } from 'pinia'
import mitt from 'mitt'
import BattleArena from '@/views/BattleArena.vue'
import './styles/global.css'


// 加载Buff脚本
import('@/core/di/Container').then(({ container }) => {
  const loader = container.resolve('BuffScriptLoader')
  loader.loadScripts().then(() => {
    console.log('Buff脚本加载完成')
  }).catch(err => {
    console.error('Buff脚本加载失败:', err)
  })
})

// 创建全局事件总线
const emitter = mitt()

document.addEventListener('DOMContentLoaded', async () => {
  const appElement = document.getElementById('app')
  if (appElement) {
    const app = createApp(BattleArena)
    const pinia = createPinia()
    app.use(pinia)
    // 挂载事件总线到Vue全局属性
    app.config.globalProperties.$emitter = emitter
    app.mount(appElement)
  }
})

// 导出事件总线供其他模块使用
export const eventBus = emitter
export * from '@/index'
