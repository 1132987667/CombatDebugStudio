/**
 * QuickBattleSim.ts — 封神榜快速验证模拟器
 *
 * 职责：在封神榜上下文用「当前已保存配置」无头跑一场战斗，输出胜负 / 回合数 /
 *       七层战报（单位输出承伤暴击、阵营汇总、判定健康度），让「改参 → 实战检验」
 *       不必切演劫台重开对局。
 *
 * 实现口径与 BattleDataGenerator 一致：headless + 日志静默 + DebugGate 关闭，
 * 跑完恢复全部全局状态，避免污染 UI 战斗/日志面板。战报统计复用
 * fromRecordedBattle → summarizeBattle 管线（与昊天镜战报同源，数字口径一致）。
 */
import { container } from '@/infrastructure/di/Container'
import type { BattleService } from '@/application/facade/BattleFacade'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus, ParticipantSide } from '@/domain/battle/type/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { ActorData } from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { DebugGate } from '@/domain/battle/debug/DebugGate'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { fromRecordedBattle } from '@/application/service/UnifiedArchiveService'
import { summarizeBattle, type BattleSummary } from '@/domain/battle/replay/unified/unified-summary'

/** 单场快速验证结果 */
export interface QuickBattleResult {
  /** 是否正常执行（false = 引擎不可用/异常） */
  ok: boolean
  /** 失败原因（ok=false 时） */
  reason?: string
  /** 胜方阵营；null = 达到回合上限未分胜负 */
  winner: ParticipantSide | null
  /** 实际进行回合数 */
  rounds: number
  /** 七层战报（与昊天镜同管线）；未决出场次录制残缺，不给 */
  summary?: BattleSummary
  /** 参战名单（结果展示用） */
  allyNames: string[]
  enemyNames: string[]
}

export interface QuickBattleOptions {
  /** 我方阵容（actors 表当前已保存行） */
  allyActors: ActorData[]
  /** 敌方阵容（enemies 表当前已保存行） */
  enemyEnemies: Enemy[]
  /** 确定性随机种子（同种子同编成结果可复现）；缺省随机 */
  seed?: string
  /** 回合上限；达到上限未决出 → winner=null（默认 200，与批量生成器一致） */
  maxRounds?: number
}

const DEFAULT_MAX_ROUNDS = 200

function resolveBattleSystem(): BattleSystem {
  const battleService = container.resolve<BattleService>('BattleService')
  return battleService.getBattleManager().getBattleSystem()
}

function resolveDebugGate(): DebugGate | undefined {
  try { return container.resolve<DebugGate>('DebugGate') }
  catch { return undefined }
}

/** 无头整局核心（参与者已构造）——UI 快速验证与系统级测试的同一实现 */
export interface HeadlessBattleOptions {
  ally: BattleEntity[]
  enemy: BattleEntity[]
  seed?: string
  maxRounds?: number
  /** 未决出场次也给（残缺）战报——默认按 UI 语义不给；测试统计管线需要 */
  provideDrawSummary?: boolean
}

export interface HeadlessBattleResult {
  ok: boolean
  reason?: string
  winner: ParticipantSide | null
  /** 实际 processTurn 轮数 */
  rounds: number
  /** 引擎终态回合指针 */
  currentTurn: number
  summary?: BattleSummary
  /** 引擎真实终态：id → {side, hp}（ok=false 时为空表） */
  finalUnits: Map<string, { side: ParticipantSide; hp: number }>
}

/**
 * 无头跑一整局的唯一生产实现：headless + 日志静音 + DebugGate 关闭 + 全量复原。
 * runQuickBattle 与系统级测试共用，杜绝"测试复刻一套模拟口径"的漂移。
 */
