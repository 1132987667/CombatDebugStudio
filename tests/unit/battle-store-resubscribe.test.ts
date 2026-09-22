// @vitest-environment happy-dom
/**
 * battle-store-resubscribe.test.ts — destroy 后 initializeBattleService 重挂桥上订阅
 *
 * 回归锁定（2026-09-22 修复）：store 的事件订阅只在 setup 执行一次，Huanling.vue 卸载
 * （dev HMR 改脚本即触发）调 destroy() 清掉桥上订阅后没有任何重挂路径——生产无路由、
 * v-show 保活所以线上不可达，但 dev 中投影链冻结直到刷新页面。
 * 现 subscribeBattleEvents 幂等（先精确 off 再 on），initializeBattleService 会重挂。
 *
 * 运行: npx vitest run tests/unit/battle-store-resubscribe.test.ts
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Emitter } from 'mitt'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { useBattleStore } from '@/presentation/stores/battleStore'
import type { BattleService } from '@/application/facade/BattleFacade'
import type { BattleEvents } from '@/domain/battle/type/BattleEventType'

const ACTOR_EVENT = 'current-actor-changed' as const

function getEmitter(): Emitter<BattleEvents> {
  return container
    .resolve<{ getEmitter(): Emitter<BattleEvents> }>('UIEventBus')
    .getEmitter()
}

describe('battleStore 订阅生命周期', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    setActivePinia(createPinia())
  })

  it('setup 时订阅生效：领域事件可达 store', () => {
    const store = useBattleStore()
    getEmitter().emit(ACTOR_EVENT, { actorId: 'actor_a' })
    expect(store.currentActorId).toBe('actor_a')
  })

  it('destroy 后订阅冻结；initializeBattleService 重挂后恢复', () => {
    const store = useBattleStore()
    const battleService = container.resolve<BattleService>('BattleService')

    // destroy（Huanling onUnmounted / HMR 场景）：订阅清除，事件不再到达 store
    store.destroy()
    getEmitter().emit(ACTOR_EVENT, { actorId: 'actor_b' })
    expect(store.currentActorId).toBeNull()

    // 修复点：重挂订阅，投影链恢复
    store.initializeBattleService(battleService)
    getEmitter().emit(ACTOR_EVENT, { actorId: 'actor_c' })
    expect(store.currentActorId).toBe('actor_c')
  })

  it('重挂幂等：多次 initializeBattleService 不产生重复 handler', () => {
    const store = useBattleStore()
    const battleService = container.resolve<BattleService>('BattleService')

    // 清场：从零开始计数（store setup 时已订阅一次，一并清掉）
    getEmitter().all.delete(ACTOR_EVENT)

    store.initializeBattleService(battleService)
    store.initializeBattleService(battleService)

    const handlers = getEmitter().all.get(ACTOR_EVENT) ?? []
    expect(handlers.length).toBe(1)
  })
})
