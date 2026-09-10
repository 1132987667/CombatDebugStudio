/**
 * 封神榜 · 一键重算全部敌人属性测试
 *
 * 覆盖（敌人生成设计.md §3.8 生成模型）：
 * - 期望值：用 configs/enemies/enemies.json 真实条目（id/level/role）断言手工算出的期望 stats，
 *   覆盖全部档位（五普通档 + 王级/终局特殊档）
 * - 档位识别：特殊档按 id 优先于 role 字段；非法/无系数 role 回退基准档并登记 warning
 * - 边界：缺 level/缺 id、小数 level、入参不被 mutate（纯函数）
 * - 导出规范化：剥 updatedAt + id 排序（产物可直接替换 configs/enemies/enemies.json）
 *
 * 运行: npx vitest run tests/unit/fengshen-enemy-generate.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  auditEnemyStore,
  enemyTierOf,
  expectEnemyStats,
  rebuildEnemyStats,
  rebuildAllEnemies,
  toExportableEnemies,
} from '@/domain/fengshen/enemy-generate'
import enemiesJson from '@configs/enemies/enemies.json'

const realEnemies = enemiesJson as Array<Record<string, unknown>>

/** 从真实配置取一条敌人的输入形态（id/level/role） */
function realInput(id: string): { id: string; level: number; role?: string } {
  const row = realEnemies.find((e) => e.id === id)
  if (!row) throw new Error(`enemies.json 缺少测试样本 ${id}`)
  return { id: String(row.id), level: Number(row.level), role: row.role as string | undefined }
}

describe('expectEnemyStats：模型期望值（手工算样例 + 脚本对拍值）', () => {
  it('L1 小妖：round(模板×小妖系数)', () => {
    // hp=round(80×1.08)=86 atk=round(10×1.43)=14 def=round(1×2.3)=2 spd=round(10×0.69)=7
    // hit=round(10×1.0)=10 dodge=round(2.212679×1.0)=2 critRate=round(4.815582)=5 critDamage=round(120.153682)=120
    expect(expectEnemyStats('xiaoyao', 1)).toEqual({
      maxHealth: 86, attack: 14, defense: 2, speed: 7,
      hit: 10, dodge: 2, critRate: 5, critDamage: 120,
      maxEnergy: 150, energyInit: 25,
    })
  })

  it('L65 王级（boss_king_* 档）', () => {
    // hp=round((80+11×64)×3.04)=round(784×3.04)=2383 atk=round((10+2×64)×4.12)=round(138×4.12)=569
    // def=round((1+0.9×64)×6.31)=round(58.6×6.31)=370 spd=round((10+1.2×64)×1.9)=round(86.8×1.9)=165
    expect(expectEnemyStats('king', 65)).toEqual({
      maxHealth: 2383, attack: 569, defense: 370, speed: 165,
      hit: 139, dodge: 84, critRate: 18, critDamage: 152,
      maxEnergy: 150, energyInit: 25,
    })
  })

  it('L70 终局：energyInit 特例 50，超肉低速（与现状 8000/250/120/45 同量级）', () => {
    const s = expectEnemyStats('final', 70)
    expect(s.maxHealth).toBe(8004)
    expect(s.attack).toBe(250)
    expect(s.defense).toBe(120)
    expect(s.speed).toBe(45)
    expect(s.energyInit).toBe(50)
    expect(s.maxEnergy).toBe(150)
  })

  it('L2 妖徒（防御特化档）', () => {
    // hp=round((80+11)×1.4)=127 atk=round(12×1.87)=22 def=round(1.9×2.99)=6 spd=round(11.2×0.89)=10
    const s = expectEnemyStats('yaotu', 2)
    expect([s.maxHealth, s.attack, s.defense, s.speed]).toEqual([127, 22, 6, 10])
  })

  it('全部 7 档 × L1~70 输出恒在健壮性边界内且逐级单调不减', () => {
    const tiers = ['xiaoyao', 'yaotu', 'yaokui', 'yaowang', 'yaozun', 'king', 'final'] as const
    for (const tier of tiers) {
      for (let L = 1; L <= 70; L++) {
        const s = expectEnemyStats(tier, L)
        expect(s.maxHealth).toBeGreaterThanOrEqual(1)
        expect(s.maxHealth).toBeLessThanOrEqual(99999)
        expect(s.critRate).toBeGreaterThanOrEqual(0)
        expect(s.critRate).toBeLessThanOrEqual(100)
        expect(s.critDamage).toBeGreaterThanOrEqual(100)
        expect(s.critDamage).toBeLessThanOrEqual(500)
        if (L > 1) {
          const prev = expectEnemyStats(tier, L - 1)
          expect(s.maxHealth).toBeGreaterThanOrEqual(prev.maxHealth)
          expect(s.attack).toBeGreaterThanOrEqual(prev.attack)
          expect(s.defense).toBeGreaterThanOrEqual(prev.defense)
          expect(s.speed).toBeGreaterThanOrEqual(prev.speed)
        }
      }
    }
  })
})

