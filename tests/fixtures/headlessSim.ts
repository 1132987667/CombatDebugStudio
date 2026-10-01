/**
 * headlessSim — 系统级测试共享的无头整局入口
 *
 * NOTE: 生产同源——整局循环、headless/日志/清理复原全部走 QuickBattleSim.runHeadlessBattle
 *       （UI 快速验证同一实现），本文件只做薄封装：转 SimOutcome 形状 + 未决出也给战报
 *       （统计管线需要）+ 失败直接抛错让测试红得有指向，不静默降级。
 */
import { ParticipantSide } from '@/domain/battle/type/types'
import type { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import type { Enemy } from '@/shared/types/enemy'
import type { BattleSummary } from '@/domain/battle/replay/unified/unified-summary'
import { runHeadlessBattle } from '@/application/service/QuickBattleSim'
import { getEnemyConfig } from '@tests/fixtures/loadTestData'

/** 引擎默认全局回合上限（battle-rule-turn-cap.test.ts 锁定的 99） */
export const ENGINE_MAX_TURNS = 99

export interface SimOutcome {
  winner: ParticipantSide | null
  currentTurn: number
  summary?: BattleSummary
  /** 引擎真实终态：id → {side, hp} */
  finalUnits: Map<string, { side: ParticipantSide; hp: number }>
}

export async function simFullBattle(
  allies: BattleParticipantImpl[],
  enemies: BattleParticipantImpl[],
  seed: string,
  maxRounds = ENGINE_MAX_TURNS + 5,
): Promise<SimOutcome> {
  const r = await runHeadlessBattle({
    ally: allies,
    enemy: enemies,
    seed,
    maxRounds,
    provideDrawSummary: true,
  })
  if (!r.ok) throw new Error(`无头整局失败 (${seed}): ${r.reason}`)
  return { winner: r.winner, currentTurn: r.currentTurn, summary: r.summary, finalUnits: r.finalUnits }
}

/** 从真实敌人配置生成参与者（找不到配置直接抛错，让测试红得有指向） */
export function participantFromEnemy(
  configId: string,
  side: ParticipantSide,
  statsPatch?: Partial<Record<ATTRIBUTE_CODE, number>>,
): BattleParticipantImpl {
  const cfg = getEnemyConfig(configId)
  if (!cfg) throw new Error(`configs/enemies 缺少敌人 ${configId}`)
  if (!statsPatch) return GameDataProcessor.enemyToParticipant(cfg, side, 0)
  const patched: Enemy = { ...cfg, stats: { ...cfg.stats, ...statsPatch } }
  return GameDataProcessor.enemyToParticipant(patched, side, 0)
}

/** 属性缩放克隆（"变强"剧本用，不改原始配置） */
export function scaleStat(
  configId: string,
  code: ATTRIBUTE_CODE,
  factor: number,
): Enemy {
  const cfg = getEnemyConfig(configId)!
  const stats = { ...cfg.stats }
  const v = stats[code]
  if (typeof v === 'number') stats[code] = v * factor
  return { ...cfg, stats }
}
