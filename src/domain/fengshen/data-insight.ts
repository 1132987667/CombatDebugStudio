/**
 * data-insight.ts — 数据洞察聚合纯函数（封神榜「成长曲线 / 来源审计」功能域）
 *
 * 对齐 exp-reward.ts 模式：全部纯函数、无 IO、数据形态对齐封神榜各表行结构。
 * - enemyMeanStatsByLevel：敌人按等级聚合属性均值（成长曲线的敌人侧序列）
 * - equipmentAffixFrequency：装备词条属性出现频次（投放总账）
 * - dropOwnership：敌人掉落 → 物品归属矩阵（独家投放 / 零投放定位）
 */

import type { Enemy } from '@/shared/types/enemy'
import type { EquipmentStatEntry } from '@/domain/fengshen/types'
import type { PlayerBaseAttrCode } from '@/domain/fengshen/types'

/** 玩家六维 → 敌人 stats 键映射（敌人命中/闪避键名不同：hit / dodge） */
export const ENEMY_STAT_KEY_BY_PLAYER_ATTR: Record<PlayerBaseAttrCode, string> = {
  maxHealth: 'maxHealth',
  attack: 'attack',
  defense: 'defense',
  hitValue: 'hit',
  dodgeValue: 'dodge',
  speed: 'speed',
}

/**
 * 敌人按等级聚合各属性均值。同等级存在多只怪（如各场景小妖）时取算术平均，
 * 供成长曲线叠加「同等级敌人均值」参考线。
 */
export function enemyMeanStatsByLevel(
  enemies: Enemy[],
): Array<{ level: number; stats: Record<string, number> }> {
  const byLevel = new Map<number, Enemy[]>()
  for (const e of enemies) {
    const list = byLevel.get(e.level)
    if (list) list.push(e)
    else byLevel.set(e.level, [e])
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => {
      const keys = new Set<string>()
      for (const e of list) for (const k of Object.keys(e.stats ?? {})) keys.add(k)
      const stats: Record<string, number> = {}
      for (const k of keys) {
        let sum = 0
        let n = 0
        for (const e of list) {
          const v = (e.stats as Record<string, number | undefined>)?.[k]
          if (typeof v === 'number') {
            sum += v
            n++
          }
        }
        if (n > 0) stats[k] = Math.round(sum / n)
      }
      return { level, stats }
    })
}

/** 装备词条属性频次行（count 为出现次数，flat/percent 为修正类型拆分计数） */
export interface AffixFrequencyRow {
  attribute: string
  count: number
  flat: number
  percent: number
}

/** 装备 stats 属性出现频次聚合，按 count 降序（投放总账：哪个属性投得过多/过少） */
export function equipmentAffixFrequency(
  equipments: Array<{ stats?: EquipmentStatEntry[] }>,
): AffixFrequencyRow[] {
  const byAttr = new Map<string, AffixFrequencyRow>()
  for (const eq of equipments) {
    for (const s of eq.stats ?? []) {
      let row = byAttr.get(s.attribute)
      if (!row) {
        row = { attribute: s.attribute, count: 0, flat: 0, percent: 0 }
        byAttr.set(s.attribute, row)
      }
      row.count++
      if (s.modifierType === 'percent') row.percent++
      else row.flat++
    }
  }
  return [...byAttr.values()].sort((a, b) => b.count - a.count || a.attribute.localeCompare(b.attribute))
}

/** 掉落归属行：itemId → 掉落它的敌人列表（enemyCount=1 为独家投放） */
export interface DropOwnershipRow {
  itemId: string
  enemies: Array<{ id: string; name: string }>
}

/**
 * 敌人 drops 聚合为物品归属矩阵。按敌人数升序排列（独家投放的最靠前），
 * 同敌人数按 itemId 稳定排序。
 */
export function dropOwnership(
  enemies: Array<Pick<Enemy, 'id' | 'name' | 'drops'>>,
): DropOwnershipRow[] {
  const byItem = new Map<string, DropOwnershipRow>()
  for (const e of enemies) {
    for (const d of e.drops ?? []) {
      if (!d?.itemId) continue
      let row = byItem.get(d.itemId)
      if (!row) {
        row = { itemId: d.itemId, enemies: [] }
        byItem.set(d.itemId, row)
      }
      if (!row.enemies.some((x) => x.id === e.id)) row.enemies.push({ id: e.id, name: e.name })
    }
  }
  return [...byItem.values()].sort(
    (a, b) => a.enemies.length - b.enemies.length || a.itemId.localeCompare(b.itemId),
  )
}

/** 零投放物品：物品全集中有 id 但没有任何敌人掉落的条目 id */
export function zeroDropItemIds(
  allItems: Array<{ id: string }>,
  enemies: Array<Pick<Enemy, 'drops'>>,
): string[] {
  const dropped = new Set<string>()
  for (const e of enemies) for (const d of e.drops ?? []) if (d?.itemId) dropped.add(d.itemId)
  return allItems.filter((i) => !dropped.has(i.id)).map((i) => i.id)
}
