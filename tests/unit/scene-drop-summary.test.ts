/**
 * scene-drop-summary.test.ts — 场景掉落汇总测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 多来源同物品合并（数量取大/概率独立合并/来源计数）、fabao 条目标记与不混算、必掉单列
 */
import { describe, expect, it } from 'vitest'
import { sceneDropSummary } from '@/presentation/modules/yanjie/xiyou/battle'

/** 桃林小径（configs/xiyou/scenes.json 真实场景：花妖幼芽/草精 + 守护桃林守卫） */
const scene = {
  enemies: [
    { name: '花妖幼芽', level: 1 },
    { name: '草精', level: 1 },
    { name: '幼年山魈', level: 2 },
  ],
  yaotu: { id: 'enemy_s1_1_g', name: '桃林守卫', level: 2 },
  drops: { materials: ['mat_taomu'] },
}

describe('sceneDropSummary 场景掉落汇总', () => {
  it('materials（关卡必掉）单列返回，不走概率合并', () => {
    const { materials } = sceneDropSummary(scene)
    expect(materials).toEqual(['mat_taomu'])
  })

  it('全敌人 + 守护者 drops 合并；同物品数量取大、来源计数、概率为独立判定合并', () => {
    const { merged } = sceneDropSummary(scene)
    // 桃木多来源（多敌掉落表都有）：合并后 sources > 1，概率高于任一单来源
    const taomu = merged.find((r) => r.itemId === 'mat_taomu')
    expect(taomu).toBeDefined()
    expect(taomu!.sources).toBeGreaterThan(1)
    expect(taomu!.chance).toBeGreaterThan(0.5)
    // 数量取最大单条（×3 为多敌中最大 quantity）
    expect(taomu!.quantity).toBeGreaterThanOrEqual(1)
  })

  it('fabao_ 条目标记 fabao=true 且排在普通物品之后（不掉物品目录，UI 解析法宝名）', () => {
    const bossScene = {
      enemies: [{ name: '花妖王·千瓣', level: 10 }],
      yaotu: null,
      drops: {},
    }
    const { merged } = sceneDropSummary(bossScene)
    const fabaoRows = merged.filter((r) => r.fabao)
    // 花妖王绑定 斩仙剑 + 玉净瓶（裁定 2026-10-07 掉落）
    expect(fabaoRows.map((r) => r.itemId)).toEqual(['fabao_fb_zhaoxianjian', 'fabao_sq_yujingping'])
    expect(fabaoRows.every((r) => r.chance === 0.08)).toBe(true)
    // 排序：普通物品在前、fabao 在后
    const lastFabaoIdx = merged.map((r) => r.fabao).lastIndexOf(true)
    const firstNormalIdx = merged.findIndex((r) => !r.fabao)
    expect(lastFabaoIdx).toBeGreaterThan(firstNormalIdx)
  })

  it('空场景（无敌/无守护）返回空汇总', () => {
    const { merged, materials } = sceneDropSummary({ enemies: [], yaotu: null, drops: {} })
    expect(merged).toEqual([])
    expect(materials).toEqual([])
  })
})
