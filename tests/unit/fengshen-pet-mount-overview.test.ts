/**
 * 封神榜 · 宠物与坐骑总览数值推算测试（8.16 口径：个体驱动 + 品质门槛）
 *
 * 覆盖（需求《宠物与坐骑总览需求》重写版 §九验收）：
 * - §5.1 算例：紫电骅 Lv.10 仙品 资质400 未突破 → 攻击 [36, 88]（品阶×浮动双外包络口径）
 * - 公式通路：主要 3 条 source = formula，推导含 单位基数/个体权重/资质×突破
 * - 养成倍率：资质 500 → 1.25；突破 3 次 → 1.6；两者可叠加
 * - 品质门槛：品质 1 只有 L1；品质 5 全生效；activeSlotCount 随品质实算
 * - 附加行曲线通路：外包络、1 位小数（§5.2 算例沿用）
 * - 曲线闭合校验（发现 A 自动化）：14 行全过；改坏 full 逐行报
 * - 缺口显式化：未知品阶、pet_mount_rules 缺失、权重和不对 —— 绝不静默为 0
 * - 坐骑侧：DEF 行名 + 防/闪/血主要 3 条
 * - 装备侧不回归
 *
 * 运行: npx vitest run tests/unit/fengshen-pet-mount-overview.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { AffixRuleConfig, EquipFormulaConfig, PetMountIndividual } from '@/domain/fengshen/types'
import { mountIndividuals, petIndividuals } from '@/domain/fengshen/affix-rule-defaults'
import {
  buildPetMountOverview,
  curveClosureWarnings,
  pickPetMountTrait,
  resolveAttrRange,
  resolveCurveAttrRange,
} from '@/domain/fengshen/equipment-overview'

/** 按 store 分桶的内存版持久化存储（与 fengshen-equipment-overview.test.ts 同构） */
class MemoryStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private buckets = new Map<string, Map<string, unknown>>()

  private bucket(store: string): Map<string, unknown> {
    let b = this.buckets.get(store)
    if (!b) { b = new Map(); this.buckets.set(store, b) }
    return b
  }

  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    this.bucket(store).set(key, value)
    return true
  }
  async get<T>(store: StorageStoreName, key: string): Promise<T | null> {
    return (this.bucket(store).get(key) as T | undefined) ?? null
  }
  async remove(store: StorageStoreName, key: string): Promise<boolean> {
    return this.bucket(store).delete(key)
  }
  async keys(store: StorageStoreName): Promise<string[]> {
    return Array.from(this.bucket(store).keys())
  }
  async clear(store: StorageStoreName): Promise<boolean> {
    this.bucket(store).clear()
    return true
  }
  async keysByField(): Promise<string[]> {
    return []
  }
  async getStats(): Promise<StorageStats | null> {
    return null
  }
}

let cfg: AffixRuleConfig
let formula: EquipFormulaConfig
const conv: Record<string, number> = { maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2 }

beforeAll(async () => {
  const storage = new MemoryStorage()
  await seedFengshenData(storage)
  const api = new GameDataApi(storage)
  cfg = (await api.getAffixRule())!
  formula = (await api.getEquipFormula())!
})

/** 反推一只个体（缺省紫电骅 Lv.10 仙品 品质 5 资质 400 未突破） */
function overview(individual: PetMountIndividual | undefined, patch: Partial<Parameters<typeof buildPetMountOverview>[2]> = {}) {
  if (!individual) throw new Error('个体不存在：先检查 configs/pets|mounts')
  return buildPetMountOverview(cfg, conv, {
    system: 'pet',
    individual,
    level: 10,
    tier: 'xian',
    quality: 5,
    ...patch,
  })
}

const purple = () => petIndividuals().find((i) => i.id === 'pet_01')
const firstMount = () => mountIndividuals()[0]

