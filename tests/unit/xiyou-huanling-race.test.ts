/**
 * 唤灵台默认阵容初始化 与 斗战西游（BattleZen）初始化的异步竞态回归测试。
 *
 * bug 背景：
 *   Huanling.initBattle 在 onMounted 后 await 封神榜 IDB（lineups/actors）查询，完成后
 *   无条件 initializeTeams 覆盖共享 BattleService 单例的队伍。若其完成时刻晚于斗战西游
 *   BattleZen 的初始化（BattleZen 会自动 startBattle 激活战斗），唤灵台的默认 5v8 阵容
 *   （5 五行护法 + 8 花妖/蟹将系列，合并自封神榜全部 lineups）会顶掉斗战西游自己的 4v3
 *   阵容，导致斗战西游界面显示唤灵台的角色。
 * 修复：Huanling.initBattle 在 initializeTeams 前检查战斗是否已激活，已激活则跳过默认阵容。
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import type { BattleService } from '@/application/facade/BattleFacade'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import { BATTLE_RULE_MANAGER_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { buildBattleTeams, scenes } from '@/presentation/modules/yanjie/xiyou/data/mock'
import { useBattleStore } from '@/presentation/stores/battleStore'

describe('唤灵台 × 斗战西游 初始化竞态', () => {
  let battleService: BattleService
  let store: ReturnType<typeof useBattleStore>

  beforeAll(() => {
    container.clear()
    initializeContainer()
    setActivePinia(createPinia())
    battleService = container.resolve<BattleService>('BattleService')
    store = useBattleStore()
    store.initializeBattleService(battleService)
    battleService.loadSkillConfigs()
    // 关闭自动战斗循环：测试只关心队伍规模，避免自动战斗触发动画队列（RAF mock 与动画时序冲突）
    const ruleManager = container.resolve<BattleRuleManager>(BATTLE_RULE_MANAGER_TOKEN.toString())
    const config = ruleManager.getConfig()
    ruleManager.updateConfig({
      rules: { ...config.rules, autoBattle: { ...config.rules.autoBattle, enabled: false } },
    })
  })

  beforeEach(() => {
    battleService.reset()
    battleService.clearParticipants()
  })

  /** 斗战西游 BattleZen.initBattle 的初始化序列（省略 pack.init，与测试关注点无关） */
  async function battleZenInit(): Promise<void> {
    const scene = scenes.find((s) => s.unlocked) ?? scenes[0]
    const { ally, enemy } = buildBattleTeams(scene as never)
    if (battleService.getIsBattleActive()) battleService.endBattle(ParticipantSide.ALLY)
    battleService.reset()
    battleService.clearParticipants()
    battleService.initializeTeams(ally, enemy)
    store.syncTeams()
    store.selectCharacter(ally[0]?.id ?? '')
    await store.startBattle()
  }

  /** 唤灵台默认阵容（合并 lineups 后）：5 我方护法 + 8 敌方（花妖王/蟹将系列） */
  function huanlingDefaultTeams(): { ally: BattleEntity[]; enemy: BattleEntity[] } {
    const allyIds = ['guardian_fire', 'guardian_gold', 'guardian_water', 'guardian_wood', 'guardian_earth']
    const enemyIds = ['enemy_007', 'enemy_001', 'enemy_004', 'enemy_002', 'enemy_016', 'enemy_013', 'enemy_010', 'enemy_015']
    const ally = allyIds.map((id, i) =>
      GameDataProcessor.enemyToParticipant(
        { id, name: id, level: 10, stats: { currentHealth: 350 }, skills: { small: [], passive: [], ultimate: [] } },
        ParticipantSide.ALLY,
        i,
      ),
    )
    const enemy = enemyIds
      .map((id, i) => {
        const ed = GameDataProcessor.findEnemyById(id)
        return ed ? GameDataProcessor.enemyToParticipant(ed, ParticipantSide.ENEMY, i) : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return { ally, enemy }
  }

  it('斗战西游各场景阵容规模不超过 4v4（buildBattleTeams 输出）', () => {
    for (const s of scenes) {
      const { ally, enemy } = buildBattleTeams(s as never)
      expect(ally.length).toBeLessThanOrEqual(4)
      expect(enemy.length).toBeLessThanOrEqual(4)
    }
  })

  it('BattleZen.initBattle 完整流程后为 4v3 且战斗激活', async () => {
    await battleZenInit()
    expect(store.allyTeam.length).toBeLessThanOrEqual(4)
    expect(store.enemyTeam.length).toBeLessThanOrEqual(4)
    expect(battleService.getIsBattleActive()).toBe(true)
  })

  it('唤灵台默认阵容 = 5 我方 + 8 敌方（lineups 合并去重）', () => {
    const lineups = GameDataProcessor.getLineupsData()
    const seen = new Set<string>()
    const allyIds: string[] = []
    const enemyIds: string[] = []
    for (const lineup of lineups) {
      const roles = [...lineup.roles].sort((a, b) => a.seatIndex - b.seatIndex)
      for (const role of roles) {
        if (seen.has(role.roleId)) continue
        seen.add(role.roleId)
        // 唤灵台判据：actors 命中归我方（guardian_* 属 actors 表）、enemies 命中归敌方
        if (role.roleId.startsWith('guardian_')) allyIds.push(role.roleId)
        else enemyIds.push(role.roleId)
      }
    }
    expect(allyIds.length).toBe(5)
    expect(enemyIds.length).toBe(8)
  })

  it('竞态前置：BattleZen 激活后，唤灵台晚到的 initializeTeams 会覆盖为 5v8', async () => {
    await battleZenInit()
    const { ally, enemy } = huanlingDefaultTeams()
    battleService.initializeTeams(ally, enemy)
    store.syncTeams()
    expect(store.allyTeam.length).toBe(5)
    expect(store.enemyTeam.length).toBe(8)
  })

  it('修复语义：BattleZen 激活后，唤灵台守卫跳过默认阵容，队伍保持 4v3', async () => {
    await battleZenInit()
    // Huanling.initBattle 的守卫：战斗已激活（被其他模块接管）则跳过默认阵容初始化
    if (!battleService.getIsBattleActive()) {
      const { ally, enemy } = huanlingDefaultTeams()
      battleService.initializeTeams(ally, enemy)
      store.syncTeams()
    }
    expect(store.allyTeam.length).toBeLessThanOrEqual(4)
    expect(store.enemyTeam.length).toBeLessThanOrEqual(4)
  })
})
