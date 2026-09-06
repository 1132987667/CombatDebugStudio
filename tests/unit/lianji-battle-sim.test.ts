/**
 * 斗战流（连击）完整战斗模拟 — 演劫台装配链等价路径
 *
 * 玩家装配连击流全部被动 + 小技能/大招（同 equippedPlayerSkills 注入结构），
 * 加连击率/速度（模拟天赋树属性节点点亮），对双敌人快进 50 回合：
 * 验证战斗可正常完成、风锁施加真实发生（弹射链路实战触发）、敌方承伤为正。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { BattleEntity, SkillConfig } from '@/domain/battle/type/types'
import type { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'

vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout(fn: (...args: unknown[]) => void, ms?: number): symbol {
      setTimeout(() => fn(), Math.max(0, ms ?? 0))
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clear = () => {}
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

/** 连击流全部被动配置（组合被动展开后的实际 id） */
const LIANJI_PASSIVES = [
  'school_fengsuo_bounce',
  'school_fengsuo_bind',
  'school_fengsuo_fengzhu',
  'school_fenghen_jiban_apply',
  'school_fenghen_jiban_heal',
  'school_yufeng_hitdown',
  'school_yufeng_attack',
  'school_lianzhan_fengshi_apply',
  'school_lianzhan_fengshi_transform',
  'school_fengshi_combo_rate',
  'school_lianzhan_fengyi_apply',
  'school_fengshiyong_apply',
  'school_lianshi_qishi',
  'school_fengshi_liejia_link',
  'school_lianzhan_liejia_apply',
  'school_lianzhan_liejia_burst',
  'school_liejia_tougu',
]

describe('连击流完整战斗模拟', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('连击流装配 vs 双敌人：战斗完成、风锁施加、敌方承伤为正', async () => {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    const pair = createBattleParticipantsFromConfig(['test_warrior'], [])
    const player = pair.allies[0]
    const foes = createBattleParticipantsFromConfig([], ['test_tank', 'test_assassin']).enemies
    expect(player).toBeTruthy()
    expect(foes.length).toBe(2)

    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const addBuffSpy = vi.spyOn(buffSystem, 'addBuff')

    // ── 装配连击流（equippedPlayerSkills 注入等价路径）──
    const skills = LIANJI_PASSIVES
      .map((id) => GameDataProcessor.findSkillById(id))
      .filter((s): s is SkillConfig => !!s)
    expect(skills.length).toBe(LIANJI_PASSIVES.length)
    const smalls = ['skill_school_xunfengji', 'skill_school_fengyibaofa']
      .map((id) => GameDataProcessor.findSkillById(id))
      .filter((s): s is SkillConfig => !!s)
    const ult = GameDataProcessor.findSkillById('skill_school_kuangfengjuexi')
    ;(player as { skills: unknown }).skills = {
      small: smalls,
      ultimate: ult ? [ult] : [],
      passive: skills,
    }
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    GameDataProcessor.registerParticipantPassives(player, manager)
    ;(player as { setBuffQuery(q: unknown): void }).setBuffQuery(buffSystem)

    // ── 模拟天赋树属性点亮：连击率 30%、速度压制（弹射速度加成）──
    player.setAttribute(ATTRIBUTE_CODE.comboRate, 30)
    player.setAttribute(ATTRIBUTE_CODE.speed, 200)

    // 敌人血量拉高：保证足够回合数让弹射链路有触发样本
    for (const f of foes) {
      f.setAttribute(ATTRIBUTE_CODE.maxHealth, 5000)
      f.setAttribute(ATTRIBUTE_CODE.currentHealth, 5000)
    }

    battleSystem.initialize([player], foes)
    // initialize 后 battleData.rng 才存在——注入被动共用的确定性随机源
    const rng = (battleSystem as unknown as { battleData?: { rng?: unknown } }).battleData?.rng
    if (rng) manager.setRng(rng as never)
    // 弹射概率判定走 SkillExecutor 自己的随机源——注入恒通过序列以确定性验证链路
    container
      .resolve<SkillManager>('SkillManager')
      .getExecutor()
      .setRng({ next: () => 0.01 } as never)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)

    let rounds = 0
    while (
      battleSystem.getBattleStatus() === BattleStatus.ACTIVE &&
      rounds < 50
    ) {
      await battleSystem.processTurn()
      rounds++
    }
    const finished = battleSystem.getBattleStatus() !== BattleStatus.ACTIVE
    if (!finished) {
      await battleSystem.endBattle(ParticipantSide.ALLY)
    }

    // 战斗推进正常（结束或跑满 50 回合，无异常抛出）
    expect(rounds).toBeGreaterThan(0)

    // 敌方承伤为正（连击流输出生效）
    const totalFoeHpLoss = foes.reduce(
      (sum, f) => sum + Math.max(0, f.maxHealth - f.currentHealth),
      0,
    )
    expect(totalFoeHpLoss).toBeGreaterThan(0)

    // 风锁施加真实发生（弹射/风锁链路实战触发）
    const fengsuoCalls = addBuffSpy.mock.calls.filter(
      (c) => c[1] === 'buff_fengsuo',
    )
    expect(fengsuoCalls.length).toBeGreaterThan(0)
  })
})