describe('§5.1 算例（主要 3 条 = 六维公式）', () => {
  it('紫电骅 Lv.10 仙品 资质400 未突破：攻击 [36, 88]', () => {
    // 单位基数 = 900 ÷ 2 系统 ÷ 9 权重 ÷ 50 级 = 1；攻击 = 1 × 10 × 4(权重) × 2(转化) = 80
    // 外包络 [80 × 0.9(仙品min) × 0.5(浮动min), 80 × 1.0(仙品max) × 1.1(浮动max)] = [36, 88]
    const o = overview(purple())
    const atk = o.mainSlots.find((s) => s.attribute === 'attack')!
    expect(atk.range).toMatchObject({ source: 'formula', min: 36, max: 88 })
  })

  it('推导逐步对齐：通路、单位基数、个体权重、养成倍率', () => {
    const o = overview(purple())
    const atk = o.mainSlots.find((s) => s.attribute === 'attack')!
    const byLabel = (label: string) => atk.range.calc.find((s) => s.label === label)
    expect(byLabel('通路')?.expr).toBe('宠物坐骑公式（基础六维）')
    expect(byLabel('单位基数')?.expr).toContain('900 ÷ 2 系统 ÷ 9 权重 ÷ 50 级')
    expect(byLabel('属性权重')?.expr).toBe('4 = 个体权重')
    expect(byLabel('等级')?.expr).toContain('Lv.10')
    // 资质 400÷400=1.0，未突破 1.0 → 倍率仍显示（显式化原则），来源写在 expr
    expect(byLabel('词条系数')?.expr).toContain('资质 400')
  })

  it('权重来自个体：紫电骅 攻4/命2/速1，三条齐全', () => {
    const o = overview(purple())
    expect(o.mainSlots.map((s) => s.weight)).toEqual([4, 2, 1])
    expect(o.mainSlots.map((s) => s.attribute)).toEqual(['attack', 'hitValue', 'speed'])
  })

  it('资质 500（1.25 倍）：攻击基准 100 → [45, 110]', () => {
    const o = overview(purple(), { aptitude: 500 })
    const atk = o.mainSlots.find((s) => s.attribute === 'attack')!
    expect(atk.range).toMatchObject({ min: 45, max: 110 })
  })

  it('突破 3 次（1.6 倍）：攻击基准 128 → [58, 141]', () => {
    const o = overview(purple(), { breakthrough: 3 })
    const atk = o.mainSlots.find((s) => s.attribute === 'attack')!
    expect(o.growthRatio).toBeCloseTo(1.6)
    expect(atk.range).toMatchObject({ min: 58, max: 141 })
  })

  it('坐骑侧：主要 3 条 = 防/闪/血，行名带 DEF 前缀', () => {
    const o = overview(firstMount(), { system: 'mount' })
    expect(o.mainSlots.map((s) => s.attribute)).toEqual(['defense', 'dodgeValue', 'maxHealth'])
    const names = o.rows.map((r) => r.name)
    expect(names).toContain('DEF-L1')
    expect(names).toContain('L4-通用')
  })
})

describe('品质门槛（2026-09-06 裁定表）', () => {
  it('品质 1：只有 L1 生效，特性/ALL 未投放且不给区间，词条 4 条', () => {
    const o = overview(purple(), { quality: 1 })
    const byId = Object.fromEntries(o.rows.map((r) => [r.id, r]))
    expect(byId['l1']!.included).toBe(true)
    expect(byId['l1']!.candidates.length).toBeGreaterThan(0)
    for (const id of ['trait', 'side_all', 'l3c', 'l3', 'all']) {
      expect(byId[id]!.included, `${id} 品质 1 不应投放`).toBe(false)
      expect(byId[id]!.candidates).toHaveLength(0)
    }
    expect(o.activeSlotCount).toBe(4)
  })

  it('品质 5：全部行生效，词条 9 条（3 主要 + 特性 + ALL + 4 附加）', () => {
    const o = overview(purple(), { quality: 5 })
    expect(o.rows.every((r) => r.included)).toBe(true)
    expect(o.activeSlotCount).toBe(9)
  })

  it('品质 3：特性生效、ALL 不生效，词条 7 条（3 主要 + 特性 + L1/L3通用/L3）', () => {
    const o = overview(purple(), { quality: 3 })
    const byId = Object.fromEntries(o.rows.map((r) => [r.id, r]))
    expect(byId['trait']!.included).toBe(true)
    expect(byId['side_all']!.included).toBe(false)
    expect(o.activeSlotCount).toBe(7)
  })
})

