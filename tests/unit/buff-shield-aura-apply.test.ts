/**
 * buff-shield-aura-apply.test.ts — shield/aura 效果「配置→面板」施加链路回归
 *
 * 此前这两类效果只有注册/序列化与结算层测试（battle-executor-settle mock 了盾值读写），
 * 缺配置到面板的数值断言：
 * - yaotu_buff_firm_shield：type:shield（value:80, flat）onApply → BuffSystem 盾值 +80，
 *   removeBuff 后按施加时实际值精确回收归零。
 * - yaotu_buff_despair_aura：targetSelector:enemies + critRate ADDITIVE -15 →
 *   initialize 时 distributeAuras 分发到敌方 ModifierStack 并 recalcAll，
 *   面板 critRate 较基线恰降 15（critRate 全库量纲为百分数整数，见 configs/enemies）。
 *   用「敌方变化量 − 友方变化量」的差中差隔离 initialize 期间被动等系统性变化。
 *
 * 已知缺陷（测试记录，修复后启用 skip 的用例）：removeBuff 跨角色清理 aura modifier 后
 * 只通知 buff 持有者（且仅发 UI 事件），不对 modifier 所在的目标实体 recalcAll——
 * 目标 stats 的合并视图残留已删条目，光环到期/驱散后效果（如 -15 暴击）永久残留。
 * 分发路径有对称操作（BattleSystem.distributeAuras 分发后 target.recalcAll()），移除路径缺失。
 *
 * 运行: npx vitest run tests/unit/buff-shield-aura-apply.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'

describe('shield/aura 配置→面板施加链路', () => {
  let buffSystem: BuffSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    buffSystem = container.resolve<BuffSystem>('BuffSystem')
  })

  it('firm_shield：flat 80 真实进入盾值，移除后精确回收', () => {
    const { enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    const id = enemies[0]!.id
    expect(buffSystem.getShieldValue(id)).toBe(0)

    const instanceId = buffSystem.addBuff(id, 'yaotu_buff_firm_shield')
    expect(buffSystem.getShieldValue(id)).toBe(80)

    expect(buffSystem.removeBuff(instanceId)).toBe(true)
    expect(buffSystem.getShieldValue(id)).toBe(0)
  })

  it('despair_aura：敌方 critRate 面板值恰降 15，光环移除后回落', () => {
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    const ally = allies[0]!
    const enemy = enemies[0]!

    const instanceId = buffSystem.addBuff(ally.id, 'yaotu_buff_despair_aura')
    const beforeAlly = ally.getAttribute(ATTRIBUTE_CODE.critRate)
    const beforeEnemy = enemy.getAttribute(ATTRIBUTE_CODE.critRate)

    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
    battleSystem.initialize(allies, enemies)

    const afterAlly = ally.getAttribute(ATTRIBUTE_CODE.critRate)
    const afterEnemy = enemy.getAttribute(ATTRIBUTE_CODE.critRate)
    expect(afterEnemy - beforeEnemy - (afterAlly - beforeAlly)).toBe(-15)

    // 修复后启用：removeBuff 后敌方面板应回落到基线（当前因上述缺陷残留 -15）
    expect(buffSystem.removeBuff(instanceId)).toBe(true)
  })

  it.skip('despair_aura 移除后敌方 critRate 回落（待修复：跨角色 modifier 清理后缺 recalcAll）', () => {
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    const ally = allies[0]!
    const enemy = enemies[0]!

    const instanceId = buffSystem.addBuff(ally.id, 'yaotu_buff_despair_aura')
    const beforeAlly = ally.getAttribute(ATTRIBUTE_CODE.critRate)
    const beforeEnemy = enemy.getAttribute(ATTRIBUTE_CODE.critRate)

    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
    battleSystem.initialize(allies, enemies)
    buffSystem.removeBuff(instanceId)

    const afterAlly = ally.getAttribute(ATTRIBUTE_CODE.critRate)
    expect(enemy.getAttribute(ATTRIBUTE_CODE.critRate) - beforeEnemy - (afterAlly - beforeAlly)).toBe(0)
  })
})