describe('enemyTierOf：档位识别', () => {
  it('特殊档按 id 优先，绕开 role 字段错标', () => {
    expect(enemyTierOf({ id: 'boss_king_niumo', role: 'yaowang' })).toBe('king')
    expect(enemyTierOf({ id: 'boss_king_x', role: 'xiaoyao' })).toBe('king')
    expect(enemyTierOf({ id: 'boss_final_liuer', role: 'yaozun' })).toBe('final')
  })

  it('普通档取 role 字段；无系数的 role（yaobing/未知/缺失）回退基准档 xiaoyao', () => {
    expect(enemyTierOf({ id: 'enemy_s1_1_a', role: 'yaokui' })).toBe('yaokui')
    expect(enemyTierOf({ id: 'enemy_x', role: 'yaobing' })).toBe('xiaoyao')
    expect(enemyTierOf({ id: 'enemy_x', role: 'whatever' })).toBe('xiaoyao')
    expect(enemyTierOf({ id: 'enemy_x' })).toBe('xiaoyao')
  })
})

describe('rebuildEnemyStats / rebuildAllEnemies：真实配置条目重算', () => {
  it('真实条目（各档位抽样）重算结果 = 同档位同等级的模型期望', () => {
    for (const id of ['enemy_s1_1_a', 'boss_minor_taoyao', 'boss_king_niumo', 'boss_final_liuer']) {
      const input = realInput(id)
      const { tier, stats } = rebuildEnemyStats(input)
      expect(stats).toEqual(expectEnemyStats(tier, input.level))
    }
  })

  it('全量 124 条：全部可重算、输出十键、无跳过无 warning（现状 role 全部合法）', () => {
    const report = rebuildAllEnemies(realEnemies as never)
    expect(report.total).toBe(124)
    expect(report.entries.length).toBe(124)
    expect(report.skippedCount).toBe(0)
    expect(report.warnings).toEqual([])
    const TEN_KEYS = ['maxHealth', 'attack', 'defense', 'speed', 'hit', 'dodge', 'critRate', 'critDamage', 'maxEnergy', 'energyInit']
    for (const entry of report.entries) {
      expect(Object.keys(entry.after).sort()).toEqual([...TEN_KEYS].sort())
      expect(entry.after.energyInit).toBe(entry.tier === 'final' ? 50 : 25)
    }
    expect(report.entries.find((e) => e.id === 'boss_final_liuer')?.after.energyInit).toBe(50)
  })

  it('role 缺失/非法且非特殊档的记录被跳过（非生成模型管辖，不产出写入条目）', () => {
    const report = rebuildAllEnemies([
      { id: 'boss_001', name: '旧残留', stats: { maxHealth: 160 } }, // 无 role
      { id: 'enemy_x', role: 'boss', stats: {} }, // role 非法
      { id: 'yaotu_fire', stats: { maxHealth: 350 } }, // 我方护法旧残留，无 role
    ])
    expect(report.total).toBe(0)
    expect(report.skippedCount).toBe(3)
    expect(report.warnings.length).toBe(3)
  })

  it('特殊档（boss_king_* / boss_final_liuer）role 缺失仍参与重算（按 id 识别豁免）', () => {
    const report = rebuildAllEnemies([
      { id: 'boss_king_x', level: 65, stats: {} },
      { id: 'boss_final_liuer', level: 70, role: 'yaozun', stats: {} },
    ])
    expect(report.skippedCount).toBe(0)
    expect(report.entries[0].tier).toBe('king')
    expect(report.entries[1].after.energyInit).toBe(50)
  })

  it('边界：缺 id 跳过；缺/非法 level 按 L1 并登记 warning；小数 level 圆整', () => {
    const report = rebuildAllEnemies([
      { id: '', level: 5, role: 'yaotu', stats: {} },
      { id: 'enemy_bad_level', role: 'xiaoyao' },
      { id: 'enemy_frac_level', level: 9.6, role: 'xiaoyao' },
    ])
    expect(report.total).toBe(2)
    expect(report.skippedCount).toBe(1)
    expect(report.warnings.length).toBe(2)
    expect(report.entries[0].level).toBe(1)
    expect(report.entries[0].after.maxHealth).toBe(86)
    expect(report.entries[1].level).toBe(10)
  })

  it('stats 缺键视为变更（before 如实为 undefined），避免漏补键', () => {
    const exact = expectEnemyStats('xiaoyao', 1)
    const partial = { ...exact } as Record<string, number>
    delete partial.critDamage
    const report = rebuildAllEnemies([{ id: 'enemy_partial', level: 1, role: 'xiaoyao', stats: partial }])
    expect(report.entries[0].changed).toBe(true)
    expect(report.entries[0].before.critDamage).toBeUndefined()
    expect(report.entries[0].after.critDamage).toBe(120)
  })

  it('纯函数：不 mutate 入参行', () => {
    const row = { id: 'enemy_m', level: 3, role: 'yaotu', stats: { maxHealth: 1, attack: 1 } }
    rebuildEnemyStats(row)
    expect(row.stats).toEqual({ maxHealth: 1, attack: 1 })
  })

  it('changed 标记：与模型一致的行 changed=false', () => {
    const exact = expectEnemyStats('xiaoyao', 1)
    const report = rebuildAllEnemies([{ id: 'enemy_same', level: 1, role: 'xiaoyao', stats: { ...exact } }])
    expect(report.entries[0].changed).toBe(false)
    expect(report.changedCount).toBe(0)
  })
})

