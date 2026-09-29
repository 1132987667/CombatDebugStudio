/**
 * xiyou-drop-references.test.ts — 掉落/图纸配置引用一致性检查
 * 守住：BOSS 掉落、敌人掉落引用的物品 ID 必须可解析；craftable 装备的图纸必须注册且一一对应；
 *       装备获取契约（C 方案分层）：常规件图纸掉落者可达，专属件被 boss 直接掉落。
 * 背景：2026-09-13 落地 BOSS 首杀装备（场景 BOSS rare 掉落，现已并入 enemies.json）与 bp_sp_02~04 图纸拆分，
 *       此前 bp_sp_01 被三件装备共用导致风灵袍/地灵护符造不出正确图纸。
 *       2026-09-29 材料产出审计：legend/immortal/sp 图纸的掉落者曾无战斗入口，专属装备改为 boss 直落成品；
 *       同日隐藏妖王（boss_hidden_*）与万妖国（boss_wanyao_*）接入场景，全部 boss 可达；
 *       同日再裁定：11 张专属图纸恢复投放——legend 挂对应妖王、immortal 挂六耳、sp 挂主题 major boss（图纸+灵珠同敌）。
 */
import { describe, expect, it } from 'vitest'
import itemsJson from '@configs/xiyou/items.json'
import equipmentJson from '@configs/equipment/equipment.json'
import enemiesJson from '@configs/enemies/enemies.json'
import scenesJson from '@configs/xiyou/scenes.json'
import caveJson from '@configs/xiyou/cave.json'
import packJson from '@configs/xiyou/pack.json'

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

  it('特殊图纸与装备一一对应（bp_sp_01~03，禁止共用）', () => {
    const byBlueprint = new Map<string, string[]>()
    for (const g of gearRows) {
      if (!g.blueprintId) continue
      byBlueprint.set(g.blueprintId, [...(byBlueprint.get(g.blueprintId) ?? []), g.id])
    }
    expect(byBlueprint.get('bp_sp_01')).toEqual(['wp_sp_01'])
    expect(byBlueprint.get('bp_sp_02')).toEqual(['ar_sp_01'])
    expect(byBlueprint.get('bp_sp_03')).toEqual(['ac_sp_01'])
    expect(byBlueprint.has('bp_sp_04')).toBe(false)
  })
})

