/**
 * enemy-generate.ts — 敌人属性重算纯函数（封神榜「一键重算全部敌人属性」）
 *
 * 生成模型（唯一权威：《documents/需求文档/敌人生成设计.md》§3.8，与
 * scripts/generate-enemy-design.cjs 的 expectStats 同一实现，不采用
 * 完整项目说明.md §25 的「玩家同级×系数」口径）：
 *
 *   stats[attr] = round( Template[attr](level) × Coef[tier][attr] )
 *
 * - 血/攻/防/速模板曲线来自 configs/params/curves.json（数值中枢，改曲线后
 *   重跑 node scripts/generate-enemy-design.cjs 并同步下方 CoEF/次级模板常量）
 * - 次级维度：hit/dodge 吃品阶系数（差异 1.00~1.59），critRate/critDamage
 *   不吃（全体统一模板曲线）
 * - maxEnergy = 150 全体常量；energyInit = 25（终局 boss_final_liuer 特例 50，§3.7）
 * - 确定性计算，无随机数：同输入同输出
 *
 * 只产出 stats 十键；id/name/level/role/技能/掉落/奖励/剧情等字段由调用方
 * 原样保留（见 rebuildAllEnemies report，调用方按 id 覆盖写入）。
 */

import curvesJson from '@configs/params/curves.json'
import enemiesConfigJson from '@configs/enemies/enemies.json'

/**
 * 品阶档位：PRD 六档（role-grades 单一来源；yaobing 妖兵系数取小妖/妖徒几何中点插值推导，
 * PRD §3.6 仅给奖励倍率 1.1 未给属性系数）+ 特殊两档（按 id 识别，绕开 role 错标）
 */
export type EnemyTier = 'xiaoyao' | 'yaobing' | 'yaotu' | 'yaokui' | 'yaowang' | 'yaozun' | 'king' | 'final'

/** 档位系数矩阵（实数/模板 中位数，round2；来源 scripts/generate-enemy-design.cjs 拟合输出 = 设计文档 §4 表） */
export const ENEMY_TIER_COEF: Record<EnemyTier, EnemyCoefRow> = {
  xiaoyao: { maxHealth: 1.08, attack: 1.43, defense: 2.3, speed: 0.69, hit: 1.0, dodge: 1.0 },
  yaobing: { maxHealth: 1.23, attack: 1.63, defense: 2.65, speed: 0.77, hit: 1.0, dodge: 1.08 },
  yaotu: { maxHealth: 1.4, attack: 1.87, defense: 2.99, speed: 0.89, hit: 1.0, dodge: 1.19 },
  yaokui: { maxHealth: 1.94, attack: 2.58, defense: 4.13, speed: 1.21, hit: 1.03, dodge: 1.43 },
  yaowang: { maxHealth: 2.38, attack: 3.21, defense: 5.18, speed: 1.57, hit: 1.02, dodge: 1.59 },
  yaozun: { maxHealth: 2.71, attack: 3.67, defense: 5.64, speed: 1.71, hit: 1.02, dodge: 1.56 },
  king: { maxHealth: 3.04, attack: 4.12, defense: 6.31, speed: 1.9, hit: 1.01, dodge: 1.56 },
  final: { maxHealth: 9.54, attack: 1.69, defense: 1.9, speed: 0.48, hit: 1.01, dodge: 1.55 },
}

interface EnemyCoefRow {
  maxHealth: number
  attack: number
  defense: number
  speed: number
  hit: number
  dodge: number
}

/** 特殊档：id 前缀/全名匹配（boss_king_* 数值超 yaowang 档、终局独立登记） */
const SPECIAL_TIERS: Array<{ key: EnemyTier; match: (id: string) => boolean }> = [
  { key: 'king', match: (id) => id.startsWith('boss_king_') },
  { key: 'final', match: (id) => id === 'boss_final_liuer' },
]

/** 档位识别：特殊档按 id 优先，否则取 role 字段；非法 role 回退基准档 xiaoyao（重算偏保守方向） */
export function enemyTierOf(enemy: { id: string; role?: string }): EnemyTier {
  const special = SPECIAL_TIERS.find((t) => t.match(enemy.id))
  if (special) return special.key
  if (enemy.role && enemy.role in ENEMY_TIER_COEF) return enemy.role as EnemyTier
  return 'xiaoyao'
}

/** 四维模板曲线（线性求值器，与 generate-enemy-design.cjs 的 evalCurve 同款；未知类型抛错防静默算错） */
function evalCurve(spec: { type: string; base: number; perLevel: number }, level: number): number {
  if (spec.type !== 'linear') throw new Error(`[enemy-generate] 不支持的曲线类型: ${spec.type}`)
  return spec.base + spec.perLevel * (level - 1)
}

