// 游戏系统演示入口点
import { createApp } from 'vue'
import BattleArena from './components/BattleArena.vue'
import './styles/global.css'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Game System Demo - Initializing...')

  const appElement = document.getElementById('app')
  if (appElement) {
    const app = createApp(BattleArena)
    app.mount(appElement)
    console.log('✅ Battle Arena is ready!')
  }
})

export * from './index'