describe('装备获取契约（C 方案分层：常规打造 / 专属直落）', () => {
  const enemyRows = enemiesJson as unknown as { id: string; drops?: DropRow[] }[]
  const droppersOf = (itemId: string): string[] =>
    enemyRows.filter((e) => (e.drops ?? []).some((d) => d.itemId === itemId)).map((e) => e.id)

  // 可达战斗入口：场景敌组（含 boss 关）∪ runFlow 妖魁前哨（MINOR_BOSS_BY_REGION 代码映射）
  const sceneRows = scenesJson as unknown as { enemies?: { id?: string }[] }[]
  const reachableEnemyIds = new Set<string>([
    ...sceneRows.flatMap((s) => (s.enemies ?? []).map((e) => e.id ?? '')),
    'boss_minor_taoyao',
    'boss_minor_liuyao',
    'boss_minor_yanjing',
    'boss_minor_zhuyao',
    'boss_minor_panseng',
  ])

  it('craftable 装备的图纸掉落者可达，或装备本身被直接掉落', () => {
    const broken: string[] = []
    for (const g of gearRows) {
      if (!g.craftable || !g.blueprintId) continue
      const bpReachable = droppersOf(g.blueprintId).some((id) => reachableEnemyIds.has(id))
      const directDrop = droppersOf(g.id).length > 0
      if (!bpReachable && !directDrop) broken.push(`${g.id} ← ${g.blueprintId}（掉落者不可达且无直落）`)
    }
    expect(broken).toEqual([])
  })

  it('专属件直落来源在位（妖王/终局/主题 major boss）', () => {
    expect(droppersOf('wp_t4_01')).toContain('boss_king_niumo')
    expect(droppersOf('ac_t4_01')).toContain('boss_king_pansi')
    expect(droppersOf('ac_t4_02')).toContain('boss_king_dapeng')
    for (const id of ['wp_t5_01', 'ar_t5_01', 'ac_t5_01', 'ac_t5_02']) {
      expect(droppersOf(id)).toContain('boss_final_liuer')
    }
    expect(droppersOf('wp_sp_01')).toContain('boss_final_liuer')
    expect(droppersOf('ar_sp_01')).toContain('boss_major_miwu')
    expect(droppersOf('ac_sp_01')).toContain('boss_major_shanshen')
  })

  it('妖王/终局/隐藏 boss 有战斗入口（出现在场景敌组）', () => {
    const sceneEnemyIds = new Set(sceneRows.flatMap((s) => (s.enemies ?? []).map((e) => e.id ?? '')))
    for (const boss of [
      'boss_king_niumo',
      'boss_king_pansi',
      'boss_king_dapeng',
      'boss_final_liuer',
      'boss_hidden_huayaowang',
      'boss_hidden_hebo',
      'boss_hidden_shanshen',
      'boss_hidden_miwu',
      'boss_hidden_rulai',
      'boss_wanyao_baiyan',
      'boss_wanyao_heifeng',
      'boss_wanyao_dixing',
      'boss_wanyao_jinchan',
      'boss_wanyao_jiuchi',
    ]) {
      expect(sceneEnemyIds.has(boss), boss).toBe(true)
    }
  })

  it('专属图纸投放位在位（2026-09-29 裁定：legend/immortal/sp 图纸恢复挂首领掉落，禁止再成死配置）', () => {
    const placed: [string, string][] = [
      ['bp_legend_01', 'boss_king_niumo'],
      ['bp_legend_02', 'boss_king_pansi'],
      ['bp_legend_03', 'boss_king_dapeng'],
      ['bp_immortal_01', 'boss_final_liuer'],
      ['bp_immortal_02', 'boss_final_liuer'],
      ['bp_immortal_03', 'boss_final_liuer'],
      ['bp_immortal_04', 'boss_final_liuer'],
      ['bp_sp_01', 'boss_major_huayaowang'],
      ['bp_sp_02', 'boss_major_miwu'],
      ['bp_sp_03', 'boss_major_shanshen'],
    ]
    for (const [bp, boss] of placed) {
      expect(droppersOf(bp), bp).toContain(boss)
    }
    // sp 图纸与主灵珠同敌投放（图纸+材料单点闭环）
    for (const [bp, pearl] of [['bp_sp_01', 'mat_sp_03'], ['bp_sp_02', 'mat_sp_04'], ['bp_sp_03', 'mat_sp_05']]) {
      expect(droppersOf(pearl).sort()).toEqual(droppersOf(bp).sort())
    }
  })

  it('craftable 装备的材料必须有产出源（boss 直落件豁免）', () => {
    const itemRows = itemsJson.items as ItemRow[]
    const produced = new Set<string>([
      ...enemyRows.flatMap((e) => (e.drops ?? []).map((d) => d.itemId)),
      ...sceneRows.flatMap((s) => (s.drops?.materials ?? []) as string[]),
      ...((caveJson.gardenCrops ?? []) as { id: string }[]).map((c) => c.id),
      // 坊市按 name 出售，经 items.json 反查 itemId（与 packStore.nameToId 同口径）
      ...((packJson.shopGoods ?? []) as { name: string }[])
        .map((g) => itemRows.find((i) => i.name === g.name)?.id)
        .filter((id): id is string => !!id),
    ])
    const broken: string[] = []
    for (const g of gearRows as unknown as { id: string; craftable?: boolean; materials?: { itemId: string; count: number }[] }[]) {
      if (!g.craftable) continue
      if (droppersOf(g.id).length > 0) continue
      for (const m of g.materials ?? []) {
        if (!produced.has(m.itemId)) broken.push(`${g.id} ← ${m.itemId}（零产出）`)
      }
    }
    expect(broken).toEqual([])
  })
})
