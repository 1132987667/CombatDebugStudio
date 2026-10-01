/**
 * item-types-closure.test.ts — 物品类型分类树闭合校验（AGENTS.md：非琐碎逻辑留可运行检查）
 * 背景：类型清单曾三处手写（schema 枚举 / PackPane 分组 / 本常量），互相漂移——
 *       封神榜筛选器 4 种实配类型选不到、13 个死选项永远空；行囊页签漏收养成丹药等实配类型。
 * 现在 schema 与 PackPane 均从 ITEM_CATEGORIES 派生，此测试钉死「数据 ⊆ 分类树」方向，防新类型漏登记。
 *
 * 运行: npx vitest run tests/unit/item-types-closure.test.ts
 */
import { describe, expect, it } from 'vitest'
import itemsJson from '@configs/xiyou/items.json'
import {
  ALL_DECLARED_ITEM_TYPES,
  ITEM_CATEGORIES,
  ITEM_TYPE_CATEGORY,
  MATERIAL_DOMAIN_TYPES,
} from '@/shared/constants/item-types'
import { EQUIPMENT_SLOT_LABELS } from '@/shared/types/Item'

const declaredTypes = new Set(ALL_DECLARED_ITEM_TYPES)
const liveTypes = new Set(
  (itemsJson as { items: Array<{ type: string }> }).items.map((it) => it.type),
)

describe('物品类型分类树闭合', () => {
  it('分类树内部无重复归属（一类型只属一大类）', () => {
    const seen = new Set<string>()
    for (const cat of ITEM_CATEGORIES) {
      for (const t of cat.types) {
        expect(seen.has(t), `类型「${t}」重复归属「${cat.label}」`).toBe(false)
        seen.add(t)
      }
    }
    expect(seen.size).toBe(declaredTypes.size)
  })

  it('items.json 实配类型 ⊆ 分类树（新类型先登记再实配，否则筛选器/行囊页签选不出）', () => {
    const missing = [...liveTypes].filter((t) => !declaredTypes.has(t))
    expect(missing, `未登记分类树的实配类型: ${missing.join('、')}`).toEqual([])
  })

  it('类型 → 大类映射与分组标签逐一对应', () => {
    for (const cat of ITEM_CATEGORIES) {
      for (const t of cat.types) {
        expect(ITEM_TYPE_CATEGORY[t], `「${t}」映射的大类错误`).toBe(cat.label)
      }
    }
  })

  it('材料域白名单 ⊆ 分类树（运行时契约成员必须可被展示层归类）', () => {
    for (const t of MATERIAL_DOMAIN_TYPES) {
      expect(declaredTypes.has(t), `材料域类型「${t}」未登记分类树`).toBe(true)
    }
  })

  it('装备组与存档 8 槽标签同源（槽位扩缩时分类树跟随）', () => {
    const equipCat = ITEM_CATEGORIES.find((c) => c.id === 'equip')
    expect(equipCat?.types).toEqual([...Object.values(EQUIPMENT_SLOT_LABELS)])
  })
})
