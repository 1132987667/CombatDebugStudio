/**
 * 战斗域系统不变量测试（系统行为审计 · 战斗域）
 *
 * 与既有测试的分工：unit 测试管单函数逻辑、all-enemies-smoke 管每个敌人
 * 行动路径不报错、quick-battle-sim 管模拟器自身契约。本文件管**整局结果层面
 * 跨层一致性**——引擎终态 vs 战报投影 vs 结算判定，以及"变强必须有用"这条
 * 设计意图（加攻击不能变差）与光环叠加不随回合增值。
 *
 * 防的回归类别（AGENTS.md 四类）：
 * - 投影/事件边界：战报存活判定（death 事件近似）与引擎 currentHealth 漂移
 * - 跨层哨兵/口径：回合上限 99 在引擎与模拟器两层的行为必须一致
 * - 清理与重建：光环修饰符初始化恰好一次，不随回合累计
 *
 * 运行: npx vitest run tests/e2e/battle-invariants.system.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus, ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import {
  ENGINE_MAX_TURNS,
  simFullBattle,
  participantFromEnemy as enemySide,
  scaleStat,
} from '@tests/fixtures/headlessSim'

const SEEDS = ['inv-a1', 'inv-a2', 'inv-a3', 'inv-a4', 'inv-a5']

describe('战斗域不变量：终局判定与回合分布', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  // 代表性对抗：均为有主动输出能力的配置（noAttack 训练靶不进此矩阵，它们本来就该打满）
  const matchups: Array<[string[], string[]]> = [
    [['test_warrior'], ['yaotu_fire']],
    [['test_warrior'], ['yaotu_gold']],
    [['yaotu_fire'], ['yaotu_gold']],
    [['test_warrior', 'yaotu_fire'], ['yaotu_gold', 'enemy_079']],
  ]

  it.each(matchups.flatMap((m, i) => SEEDS.map((s) => [i, s] as const)))(
    '对抗%1$s×种子%2$s：必然终局、胜方由灭队判定、不触及回合上限',
    async (_idx, seed) => {
      const matchup = matchups[_idx]
      const allies = matchup[0].map((id) => enemySide(id, ParticipantSide.ALLY))
      const enemies = matchup[1].map((id) => enemySide(id, ParticipantSide.ENEMY))
      const r = await simFullBattle(allies, enemies, seed)

      expect(r.winner, '对抗未决出胜负').not.toBeNull()
      // 设计意图：常规对抗不允许打满 99 回合（拖满即数值失衡，此处即红测哨兵）
      expect(r.currentTurn, `回合数 ${r.currentTurn} 触及上限，疑似僵局`).toBeLessThan(ENGINE_MAX_TURNS)

      // 灭队语义：败方全员 hp≤0，胜方至少一人存活
      const loser = r.winner === ParticipantSide.ALLY ? ParticipantSide.ENEMY : ParticipantSide.ALLY
      for (const u of r.finalUnits.values()) {
        if (u.side === loser) expect(u.hp).toBeLessThanOrEqual(0)
      }
      const winnerAlive = [...r.finalUnits.values()].filter(
        (u) => u.side === r.winner && u.hp > 0,
      )
      expect(winnerAlive.length).toBeGreaterThanOrEqual(1)
    },
  )
})

describe('战斗域不变量：引擎终态 vs 战报投影跨层一致', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  const allyIds = ['test_warrior', 'yaotu_fire']
  const enemyIds = ['yaotu_gold', 'enemy_079']

  it.each(SEEDS)('种子 %s：战报存活/阵营汇总与引擎快照逐项对账', async (seed) => {
    const r = await simFullBattle(
      allyIds.map((id) => enemySide(id, ParticipantSide.ALLY)),
      enemyIds.map((id) => enemySide(id, ParticipantSide.ENEMY)),
      seed,
    )
    expect(r.summary, '已终局但无战报').toBeDefined()
    const s = r.summary!

    // 1. 单位存活：战报 alive（death 事件近似）必须与引擎 currentHealth>0 逐单位一致
    for (const [id, u] of Object.entries(s.units)) {
      const engine = r.finalUnits.get(id)
      expect(engine, `战报单位 ${id} 不在引擎快照中`).toBeDefined()
      expect(u.alive, `单位 ${id} 存活判定漂移（战报 vs 引擎）`).toBe(engine!.hp > 0)
    }

    // 2. 阵营汇总：teams.dealt/taken 必须等于该阵营单位贡献之和（L2/L3 聚合管道）
    for (const team of s.teams) {
      const members = Object.values(s.units).filter((u) => u.side === team.side)
      expect(team.dealt).toBe(members.reduce((sum, u) => sum + u.dealt, 0))
      expect(team.taken).toBe(members.reduce((sum, u) => sum + u.taken, 0))
      expect(team.survivors).toBe(members.filter((u) => u.alive).length)
    }

    // 3. L1 胜负边际与引擎一致：survivorCount = 胜方引擎存活数
    const winnerSide = s.winner
      ? (s.units[s.winner]?.side ?? s.winner)
      : undefined
    if (winnerSide && r.winner !== null) {
      const engineSurvivors = [...r.finalUnits.values()].filter(
        (u) => u.side === r.winner && u.hp > 0,
      ).length
      expect(s.survivorCount).toBe(engineSurvivors)
    }
  })
})

describe('战斗域不变量：变强必须有正反馈', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  // NOTE: 选材教训——曾用沙盒靶 test_warrior（hp100/atk20）做此剧本，它 1 拍被同级
  //       野怪灭队，攻击翻倍不改变回合粒度，红测假阳性。数值单调性必须在
  //       回合可分辨（≥5 拍）的公平对抗上度量。
  it('我方攻击×2（同种子组，公平对抗）：平均回合数下降、总输出不降', async () => {
    const base: number[] = []
    const boosted: number[] = []
    const dealtBase: number[] = []
    const dealtBoost: number[] = []

    for (const seed of SEEDS) {
      const rA = await simFullBattle(
        [enemySide('yaotu_fire', ParticipantSide.ALLY)],
        [enemySide('yaotu_gold', ParticipantSide.ENEMY)],
        seed,
      )
      const allyBoosted = GameDataProcessor.enemyToParticipant(
        scaleStat('yaotu_fire', ATTRIBUTE_CODE.attack, 2), ParticipantSide.ALLY, 0,
      )
      const rB = await simFullBattle(
        [allyBoosted],
        [enemySide('yaotu_gold', ParticipantSide.ENEMY)],
        seed,
      )
      base.push(rA.currentTurn)
      boosted.push(rB.currentTurn)
      dealtBase.push(rA.summary?.teams.find((t) => t.side === ParticipantSide.ALLY)?.dealt ?? 0)
      dealtBoost.push(rB.summary?.teams.find((t) => t.side === ParticipantSide.ALLY)?.dealt ?? 0)
    }

    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    // 设计意图：数值投入翻倍必须换来更快终局（严格小于；等于即数值层根本没消费 attack，
    // 大于即伤害公式存在反向路径——两者都应红）
    expect(avg(boosted), '攻击翻倍未缩短战斗（均值口径）').toBeLessThan(avg(base))
    const totalDealtB = dealtBoost.reduce((x, y) => x + y, 0)
    const totalDealtA = dealtBase.reduce((x, y) => x + y, 0)
    expect(totalDealtB, '攻击翻倍后总输出反而下降').toBeGreaterThan(totalDealtA)
  })

  // 设计意图：斗战西游是回合制，"决策回合"至少 3 拍才构成玩法；同级对抗被 1~2 拍
  // 灭队即数值节奏失衡（本文件初版就踩到过：沙盒靶 1 拍灭，见上方 NOTE）
  it.each(SEEDS)('同级公平对抗（种子 %s）：终局不早于第 3 回合', async (seed) => {
    const r = await simFullBattle(
      [enemySide('yaotu_fire', ParticipantSide.ALLY)],
      [enemySide('yaotu_gold', ParticipantSide.ENEMY)],
      seed,
    )
    expect(r.currentTurn, `${seed} 对抗 ${r.currentTurn} 拍即终局`).toBeGreaterThanOrEqual(3)
  })
})

describe('战斗域不变量：光环叠加不随回合增值', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  it('双光环同队：加成一步到位、后续回合零增长、封顶于设计区间', async () => {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    const enemies = [
      enemySide('yaotu_gold', ParticipantSide.ENEMY),
      enemySide('enemy_079', ParticipantSide.ENEMY),
    ]
    const allies = [enemySide('test_warrior', ParticipantSide.ALLY)]

    battleSystem.setHeadless(true)
    LoggerProvider.logger.setMuted(true)
    try {
      battleSystem.initialize(allies, enemies, undefined, 'aura-stack-seed')
      battleSystem.setBattleState(BattleStatus.ACTIVE)

      // 初始化后：光环修饰符按"光源个数"精确施加，不重复、不漏。
      // NOTE: 不猜测有效攻击上限——持有者自身被动/增伤修饰符与光环乘算，
      //       常数上限是脆断言；堆栈结构（同源唯一 + 计数=光源数）才是设计意图。
      const stackOf = (id: string) =>
        battleSystem.getBuffSystem().getModifierStack(id).getModifiers(ATTRIBUTE_CODE.attack)
      const snap1 = new Map<string, number>()
      for (const p of battleSystem.getBattleData()!.participants.values()) {
        if (p.team !== ParticipantSide.ENEMY) continue
        // 敌方两人各携带一个首领光环 → 每个单位至多 2 个 +15% 修饰符（自己+队友各一源），
        // 超过 2 层即"每回合/每次刷新重复施加"的堆积回归
        const fifteen = stackOf(p.id).filter((m) => m.value === 15 && m.type === ModifierType.PERCENTAGE)
        expect(fifteen.length, `单位 ${p.id} 光环修饰符堆积（${fifteen.length} 层，光源只有 2）`).toBeLessThanOrEqual(2)
        expect(fifteen.length, `单位 ${p.id} 未吃到任何光环`).toBeGreaterThanOrEqual(1)
        snap1.set(p.id, p.getAttribute(ATTRIBUTE_CODE.attack))
      }

      // 打 6 个回合：光环若每回合重复施加，有效攻击会随回合累计——这条断言防的就是它
      for (let i = 0; i < 6; i++) {
        if (battleSystem.getBattleStatus() !== BattleStatus.ACTIVE) break
        await battleSystem.processTurn()
      }
      for (const p of battleSystem.getBattleData()!.participants.values()) {
        if (p.team !== ParticipantSide.ENEMY) continue
        const before = snap1.get(p.id)
        if (before === undefined || before === 0) continue
        const after = p.getAttribute(ATTRIBUTE_CODE.attack)
        expect(after, `第6回合攻击 ${after} ≠ 初始 ${before}，光环疑似随回合重复施加`).toBe(before)
        expect(stackOf(p.id).filter((m) => m.value === 15 && m.type === ModifierType.PERCENTAGE).length)
          .toBeLessThanOrEqual(2)
      }
    } finally {
      battleSystem.resetBattle()
      for (const p of [...allies, ...enemies]) {
        try { battleSystem.getBuffSystem().clearCharacterState(p.id) } catch { /* 尽力 */ }
      }
      battleSystem.setHeadless(false)
      LoggerProvider.logger.setMuted(false)
      LoggerProvider.logger.clearLogs()
    }
  })
})
