// 核心引擎导出
export * from './core/BuffSystem'
export * from './core/BuffScriptRegistry'
export * from './core/BuffScriptLoader'
export * from './core/ModifierStack'
export * from './core/BuffContext'
export * from './core/BuffErrorBoundary'
export { GameBattleSystem as BattleSystem } from './core/BattleSystem'

// 类型定义导出
export * from './types/buff'
export * from './types/character'
export * from './types/modifier'
export * from './types/enemy'
export * from './types/battle'

// 工具函数导出
export * from './utils/logger'
export * from './utils/perf-monitor'
export * from './utils/object-pool'
export * from './utils/schema-validator'

// 业务脚本导出
export * from './scripts'

// 模块初始化函数
export async function initializeBuffSystem(): Promise<void> {
  try {
    // 加载所有 Buff 脚本
    const { BuffScriptLoader } = await import('./core/BuffScriptLoader')
    await BuffScriptLoader.getInstance().loadScripts()

    console.log('Buff system initialized successfully')
  } catch (error) {
    console.error('Failed to initialize buff system:', error)
  }
}
