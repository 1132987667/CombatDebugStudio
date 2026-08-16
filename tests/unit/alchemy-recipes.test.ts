/**
 * alchemy-recipes.test.ts — 炼丹图谱完整性校验（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖：丹方产出可映射物品、材料零断裂、产出数量有效、source 标注「炼丹」的丹药均有丹方。
 *
 * 运行: npx vitest run tests/unit/alchemy-recipes.test.ts
 */
import { describe, expect, it } from 'vitest'
import caveJson from '@configs/xiyou/cave.json'
import itemsJson from '@configs/xiyou/items.json'
import { itemIdByName } from '@/presentation/modules/yanjie/xiyou/caveLogic'

const items = (itemsJson as { items: Array<{ id: string; name: string; source?: string }> }).items
const itemIds = new Set(items.map((i) => i.id))
const recipes = (caveJson as {
  alchemyRecipes: Array<{ name: string; count: number; materials?: Array<{ itemId: string; count: number }> }>
}).alchemyRecipes

describe('炼丹图谱完整性', () => {
  it('每个丹方产出都能映射到 items.json 物品', () => {
    for (const r of recipes) {
      expect(itemIdByName(r.name), `丹方「${r.name}」无对应物品`).not.toBeNull()
    }
  })

  it('丹方材料零断裂（itemId 均存在于 items.json 且数量有效）', () => {
    for (const r of recipes) {
      for (const m of r.materials ?? []) {
        expect(itemIds.has(m.itemId), `丹方「${r.name}」材料 ${m.itemId} 不存在`).toBe(true)
        expect(m.count, `丹方「${r.name}」材料 ${m.itemId} 数量无效`).toBeGreaterThan(0)
      }
    }
  })

  it('丹方产出数量有效（>= 1）', () => {
    for (const r of recipes) {
      expect(r.count, `丹方「${r.name}」产出数量 ${r.count} 无效`).toBeGreaterThanOrEqual(1)
    }
  })

  it('source 标注「炼丹」的丹药均有对应丹方', () => {
    const brewSources = items.filter((i) => i.source?.startsWith('炼丹'))
    expect(brewSources.length).toBeGreaterThan(0)
    for (const it of brewSources) {
      const hit = recipes.some((r) => r.name === it.name)
      expect(hit, `「${it.name}」source 标注炼丹但无丹方`).toBe(true)
    }
  })
})
