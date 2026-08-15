/**
 * 玩家属性创建与计算（configs/xiyou/player.json 配置驱动）
 * NOTE: 玩家基础属性 = base + (level-1)×growth，叠加加点加成（statBonuses）；
 *       运行时血量/能量由调用方维护。替代原先 mock.ts 中硬编码的 player 数值。
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
  /** 加点转换（系统无对应概念，玩家专属） */
  statBonuses: Partial<Record<keyof XiyouStatPoints, Partial<Record<AttrCode, number>>>>
}

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
  return {
    maxHp: b.maxHealth + g * playerConfig.growth.maxHealth,
    attackMin: b.attackMin + g * playerConfig.growth.attack,
    attackMax: b.attackMax + g * playerConfig.growth.attack,
    defense: b.defense + g * playerConfig.growth.defense,
    speed: b.speed + g * playerConfig.growth.speed,
    critRate: b.critRate,
    critDamage: b.critDamage,
    maxEnergy: b.maxEnergy,
    hitRate: b.hit,
    dodgeRate: b.dodge,
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

/** 创建玩家快照：满血满能量，属性 = 基础 + 成长 + 加点 */
export function createPlayerProfile(opts?: { level?: number; exp?: number; stats?: XiyouStatPoints }): XiyouPlayer {
  const level = opts?.level ?? playerConfig.initialLevel
  const stats: XiyouStatPoints = opts?.stats ?? { available: 0, strength: 0, vitality: 0, agility: 0, spirit: 0 }
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
  }
}