describe('附加行 = pet_mount 曲线（§5.2）', () => {
  it('L1 行候选走曲线通路，基础速度 Lv.50 仙品 = 6.2 ~ 32.7（ATK-L1 池：攻/命/速基础值）', () => {
    const o = overview(purple(), { level: 50 })
    const l1 = o.rows.find((r) => r.id === 'l1')!
    expect(l1.candidates.length).toBeGreaterThan(0)
    for (const c of l1.candidates) expect(c.source, `${c.attribute} 应为曲线`).toBe('curve')
    const speed = l1.candidates.find((c) => c.attribute === 'speed')!
    // min: 6 + 0.16×49 = 13.84 ×0.9×0.5 = 6.228 → 6.2；max: 15 + 0.3×49 = 29.7 ×1.1 = 32.67 → 32.7
    expect(speed).toMatchObject({ min: 6.2, max: 32.7 })
  })

  it('1 位小数舍入：Lv.1 低等级值不被取整抹平', () => {
    const r = resolveCurveAttrRange(cfg, 'pet_mount', formula, conv, 'speedBonus', 1, 'xian', 0)
    expect(r.min).toBe(2.7)
    expect(r.max).toBe(16.5)
  })
})

describe('曲线闭合校验（发现 A 的自动化）', () => {
  it('当前 pet_mount 全 14 行按 maxLevel=50 闭合，无告警', () => {
    expect(curveClosureWarnings(cfg, 'pet_mount', 50)).toEqual([])
  })

  it('人为改坏 full 后逐行报不闭合，并带算式', () => {
    const patched: AffixRuleConfig = structuredClone(cfg)
    patched.affix_value_curve.pet_mount[0].min.full += 1
    const warnings = curveClosureWarnings(patched, 'pet_mount', 50)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('第 1 行 min 不闭合')
    expect(warnings[0]).toContain('≠ 满级')
  })

  it('池映射已拍板（2026-09-06）：无草案提示，仅保留闭合校验 warning', () => {
    const o = overview(purple())
    expect(o.warnings.some((w) => w.includes('映射为草案'))).toBe(false)
    expect(o.warnings.some((w) => w.includes('L1→ATK-L2'))).toBe(false)
  })

  it('附加 L1 行池 = ATK-L1/DEF-L1（行名与属性组码同源，原 L2 草案作废）', () => {
    const l1 = cfg.pet_mount_rules?.rows.find((r) => r.id === 'l1')
    expect(l1?.pool?.ATK).toEqual(['ATK-L1'])
    expect(l1?.pool?.DEF).toEqual(['DEF-L1'])
  })
})

describe('缺口显式化（绝不静默为 0）', () => {
  it('未知品阶 → warnings，不出现 NaN', () => {
    const o = overview(purple(), { tier: 'nope' })
    expect(o.warnings.some((w) => w.includes('nope'))).toBe(true)
    for (const s of o.mainSlots) {
      expect(Number.isFinite(s.range.min)).toBe(true)
      expect(Number.isFinite(s.range.max)).toBe(true)
    }
  })

  it('pet_mount_rules 缺失 → 显式告警，不抛异常', () => {
    const patched: AffixRuleConfig = structuredClone(cfg)
    delete patched.pet_mount_rules
    const o = buildPetMountOverview(patched, conv, { system: 'pet', individual: purple()!, level: 10, tier: 'xian', quality: 5 })
    expect(o.warnings.some((w) => w.includes('pet_mount_rules 未配置'))).toBe(true)
    expect(o.mainSlots).toHaveLength(0)
    expect(o.rows).toHaveLength(0)
  })

  it('个体权重和 ≠ 7 → warnings', () => {
    const bad: PetMountIndividual = { ...purple()!, weights: { attack: 3, hit: 2, speed: 1 } }
    const o = overview(bad)
    expect(o.warnings.some((w) => w.includes('权重和 6 ≠'))).toBe(true)
  })

  it('configs 全部个体权重和 = 7（数据健全性）', () => {
    for (const i of [...petIndividuals(), ...mountIndividuals()]) {
      const sum = Object.values(i.weights).reduce((s, w) => s + w, 0)
      expect(sum, `${i.name} 权重和`).toBe(7)
    }
  })
})

