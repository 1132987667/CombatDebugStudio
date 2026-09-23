// @vitest-environment happy-dom
/**
 * battle-store-rules-sync.test.ts — 战斗规则 UI → 领域规则管理器的字段同步
 *
 * 回归锁定（2026-09-23 tab1-1）：minDamage/maxDamage（单次伤害上下限）曾只存在于
 * 配置层，BattleRules/updateRules 均漏同步，UI 无从生效。此处锁住两条：
 * store 默认值齐、updateRules 把全字段写进 BattleRuleManager.combat。
 *
 * 运行: npx vitest run tests/unit/battle-store-rules-sync.test.ts
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_RULE_MANAGER_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { useBattleStore } from '@/presentation/stores/battleStore'

function combatOf() {
  return container
    .resolve<BattleRuleManager>(BATTLE_RULE_MANAGER_TOKEN.toString())
    .getConfig().rules.combat
}

describe('battleStore 规则同步', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    setActivePinia(createPinia())
  })

  it('默认含伤害上下限（1/9999）', () => {
    const store = useBattleStore()
    expect(store.rules.minDamage).toBe(1)
    expect(store.rules.maxDamage).toBe(9999)
  })

  it('updateRules 把 minDamage/maxDamage 写入领域层 combat 配置', () => {
    const store = useBattleStore()
    store.updateRules({ minDamage: 5, maxDamage: 300 })
    expect(combatOf().minDamage).toBe(5)
    expect(combatOf().maxDamage).toBe(300)
    // 0 是合法业务值（不禁下限），不得被回退逻辑吞掉
    store.updateRules({ minDamage: 0 })
    expect(combatOf().minDamage).toBe(0)
  })
})
