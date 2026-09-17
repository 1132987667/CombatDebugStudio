/**
 * xiyou-drop-references.test.ts — 掉落/图纸配置引用一致性检查
 * 守住：BOSS 掉落、敌人掉落引用的物品 ID 必须可解析；craftable 装备的图纸必须注册且一一对应。
 * 背景：2026-09-13 落地 BOSS 首杀装备（场景 BOSS rare 掉落，现已并入 enemies.json）与 bp_sp_02~04 图纸拆分，
 *       此前 bp_sp_01 被三件装备共用导致风灵袍/地灵护符造不出正确图纸。
 */
import { describe, expect, it } from 'vitest'
import itemsJson from '@configs/xiyou/items.json'
import equipmentJson from '@configs/equipment/equipment.json'
import enemiesJson from '@configs/enemies/enemies.json'

interface ItemRow { id: string; name: string }
interface DropRow { itemId: string; chance: number }

const itemIds = new Set((itemsJson.items as ItemRow[]).map((i) => i.id))
const gearRows = equipmentJson as unknown as (ItemRow & { blueprintId?: string; craftable?: boolean })[]
const gearIds = new Set(gearRows.map((g) => g.id))

/** 掉落可解析域：物品目录（items.json）∪ 装备目录（equipment.json），与运行时 addItem 的分支一致 */
function isResolvable(itemId: string): boolean {
  return itemIds.has(itemId) || gearIds.has(itemId)
}

describe('敌人掉落引用', () => {
  it('全部敌人的 drops.itemId 均可解析（items.json ∪ equipment.json）', () => {
    const broken: string[] = []
    for (const enemy of enemiesJson as unknown as { id: string; drops?: DropRow[] }[]) {
      for (const d of enemy.drops ?? []) {
        if (!isResolvable(d.itemId)) broken.push(`${enemy.id} → ${d.itemId}`)
      }
    }
    expect(broken).toEqual([])
  })
})

describe('BOSS 掉落引用', () => {
  const bossMajorDrops = (enemiesJson as unknown as { id: string; drops?: DropRow[] }[]).filter((e) =>
    String(e.id).startsWith('boss_major_'),
  )

  it('场景 BOSS 的全部 drops.itemId 均可解析', () => {
    const broken: string[] = []
    for (const boss of bossMajorDrops) {
      for (const d of boss.drops ?? []) {
        if (!isResolvable(d.itemId)) broken.push(`${boss.id} → ${d.itemId}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('场景 BOSS 关底掉首杀专属装备（花妖王/河伯/山神/迷雾妖主）', () => {
    const rareOf = (id: string): string[] =>
      (bossMajorDrops.find((b) => b.id === id)?.drops ?? []).filter((d) => d.probability < 1).map((d) => d.itemId)
    expect(rareOf('boss_major_huayaowang')).toContain('wp_sb01')
    expect(rareOf('boss_major_hebo')).toContain('ar_sb02')
    expect(rareOf('boss_major_shanshen')).toContain('hd_sb03')
    expect(rareOf('boss_major_miwu')).toContain('jz_sb04')
  })
})

describe('装备图纸映射', () => {
  it('craftable 装备的 blueprintId 均已注册', () => {
    const broken = gearRows
      .filter((g) => g.craftable && g.blueprintId && !itemIds.has(g.blueprintId))
      .map((g) => `${g.id} → ${g.blueprintId}`)
    expect(broken).toEqual([])
  })

  it('特殊图纸与装备一一对应（bp_sp_01~04，禁止共用）', () => {
    const byBlueprint = new Map<string, string[]>()
    for (const g of gearRows) {
      if (!g.blueprintId) continue
      byBlueprint.set(g.blueprintId, [...(byBlueprint.get(g.blueprintId) ?? []), g.id])
    }
    expect(byBlueprint.get('bp_sp_01')).toEqual(['wp_sp_01'])
    expect(byBlueprint.get('bp_sp_02')).toEqual(['ar_sp_01'])
    expect(byBlueprint.get('bp_sp_03')).toEqual(['ac_sp_01'])
    expect(byBlueprint.get('bp_sp_04')).toEqual(['wp_sp_02'])
  })
})