describe('特性随机获取（2026-09-06 口径变更：固定 trait → 流派特性池随机）', () => {
  const rules = () => cfg.pet_mount_rules!

  it('连击流个体走池：宠物取 attack 组、坐骑取 defense 组，抽到的条目在池内', () => {
    const petTrait = pickPetMountTrait(rules(), 'pet', 'combo')
    expect(petTrait).not.toBeNull()
    expect(rules().trait_pools!.combo!.attack).toContainEqual(petTrait)
    const mountTrait = pickPetMountTrait(rules(), 'mount', 'combo')
    expect(mountTrait).not.toBeNull()
    expect(rules().trait_pools!.combo!.defense).toContainEqual(mountTrait)
  })

  it('rng 注入确定性：rng=0 取第 1 条，rng≈1 取最后一条（不越界）', () => {
    const attack = rules().trait_pools!.combo!.attack
    expect(pickPetMountTrait(rules(), 'pet', 'combo', () => 0)).toEqual(attack[0])
    expect(pickPetMountTrait(rules(), 'pet', 'combo', () => 0.9999)).toEqual(attack[attack.length - 1])
  })

  it('未池化流派回落固定 trait：pickPetMountTrait 返回 null，个体 trait 文本保留', () => {
    const crit = petIndividuals().find((i) => i.category === 'crit')!
    expect(pickPetMountTrait(rules(), 'pet', crit.category)).toBeNull()
    expect(crit.trait).toBeTruthy()
  })

  it('连击流池各 10 条，条目 name/desc 非空（数据健全性）', () => {
    const pool = rules().trait_pools!.combo!
    expect(pool.attack).toHaveLength(10)
    expect(pool.defense).toHaveLength(10)
    for (const e of [...pool.attack, ...pool.defense]) {
      expect(e.name.trim()).toBeTruthy()
      expect(e.desc.trim()).toBeTruthy()
    }
  })

  it('configs 全部 combo 个体已删除固定 trait（池化完整性，防双口径漂移）', () => {
    for (const i of [...petIndividuals(), ...mountIndividuals()].filter((x) => x.category === 'combo')) {
      expect(i.trait, `${i.name} 不应再带固定 trait`).toBeUndefined()
    }
  })

  it('多轮随机抽取不越界且始终落在池内', () => {
    const attack = rules().trait_pools!.combo!.attack
    for (let k = 0; k < 200; k++) {
      const t = pickPetMountTrait(rules(), 'pet', 'combo')
      expect(attack).toContainEqual(t)
    }
  })
})

describe('装备侧不回归', () => {
  it('同一基础六维属性：装备侧走装备公式；宠物侧附加 L1 行走曲线（2026-09-06 拍板，六维基础值入附加曲线）', () => {
    const equipSide = resolveAttrRange(cfg, formula, conv, 'attack', 50, 'xian', 1)
    const petCurveSide = resolveCurveAttrRange(cfg, 'pet_mount', formula, conv, 'attack', 50, 'xian', 0)
    expect(equipSide.source).toBe('formula')
    // 原「发现 C」守卫（宠物侧曲线无六维行）随附加 L1 行池 = ATK-L1 拍板作废：基础值走第 1 行曲线
    expect(petCurveSide.source).toBe('curve')
  })

  it('装备侧曲线属性的行号仍取 equipment 表（critRate = 第 4 行）', () => {
    const r = resolveAttrRange(cfg, formula, conv, 'critRate', 10, 'xian', 1)
    expect(r.calc.find((s) => s.label === '曲线行')?.expr).toContain('第 4 行')
  })
})