interface EnemyCurvesJson {
  enemy: {
    hp: { type: string; base: number; perLevel: number }
    atk: { type: string; base: number; perLevel: number }
    def: { type: string; base: number; perLevel: number }
    spd: { type: string; base: number; perLevel: number }
  }
}

const CURVES = curvesJson as EnemyCurvesJson

/** 次级维度模板曲线（小妖样本最小二乘拟合，6 位小数与脚本全精度逐值对拍一致；hit 恰为整数值） */
const SECONDARY = {
  hit: { a: 10, b: 2 },
  dodge: { a: 2.212679, b: 0.808794 },
  critRate: { a: 4.815582, b: 0.19936 },
  critDamage: { a: 120.153682, b: 0.500534 },
} as const

/** 模型输出十键的健壮性边界（对齐 configs/attributes/attributes.json 的 range；防坏配置出界） */
const SANITY_BOUNDS = {
  maxHealth: [1, 99999],
  attack: [1, 9999],
  defense: [0, 9999],
  speed: [1, 9999],
  hit: [0, 9999],
  dodge: [0, 9999],
  critRate: [0, 100],
  critDamage: [100, 500],
} as const

/** 重算后的 stats 形态：固定十键（实测全表 stats 恰为这十键，不含模型外键） */
export type EnemyStatValues = {
  maxHealth: number
  attack: number
  defense: number
  speed: number
  hit: number
  dodge: number
  critRate: number
  critDamage: number
  maxEnergy: number
  energyInit: number
}

/** 生成模型核心：等级 × 档位 → 期望 stats（round 与现状数据同为四舍五入） */
export function expectEnemyStats(tier: EnemyTier, level: number): EnemyStatValues {
  const c = ENEMY_TIER_COEF[tier]
  const L = Math.max(1, Math.round(Number(level) || 1))
  const sec = (s: { a: number; b: number }) => s.a + s.b * (L - 1)
  const bounded = (key: keyof typeof SANITY_BOUNDS, v: number) => {
    const [min, max] = SANITY_BOUNDS[key]
    return Math.min(max, Math.max(min, v))
  }
  const stats: EnemyStatValues = {
    maxHealth: Math.round(evalCurve(CURVES.enemy.hp, L) * c.maxHealth),
    attack: Math.round(evalCurve(CURVES.enemy.atk, L) * c.attack),
    defense: Math.round(evalCurve(CURVES.enemy.def, L) * c.defense),
    speed: Math.round(evalCurve(CURVES.enemy.spd, L) * c.speed),
    hit: Math.round(sec(SECONDARY.hit) * c.hit),
    dodge: Math.round(sec(SECONDARY.dodge) * c.dodge),
    critRate: Math.round(sec(SECONDARY.critRate)),
    critDamage: Math.round(sec(SECONDARY.critDamage)),
    maxEnergy: 150,
    energyInit: tier === 'final' ? 50 : 25,
  }
  for (const key of Object.keys(SANITY_BOUNDS) as Array<keyof typeof SANITY_BOUNDS>) {
    stats[key] = bounded(key, stats[key])
  }
  return stats
}

/** 重算单只敌人的 stats（不 mutate 入参；其他字段调用方原样保留） */
export function rebuildEnemyStats(enemy: { id: string; level: number; role?: string }): {
  tier: EnemyTier
  stats: EnemyStatValues
} {
  const tier = enemyTierOf(enemy)
  return { tier, stats: expectEnemyStats(tier, enemy.level) }
}

/** 重算条目：before/after 供 diff 摘要展示；before 键缺失（undefined）如实呈现 */
export interface EnemyStatsRebuildEntry {
  id: string
  name: string
  level: number
  tier: EnemyTier
  before: Partial<EnemyStatValues>
  after: EnemyStatValues
  changed: boolean
}

export interface EnemyStatsRebuildReport {
  entries: EnemyStatsRebuildEntry[]
  total: number
  /** stats 实际发生变化（或能量特例修正）的敌人数 */
  changedCount: number
  /** role 缺失/非法且非特殊档的记录数：不属生成模型管辖（§3.8 assert），已跳过不写 */
  skippedCount: number
  /** 跳过/回退等边界登记（不阻断全量重算） */
  warnings: string[]
}

/** IDB 行的宽松形态（enemies 表原样 JSON 口径：skillIds/drops[].chance×quantity，本模块只碰 stats） */
export type EnemyStatsRow = {
  id: string
  name?: string
  level?: number
  role?: string
  stats?: Record<string, number | undefined>
}

/** 沙盒/测试/场景 BOSS 实体冻结：yaotu_* 五行护法是 TTK 断言（A5）的我方基准与 ACTORS 派生源，
 *  test_* 是战斗机制测试靶子（数值与测试断言绑定），
 *  boss_major_*（五大场景 BOSS）与 boss_0NN（章节守护者，唤灵台/预设实体）数值均为手调设计值——
 *  重算产物只回写 enemies.json，覆盖它们会造成 IDB 与 configs 权威漂移。一律跳过 */
