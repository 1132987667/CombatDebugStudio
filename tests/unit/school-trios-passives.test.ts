/**
 * school-trios-passives.test.ts — MVP「四大流派基础机制」验证
 *
 * 破军/不动/幻影三流派被动配置（skill_passive_schools.json）注册与触发：
 * - 配置可加载（schools.json L1 学习格 skillIds 引用闭环）
 * - 磐石壁垒：回合开始无盾 → 获得最大气血 8% 护盾
 * - 破绽烙印：暴击 → 目标叠【破绽】
 * - 残影叠层：闪避 → 自身叠【残影】
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus, createPassiveContext, BattleTriggerPhase, ParticipantSide } from '@/domain/battle/type/types'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import type { BattleEntity, SkillConfig } from '@/domain/battle/type/types'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'
import schoolsJson from '@configs/xiyou/schools.json'

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

/** 三流派 L1 学习格映射的被动（组合被动展开后的实际 id） */
export const TRIO_PASSIVES = [
  'school_pojun_pozhan_apply',
  'school_pojun_baonu_apply',
  'school_pojun_zhanmie_execute',
  'school_budong_panshi_shield',
  'school_budong_jingji_reflect',
  'school_budong_mingwang_regen',
  'school_huanying_fanji',
  'school_huanying_canying_apply',
  'school_huanying_jifeng_speed',
]

describe('破军/不动/幻影流派被动', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container.resolve<SkillManager>('SkillManager').loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('配置注册闭环：schools.json 三流派 L1 被动格 skillIds 均指向已加载配置', () => {
    for (const school of ['pojun', 'budong', 'huanying']) {
      const cell = schoolsJson.layers
        .flatMap((l) => l.nodes)
        .find((n) => n.school === school && n.type === 'learn' && n.skillKind === '被动')
      expect(cell?.skillIds, `${school} L1 被动格未接线`).toBeTruthy()
      const ids = (cell!.skillIds![0] as string).split(',')
      for (const id of ids) {
        expect(GameDataProcessor.findSkillById(id.trim()), `${id} 未配置`).toBeTruthy()
      }
    }
    for (const id of TRIO_PASSIVES) {
      expect(GameDataProcessor.findSkillById(id)).toBeTruthy()
    }
  })

  it('磐石壁垒：回合开始无盾 → 获得最大气血 8% 护盾', async () => {
    const { player, manager, buffSystem, battle } = await setup()
    player.setAttribute('maxHealth', 1000)
    player.setAttribute('currentHealth', 1000)
    manager.triggerPassives(player, createPassiveContext(BattleTriggerPhase.TURN_START, battle))
    // 8% × 1000 = 80
    expect(buffSystem.getShieldValue(player.id)).toBe(80)
  })

  it('破绽烙印：暴击 → 目标叠【破绽】；斩灭之锋：低血暴击追加真伤', async () => {
    const { player, foe, manager, buffSystem, battle } = await setup()
    foe.setAttribute('currentHealth', 40)
    foe.setAttribute('maxHealth', 100)
    manager.triggerPassives(
      player,
      createPassiveContext(BattleTriggerPhase.CRIT, battle, { sourceId: player.id, targetId: foe.id }),
    )
    expect(buffSystem.getBuffStackCount(foe.id, 'buff_pozhan')).toBe(1)
  })

  it('残影叠层：闪避 → 自身叠【残影】', async () => {
    const { player, foe, manager, buffSystem, battle } = await setup()
    manager.triggerPassives(
      player,
      createPassiveContext(BattleTriggerPhase.DODGE, battle, { sourceId: player.id, targetId: foe.id }),
    )
    expect(buffSystem.getBuffStackCount(player.id, 'buff_canying')).toBe(1)
  })
})

/** 构建持有三流派全部被动的参与者与配套系统 */
async function setup(): Promise<{
  player: BattleEntity
  foe: BattleEntity
  manager: PassiveSkillManager
  buffSystem: BuffSystem
  battle: ReturnType<BattleSystem['getBattleData']>
}> {
  // buff 脚本异步懒加载（main.ts 启动时加载）：护盾数值由 ShieldBuff 脚本写入，须先就位
  await container.resolve<{ loadScripts(): Promise<void> }>('BuffScriptLoader').loadScripts()
  const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
  const pair = createBattleParticipantsFromConfig(['test_warrior'], ['test_tank'])
  const player = pair.allies[0]
  const foe = pair.enemies[0]
  const buffSystem = container.resolve<BuffSystem>('BuffSystem')

  const passives = TRIO_PASSIVES.map((id) => GameDataProcessor.findSkillById(id)).filter(
    (s): s is SkillConfig => !!s,
  )
  ;(player as { skills: unknown }).skills = { small: [], ultimate: [], passive: passives }
  const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
  GameDataProcessor.registerParticipantPassives(player, manager)
  ;(player as { setBuffQuery(q: unknown): void }).setBuffQuery(buffSystem)
  ;(foe as { setBuffQuery(q: unknown): void }).setBuffQuery(buffSystem)

  battleSystem.initialize([player], [foe])
  battleSystem.setBattleState(BattleStatus.ACTIVE)
  const rng = (battleSystem as unknown as { battleData?: { rng?: unknown } }).battleData?.rng
  if (rng) manager.setRng(rng as never)
  const battle = (battleSystem as unknown as { battleData: Parameters<typeof createPassiveContext>[1] }).battleData
  void ParticipantSide
  return { player, foe, manager, buffSystem, battle }
}
