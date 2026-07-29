// 游戏系统演示入口点
import { initializeContainer } from '@/infrastructure/di/Container'
import { persistentStorage, migrateLegacyLocalStorage } from '@/infrastructure/adapters/storage'

// 迁移完成前阻塞挂载，防止竞态读取空数据
const migrationPromise = migrateLegacyLocalStorage(persistentStorage)

initializeContainer()


import { createApp } from 'vue'
import { createPinia } from 'pinia'
import BattleArena from '@/presentation/views/BattleArena.vue'
import './presentation/styles/main.scss'
import { type BuffScriptLoader } from '@/domain/buff/BuffScriptLoader'


// 加载Buff脚本
import('@/infrastructure/di/Container').then(({ container }) => {
  const loader: BuffScriptLoader = container.resolve('BuffScriptLoader')
  loader.loadScripts().then(() => {
    console.log('Buff脚本加载完成')
  }).catch(err => {
    console.error('Buff脚本加载失败:', err)
  })
})

document.addEventListener('DOMContentLoaded', async () => {
  // ★ 等待旧数据迁移完成，防止竞态
  await migrationPromise

  const appElement = document.getElementById('app')
  if (appElement) {
    const app = createApp(BattleArena)
    const pinia = createPinia()
    app.use(pinia)
    app.mount(appElement)
  }
})