export const FROZEN_IDS = (id: string) =>
  id.startsWith('yaotu_') || id.startsWith('test_') || id.startsWith('boss_major_') || /^boss_0\d+$/.test(id)

/** 全量重算：逐只产出 before/after，纯函数不写库（写回由调用方走 FengshenDataService）。
 *  role 缺失/非法且非特殊档的记录**跳过**（生成模型先决条件 §3.8 assert role ∈ 五档；
 *  这些记录多为旧 id 体系残留，按基准档强算属越权覆盖）；
 *  yaotu_* / test_* 沙盒与测试实体冻结跳过（数值不归生成模型管辖） */
export function rebuildAllEnemies(rows: EnemyStatsRow[]): EnemyStatsRebuildReport {
  const entries: EnemyStatsRebuildEntry[] = []
  const warnings: string[] = []
  let changedCount = 0
  let skippedCount = 0
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id) {
      warnings.push(`跳过缺少 id 的记录：${JSON.stringify(row).slice(0, 60)}`)
      skippedCount++
      continue
    }
    if (FROZEN_IDS(row.id)) {
      warnings.push(`${row.id}（${row.name ?? '无名'}）为沙盒/测试/场景 BOSS 实体，数值冻结，已跳过重算`)
      skippedCount++
      continue
    }
    const roleValid = !!row.role && row.role in ENEMY_TIER_COEF
    const isSpecial = SPECIAL_TIERS.some((t) => t.match(row.id))
    if (!roleValid && !isSpecial) {
      warnings.push(`${row.id}（${row.name ?? '无名'}）role「${row.role ?? '空'}」不在系数表，已跳过重算（非生成模型管辖）`)
      skippedCount++
      continue
    }
    const tier = enemyTierOf(row)
    const level = Math.max(1, Math.round(Number(row.level) || 1))
    if (!Number.isFinite(Number(row.level)) || Number(row.level) < 1) {
      warnings.push(`${row.id}（${row.name ?? '无名'}）level「${row.level}」非法，按 L1 重算`)
    }
    const after = expectEnemyStats(tier, level)
    const before: Partial<EnemyStatValues> = {}
    let changed = false
    for (const key of Object.keys(after) as Array<keyof EnemyStatValues>) {
      const prev = row.stats?.[key]
      // before 如实保留（含 undefined——stats 缺键也算变更，避免漏补）
      before[key] = prev
      if (prev !== after[key]) changed = true
    }
    if (changed) changedCount++
    entries.push({ id: row.id, name: row.name ?? row.id, level, tier, before, after, changed })
  }
  return { entries, total: entries.length, changedCount, skippedCount, warnings }
}

/**
 * 导出规范化：剥离存储层注入的 updatedAt 并按 id 稳定排序，产物可直接替换
 * configs/enemies/enemies.json（仿 toExportableEquipment；configs 是纯静态定义）。
 */
export function toExportableEnemies(rows: EnemyStatsRow[]): Array<Record<string, unknown>> {
  const strip = (row: EnemyStatsRow): Record<string, unknown> => {
    const clone = { ...row } as Record<string, unknown>
    delete clone.updatedAt
    return clone
  }
  return [...rows].sort((a, b) => a.id.localeCompare(b.id)).map(strip)
}

// ---------------------------------------------------------------------------
// 体系审计：运行时表 vs configs 权威集合（导出防御的基线）
// ---------------------------------------------------------------------------

/** configs 权威敌人 id 集合（导出基线：区分权威记录与历史残留/沙盒新增）。
 *  全部敌人（含五大场景 BOSS / 沙盒 / 测试条目）已收敛至 enemies.json 单一权威。 */
export const CONFIG_ENEMY_IDS: ReadonlySet<string> = new Set(
  (enemiesConfigJson as Array<{ id: string }>).map((e) => e.id),
)

export interface EnemyStoreAudit {
  /** 库中存在而 configs 权威没有的 id（旧体系残留或沙盒新增——覆盖 configs 前必须确认） */
  extraIds: string[]
  /** configs 权威存在而库中缺失的 id（此时导出不是完整配置，直接覆盖会丢敌人） */
  missingIds: string[]
}

/** 审计运行时 enemies 表与 configs 权威集合的差异（导出前调用，防污染权威配置） */
export function auditEnemyStore(rows: EnemyStatsRow[]): EnemyStoreAudit {
  const storeIds = new Set(rows.map((r) => r.id))
  const extraIds: string[] = []
  for (const row of rows) {
    if (!CONFIG_ENEMY_IDS.has(row.id)) extraIds.push(row.id)
  }
  const missingIds = [...CONFIG_ENEMY_IDS].filter((id) => !storeIds.has(id))
  return { extraIds, missingIds }
}
