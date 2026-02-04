// 游戏系统演示入口点
import { createApp } from 'vue'
import BattleArena from '@/views/BattleArena.vue'
import './styles/global.css'

document.addEventListener('DOMContentLoaded', async () => {
  const appElement = document.getElementById('app')
  if (appElement) {
    const app = createApp(BattleArena)
    app.mount(appElement)
  }
})

export * from './index'
