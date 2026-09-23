/**
 * 玩家属性创建与计算（configs/xiyou/player.json 配置驱动）
 * NOTE: 玩家基础属性 = base + (level-1)×growth，叠加加点加成（statBonuses）；
 *       运行时血量/法力由调用方维护。替代原先 mock.ts 中硬编码的 player 数值。
 *       结构复用封神榜既有模型：base 对齐 ActorData.stats、growth/expTable 对齐 GrowthCurveData，
 *       不平行定义成长概念；后续如需进封神榜管理可直接下沉（同步兜底，不依赖异步 IDB）。
 */

import playerConfigJson from '@configs/xiyou/player.json'
import { ATTRIBUTE_CODE, type ATTRIBUTE_CODE as AttrCode } from '@/domain/attribute/types'
import type { ActorData, GrowthCurveData } from '@/domain/fengshen/types'
import type { XiyouPlayer, XiyouStatPoints } from './types'

export interface XiyouPlayerConfig {
  name: string
  title: string
  initialLevel: number
  /** 1 级基础属性（对齐 ActorData.stats，键为属性码，含 attackMin/attackMax 区间） */
  base: ActorData['stats']
  /** 每级成长（对齐 GrowthCurveData.perLevel） */
  growth: GrowthCurveData['perLevel']
  /** 升级经验表（对齐 GrowthCurveData.expTable，缺档视为封顶） */
  expTable: GrowthCurveData['expTable']
  /** 加点转换（SAP 六维自由点：1 点 = 12 气血 = 2 攻 = 2 防 = 2 命中 = 2 闪避 = 2 速度，《玩家数值体系构建计划.md》D1） */
  statBonuses: Partial<Record<keyof XiyouStatPoints, Partial<Record<AttrCode, number>>>>
  /** 每级自由属性点（缺省 4） */
  freePointsPerLevel?: number
}

// HACK: player.json 无 d.ts；XiyouPlayerConfig 与其同构（growth 键开放），结构漂移由运行时 ?? 兜底
export const playerConfig = playerConfigJson as unknown as XiyouPlayerConfig

/** 当前等级升级所需经验（expTable 无档位时返回 Infinity，视为封顶） */
export function expNeedForLevel(level: number): number {
  return playerConfig.expTable?.find((r) => r.level === level)?.expRequired ?? Infinity
}

/** 基础属性（仅 base + 等级成长，不含加点） */
export function computePlayerBase(level: number): Pick<
  XiyouPlayer,
  'maxHp' | 'attackMin' | 'attackMax' | 'defense' | 'speed' | 'critRate' | 'critDamage' | 'maxEnergy' | 'hitRate' | 'dodgeRate'
> {
  const g = level - 1
  const b = playerConfig.base
  // growth 键为 Partial（GrowthPerLevel）；configs 实配六键，缺键按 0 成长兜底
  const growth = playerConfig.growth as Record<string, number>
  return {
    maxHp: b.maxHealth + g * (growth.maxHealth ?? 0),
    attackMin: b.attackMin + g * (growth.attack ?? 0),
    attackMax: b.attackMax + g * (growth.attack ?? 0),
    defense: b.defense + g * (growth.defense ?? 0),
    speed: b.speed + g * (growth.speed ?? 0),
    critRate: b.critRate,
    critDamage: b.critDamage,
    maxEnergy: b.maxEnergy,
    hitRate: b.hitRate,
    dodgeRate: b.dodgeRate,
  }
}

/** 加点转换：按当前分配计算各属性加成（config.statBonuses） */
export function computeStatBonuses(stats: XiyouStatPoints): Partial<Record<AttrCode, number>> {
  const out: Partial<Record<AttrCode, number>> = {}
  for (const [statKey, bonuses] of Object.entries(playerConfig.statBonuses)) {
    const points = stats[statKey as keyof XiyouStatPoints] ?? 0
    if (!bonuses) continue
    for (const [code, val] of Object.entries(bonuses)) {
      out[code as AttrCode] = (out[code as AttrCode] ?? 0) + points * (val as number)
    }
  }
  return out
}

/** 等级突破节点（完整项目说明 §20：突破·壹~伍，丹 + 阶位金钱；60 级二周目预留不设丹） */
export interface BreakNode {
  stage: number
  /** 解锁等级（突破后方可升到该级） */
  level: number
  pillId: string
  money: number
}

export const BREAK_NODES: BreakNode[] = [
  { stage: 1, level: 10, pillId: 'break_pill_1', money: 500 },
  { stage: 2, level: 20, pillId: 'break_pill_2', money: 1000 },
  { stage: 3, level: 30, pillId: 'break_pill_3', money: 2000 },
  { stage: 4, level: 40, pillId: 'break_pill_4', money: 4000 },
  { stage: 5, level: 50, pillId: 'break_pill_5', money: 8000 },
]

/** 升到 nextLevel 是否被突破节点卡住（节点 = 10 的倍数级，需对应阶次已完成突破） */
export function isBreakBlocked(nextLevel: number, breakStage: number): boolean {
  return nextLevel % 10 === 0 && breakStage < nextLevel / 10
}

/** 下一待突破节点（五阶全满返回 null） */
export function nextBreakNode(breakStage: number): BreakNode | null {
  return BREAK_NODES.find((n) => n.stage === breakStage + 1) ?? null
}

/** 节点中文名（突破·壹/贰/叁/肆/伍） */
export function breakNodeLabel(stage: number): string {
  return ['壹', '贰', '叁', '肆', '伍'][stage - 1] ?? String(stage)
}

/** 创建玩家快照：满血满法力，属性 = 基础 + 成长 + 加点 */
export function createPlayerProfile(opts?: { level?: number; exp?: number; stats?: XiyouStatPoints; breakStage?: number }): XiyouPlayer {
  const level = opts?.level ?? playerConfig.initialLevel
  const stats: XiyouStatPoints = opts?.stats ?? { available: 0, hp: 0, atk: 0, def: 0, hit: 0, dodge: 0, speed: 0 }
  const base = computePlayerBase(level)
  const bonus = computeStatBonuses(stats)
  const maxHp = base.maxHp + (bonus[ATTRIBUTE_CODE.maxHealth] ?? 0)
  const maxEnergy = base.maxEnergy + (bonus[ATTRIBUTE_CODE.maxEnergy] ?? 0)
  const attack = bonus[ATTRIBUTE_CODE.attack] ?? 0
  return {
    level,
    name: playerConfig.name,
    title: playerConfig.title,
    hp: maxHp,
    maxHp,
    energy: maxEnergy,
    maxEnergy,
    attackMin: base.attackMin + attack,
    attackMax: base.attackMax + attack,
    defense: base.defense + (bonus[ATTRIBUTE_CODE.defense] ?? 0),
    speed: base.speed + (bonus[ATTRIBUTE_CODE.speed] ?? 0),
    critRate: base.critRate,
    critDamage: base.critDamage,
    hitRate: base.hitRate,
    dodgeRate: base.dodgeRate,
    exp: opts?.exp ?? 0,
    expNeed: expNeedForLevel(level),
    breakStage: opts?.breakStage ?? 0,
  }
}
