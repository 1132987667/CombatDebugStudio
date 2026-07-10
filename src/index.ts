import { type BuffScriptLoader } from '@/domain/buff/BuffScriptLoader'

// 核心引擎导出
export * from '@/domain/buff/BuffSystem'
export * from '@/domain/buff/BuffScriptRegistry'
export * from '@/domain/buff/BuffScriptLoader'
export * from '@/domain/buff/ModifierStack'
export * from '@/domain/buff/BuffContext'
export * from '@/domain/buff/BuffErrorBoundary'
export { BattleSystem as BattleSystem } from '@/domain/battle/BattleSystem'

// 类型定义导出
export * from '@/domain/buff/types'
export * from '@/domain/character/types'
export * from '@/shared/types/enemy'
export * from '@/domain/battle/type/types'

// 工具函数导出
export * from '@/infrastructure/adapters/logging'
export * from '@/shared/utils/object-pool'
export * from '@/shared/utils/schema-validator'

// 业务脚本导出
export * from '@/domain/buff/scripts'

// 模块初始化函数
export async function initializeBuffSystem(): Promise<void> {
  try {
    // 加载所有 Buff 脚本
    const { container } = await import('@/infrastructure/di/Container')
    const loader: BuffScriptLoader = container.resolve('BuffScriptLoader')
    await loader.loadScripts()

    console.log('Buff system initialized successfully')
  } catch (error) {
    console.error('Failed to initialize buff system:', error)
  }
}
