// 游戏系统演示入口点
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { persistentStorage, migrateLegacyLocalStorage } from '@/infrastructure/adapters/storage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { BattleDataLoader } from '@/application/service/BattleDataLoader'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { DamageCalculator } from '@/domain/skill/DamageCalculator'

// 迁移完成前阻塞挂载，防止竞态读取空数据
const migrationPromise = migrateLegacyLocalStorage(persistentStorage)

initializeContainer()

/**
 * 封神榜数据引导（封神榜开发计划 §3.4）：种子导入 → IDB 预载 → 切换引擎数据源 + 注入克制矩阵。
 * 任一环节失败均回退 ConfigDataSource，不阻塞应用启动。
 */
async function bootstrapFengshen(): Promise<void> {
  try {
    await seedFengshenData(persistentStorage)
    const loader = new BattleDataLoader(persistentStorage)
    const ok = await loader.reload()
    if (!ok) {
      console.warn('封神榜数据未就绪，战斗引擎回退 configs 数据源')
    }
    // 阵营克制矩阵注入 DamageCalculator（规格说明书 §3.7）
    const api = new GameDataApi(persistentStorage)
    const elements = await api.getElementMatrix()
    if (elements) {
      const damageCalc = container.resolve<DamageCalculator>('DamageCalculator')
      damageCalc.setConfig({
        elementMatrix: { matrix: elements.matrix, defaultCoefficient: elements.defaultCoefficient },
      })
    }
  } catch (error) {
    console.error('封神榜数据引导失败:', error)
  }
}


import { createApp } from 'vue'
import { createPinia } from 'pinia'
import BattleArena from '@/presentation/views/BattleArena.vue'
import './presentation/styles/main.scss'
import { type BuffScriptLoader } from '@/domain/buff/BuffScriptLoader'

// 全局注册高频通用组件
import {
  Button,
  NumericStepper,
  ToggleSwitch,
  RadioButtonGroup,
  Tabs,
  SpeedSelector,
  TacticalInput,
  TacticalSelect,
  Dialog,
  ConfirmDialog,
  CompendiumDialog,
  EmptyState,
  GlobalNotifications,
  ModuleHeader,
  AttributeTooltip,
  EntityTooltip,
  EnemyDetail,
  ItemDetail,
} from '@/presentation/components'

const globalComponents: Record<string, any> = {
  Button,
  NumericStepper,
  ToggleSwitch,
  RadioButtonGroup,
  Tabs,
  SpeedSelector,
  TacticalInput,
  TacticalSelect,
  Dialog,
  ConfirmDialog,
  CompendiumDialog,
  EmptyState,
  GlobalNotifications,
  ModuleHeader,
  AttributeTooltip,
  EntityTooltip,
  EnemyDetail,
  ItemDetail,
}


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
  //  等待旧数据迁移完成，防止竞态
  await migrationPromise
  //  封神榜数据引导完成后再挂载，确保引擎数据源就绪
  await bootstrapFengshen()

  const appElement = document.getElementById('app')
  if (appElement) {
    const app = createApp(BattleArena)
    const pinia = createPinia()
    app.use(pinia)

    // 全局注册高频通用组件
    for (const [name, component] of Object.entries(globalComponents)) {
      app.component(name, component)
    }

    app.mount(appElement)
  }
})