describe('auditEnemyStore：运行时表 vs configs 权威集合（导出防御基线）', () => {
  it('识别库中的权威外记录与缺失记录', () => {
    const audit = auditEnemyStore([
      { id: 'enemy_s1_1_a' }, // 权威存在
      { id: 'boss_001' }, // 权威外（历史残留）
      { id: 'enemy_custom_1' }, // 权威外（沙盒新增）
    ])
    expect(audit.extraIds.sort()).toEqual(['boss_001', 'enemy_custom_1'].sort())
    // configs 权威 124 条，库中只放了 1 条 → 其余 123 条全为缺失
    expect(audit.missingIds.length).toBe(123)
    expect(audit.missingIds).not.toContain('enemy_s1_1_a')
  })

  it('与 configs 权威完全一致时差异为空（正常导出路径）', () => {
    const audit = auditEnemyStore(realEnemies as never)
    expect(audit.extraIds).toEqual([])
    expect(audit.missingIds).toEqual([])
  })
})

describe('toExportableEnemies：导出规范化', () => {
  it('剥离 updatedAt 并按 id 稳定排序，其余字段原样保留', () => {
    const rows = [
      { id: 'enemy_b', name: '乙', stats: { maxHealth: 1 }, updatedAt: '2026-01-01T00:00:00.000Z', drops: [{ itemId: 'x' }] },
      { id: 'enemy_a', name: '甲', stats: { maxHealth: 2 }, updatedAt: '2026-01-02T00:00:00.000Z' },
    ]
    const out = toExportableEnemies(rows as never)
    expect(out.map((r) => r.id)).toEqual(['enemy_a', 'enemy_b'])
    expect(out[0]).not.toHaveProperty('updatedAt')
    expect(out[1]).not.toHaveProperty('updatedAt')
    expect(out[1]).toMatchObject({ name: '乙', stats: { maxHealth: 1 }, drops: [{ itemId: 'x' }] })
  })
})