export async function runHeadlessBattle(opts: HeadlessBattleOptions): Promise<HeadlessBattleResult> {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS
  const empty = new Map<string, { side: ParticipantSide; hp: number }>()

  let battleSystem: BattleSystem
  try {
    battleSystem = resolveBattleSystem()
  } catch (e) {
    return { ok: false, reason: `战斗引擎不可用: ${String(e)}`, winner: null, rounds: 0, currentTurn: 0, finalUnits: empty }
  }
  // 全局单例引擎：演劫台/唤灵台正在战斗时 initialize 会摧毁进行中的对局，拒绝执行
  if (battleSystem.getBattleStatus() === BattleStatus.ACTIVE) {
    return { ok: false, reason: '有战斗正在进行，请先结束当前战斗再验证', winner: null, rounds: 0, currentTurn: 0, finalUnits: empty }
  }

  const participantIds = [...opts.ally, ...opts.enemy].map((p) => p.id)

  const savedLogs = LoggerProvider.logger.exportLogs()
  const prevHeadless = battleSystem.getHeadless()
  const dg = resolveDebugGate()
  const prevDebugEnabled = dg?.enabled ?? false

  battleSystem.setHeadless(true)
  if (dg) dg.enabled = false
  LoggerProvider.logger.setAutoCleanup(false)
  LoggerProvider.logger.setMuted(true)
  LoggerProvider.logger.clearLogs()

  try {
    battleSystem.regenerateBattleId()
    battleSystem.initialize(opts.ally, opts.enemy, undefined, opts.seed)
    battleSystem.setBattleState(BattleStatus.ACTIVE)

    let rounds = 0
    while (battleSystem.getBattleStatus() === BattleStatus.ACTIVE && rounds < maxRounds) {
      await battleSystem.processTurn()
      rounds++
    }

    const battleData = battleSystem.getBattleData()
    const finalUnits = new Map<string, { side: ParticipantSide; hp: number }>()
    if (battleData) {
      for (const p of battleData.participants.values()) {
        finalUnits.set(p.id, { side: p.team, hp: p.currentHealth })
      }
    }
    const winner = battleData?.winner ?? null
    const base = {
      ok: true as const,
      winner,
      rounds,
      currentTurn: battleData?.currentTurn ?? 0,
      finalUnits,
    }
    if (!battleData || (!winner && !opts.provideDrawSummary)) {
      // 达到回合上限未决出：录制无 BATTLE_END 事件，UI 语义不给残缺战报
      return base
    }
    const rec = battleSystem.getBattleRecording(battleData.battleId)
    const archive = rec ? fromRecordedBattle(rec) : null
    return { ...base, summary: archive ? summarizeBattle(archive) : undefined }
  } catch (e) {
    return { ok: false, reason: String(e), winner: null, rounds: 0, currentTurn: 0, finalUnits: empty }
  } finally {
    battleSystem.resetBattle()
    // 清理参与者残留在 BuffSystem 的修饰符/护盾（参照 BattleDataGenerator.cleanupPrevBuffSystemEntries）
    for (const id of participantIds) {
      try { battleSystem.getBuffSystem().clearCharacterState(id) }
      catch { /* 引擎异常时尽力清理，不让清理失败掩盖主流程结果 */ }
    }
    battleSystem.setHeadless(prevHeadless)
    if (dg) dg.enabled = prevDebugEnabled
    LoggerProvider.logger.setAutoCleanup(true)
    LoggerProvider.logger.setMuted(false)
    // 等待战斗内部 endBattle 的异步收尾（定时器/微任务）排空，避免恢复快照后仍有写入
    await new Promise((resolve) => setTimeout(resolve, 0))
    LoggerProvider.logger.clearLogs()
    LoggerProvider.logger.importLogs(savedLogs)
  }
}

/**
 * 用「当前已保存配置」无头跑一场战斗并输出战报（封神榜/演劫台 UI 入口）。
 * 核心循环在 runHeadlessBattle——与系统级测试同一实现，口径不分叉。
 */
export async function runQuickBattle(opts: QuickBattleOptions): Promise<QuickBattleResult> {
  const allyNames = opts.allyActors.map((a) => a.name)
  const enemyNames = opts.enemyEnemies.map((e) => e.name)
  const ally = opts.allyActors.map((a, i) => GameDataProcessor.actorToParticipant(a, ParticipantSide.ALLY, i))
  const enemy = opts.enemyEnemies.map((e, i) => GameDataProcessor.enemyToParticipant(e, ParticipantSide.ENEMY, i))

  const r = await runHeadlessBattle({ ally, enemy, seed: opts.seed, maxRounds: opts.maxRounds })
  if (!r.ok) {
    return { ok: false, reason: r.reason, winner: null, rounds: 0, allyNames, enemyNames }
  }
  return {
    ok: true,
    winner: r.winner,
    rounds: r.rounds,
    summary: r.summary,
    allyNames,
    enemyNames,
  }
}

/** 多场聚合统计（同一编成跑 N 场，评估数值稳健性） */
export interface QuickBattleAggregate {
  total: number
  allyWins: number
  enemyWins: number
  draws: number
  /** 平均回合数 */
  avgRounds: number
  /** 全场合并判定健康度：暴击率（crits/attacks，0~100） */
  critRate: number
  /** 失败场次原因 → 次数（ok=false） */
  failures: Array<{ reason: string; count: number }>
}

export function aggregateQuickBattles(results: QuickBattleResult[]): QuickBattleAggregate {
  const agg: QuickBattleAggregate = {
    total: results.length, allyWins: 0, enemyWins: 0, draws: 0,
    avgRounds: 0, critRate: 0, failures: [],
  }
  let roundsSum = 0
  let crits = 0
  let attacks = 0
  const failureCount = new Map<string, number>()
  for (const r of results) {
    if (!r.ok) {
      const reason = r.reason ?? '未知错误'
      failureCount.set(reason, (failureCount.get(reason) ?? 0) + 1)
      continue
    }
    if (r.winner === ParticipantSide.ALLY) agg.allyWins++
    else if (r.winner === ParticipantSide.ENEMY) agg.enemyWins++
    else agg.draws++
    roundsSum += r.rounds
    if (r.summary) {
      crits += r.summary.judgment.crits
      attacks += r.summary.judgment.attacks
    }
  }
  const decided = agg.allyWins + agg.enemyWins + agg.draws
  agg.avgRounds = decided > 0 ? Math.round((roundsSum / decided) * 10) / 10 : 0
  agg.critRate = attacks > 0 ? Math.round((crits / attacks) * 1000) / 10 : 0
  agg.failures = [...failureCount].map(([reason, count]) => ({ reason, count }))
  return agg
}
