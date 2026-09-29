/**
 * statFilter.ts — 属性（词条）多条件筛选 + 多键排序共用纯函数
 *
 * 刷装场景的痛点：装备/灵宠/法宝的价值几乎全在属性行上，而列表只能按部位/品质粗筛，
 * 玩家只能一件件悬浮查看。本模块把「实体 → 属性行 → 条件求值 / 多键排序」抽成纯函数，
 * 供装备池、行囊背包、法宝、坐骑、宠物各列表共用，避免每个面板各长一套筛选逻辑。
 *
 * 口径约定（防跨层漂移）：
 * - 属性键 = attribute + 口径（flat 固定值 / pct 百分比），同键多行在 makeStatTarget 内求和坍缩；
 * - 显示名统一走 attrShortName（属性字典单一来源），percent 追加 `%` 后缀；
 * - 数值缺失的实体在按属性排序时恒排最后（不因升序把「没有该词条」的装备顶到最前）。
 */

import { attrShortName } from '@/domain/fengshen/equipment-overview'
import { compareAttributeDisplayOrder } from '@/domain/fengshen/attribute-dictionary'

/** 属性口径：flat 固定值 / pct 百分比 */
export type StatFlavor = 'flat' | 'pct'

/** 一条属性（已按「属性码 + 口径」坍缩，value = 同键求和） */
export interface StatRow {
  attribute: string
  flavor: StatFlavor
  value: number
}

/** 可筛选/可排序的实体视图（装备实例、灵宠个体、法宝实例的统一投影） */
export interface StatTarget {
  /** 唯一键（装备 = instanceId / 灵宠 = uid / 法宝 = defId） */
  id: string
  /** 展示名（排序键 kind:'name' 用） */
  name: string
  /** 品质 1-5（排序键 kind:'quality' 用；无品质概念传 0） */
  quality: number
  /** 属性行（已坍缩） */
  stats: StatRow[]
}

/** 各面板喂入的原始属性条目（未坍缩；modifierType 用领域口径，'percent' 归一为 pct） */
export interface RawStatRow {
  attribute: string
  modifierType: 'flat' | 'percent'
  value: number
}

/** 筛选运算符：has 只判存在（带这条词条即可）；gte/lte 比数值（缺该属性视为不满足） */
export type StatOp = 'has' | 'gte' | 'lte'

/** 筛选条件（多条之间为 AND：刷装要的是「暴击高 且 带连击」，OR 会让语义含糊） */
export interface StatCondition {
  attribute: string
  flavor: StatFlavor
  op: StatOp
  value: number
}

/** 排序键：按属性值 / 品质 / 名称 */
export type StatSortKey =
  | { kind: 'stat'; attribute: string; flavor: StatFlavor; dir: 'asc' | 'desc' }
  | { kind: 'quality'; dir: 'asc' | 'desc' }
  | { kind: 'name'; dir: 'asc' | 'desc' }

/** 属性候选（筛选/排序下拉可选项）——只收录目标集合中真实出现过的属性，避免选出空结果 */
export interface StatOption {
  attribute: string
  flavor: StatFlavor
  /** 展示名（含 `%` 后缀） */
  label: string
  /** 命中该属性的实体数（下拉里给个量级参考） */
  count: number
}

/** 属性显示名（属性字典单一来源 + 百分比后缀） */
export function statLabel(attribute: string, flavor: StatFlavor): string {
  return `${attrShortName(attribute)}${flavor === 'pct' ? '%' : ''}`
}

/** 归一领域 modifierType → 本模块口径 */
function toFlavor(modifierType: 'flat' | 'percent'): StatFlavor {
  return modifierType === 'percent' ? 'pct' : 'flat'
}

/** 属性键（内部坍缩/查找用，不出现在 UI） */
function keyOf(attribute: string, flavor: StatFlavor): string {
  return `${attribute}\u0000${flavor}`
}

/**
 * 由原始属性行构造可筛选实体。
 * 同「属性码 + 口径」的多行求和坍缩（如核心属性与词条同码时合并为一条），
 * 保证条件比较与排序取到的是该属性在该实体上的总值。
 * @param input.id 唯一键；input.name 展示名；input.quality 品质（无则 0）；input.rows 原始属性行
 */
export function makeStatTarget(input: {
  id: string
  name: string
  quality: number
  rows: readonly RawStatRow[]
}): StatTarget {
  const acc = new Map<string, StatRow>()
  for (const row of input.rows) {
    const flavor = toFlavor(row.modifierType)
    const key = keyOf(row.attribute, flavor)
    const hit = acc.get(key)
    if (hit) hit.value += row.value
    else acc.set(key, { attribute: row.attribute, flavor, value: row.value })
  }
  return { id: input.id, name: input.name, quality: input.quality, stats: [...acc.values()] }
}

/** 取实体某属性的值；无该属性返回 undefined（调用侧据此判定「不含」） */
export function statValue(
  target: StatTarget,
  attribute: string,
  flavor: StatFlavor,
): number | undefined {
  return target.stats.find((s) => s.attribute === attribute && s.flavor === flavor)?.value
}

/**
 * 收集目标集合中出现过的属性候选（按属性字典展示序，同属性固定值在前、百分比在后）。
 * @param targets 待筛选的全部实体
 */
export function collectStatOptions(targets: readonly StatTarget[]): StatOption[] {
  const map = new Map<string, StatOption>()
  for (const target of targets) {
    for (const stat of target.stats) {
      const key = keyOf(stat.attribute, stat.flavor)
      const hit = map.get(key)
      if (hit) hit.count += 1
      else
        map.set(key, {
          attribute: stat.attribute,
          flavor: stat.flavor,
          label: statLabel(stat.attribute, stat.flavor),
          count: 1,
        })
    }
  }
  return [...map.values()].sort((a, b) => {
    const byAttr = compareAttributeDisplayOrder(a.attribute, b.attribute)
    if (byAttr !== 0) return byAttr
    if (a.flavor === b.flavor) return 0
    return a.flavor === 'flat' ? -1 : 1
  })
}

/**
 * 判定实体是否满足全部条件（AND）。
 * has = 存在该属性；gte/lte = 该属性值比较，缺该属性直接判否。
 */
export function matchStatConditions(target: StatTarget, conditions: readonly StatCondition[]): boolean {
  return conditions.every((cond) => {
    const value = statValue(target, cond.attribute, cond.flavor)
    if (cond.op === 'has') return value !== undefined
    if (value === undefined) return false
    return cond.op === 'gte' ? value >= cond.value : value <= cond.value
  })
}

/** 按条件过滤（条件为空时原样返回） */
export function filterStatTargets<T extends StatTarget>(
  targets: readonly T[],
  conditions: readonly StatCondition[],
): T[] {
  if (conditions.length === 0) return [...targets]
  return targets.filter((t) => matchStatConditions(t, conditions))
}

/** 单键属性比较：缺失一方恒排最后（与方向无关），其余按方向比较差值 */
function compareStatPair(a: number | undefined, b: number | undefined, dir: 'asc' | 'desc'): number {
  if (a === undefined && b === undefined) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return dir === 'asc' ? a - b : b - a
}

/** 逐键比较（前一键相等才看后一键） */
function compareTargets(a: StatTarget, b: StatTarget, sorts: readonly StatSortKey[]): number {
  for (const sort of sorts) {
    let result: number
    if (sort.kind === 'stat') {
      result = compareStatPair(
        statValue(a, sort.attribute, sort.flavor),
        statValue(b, sort.attribute, sort.flavor),
        sort.dir,
      )
    } else if (sort.kind === 'quality') {
      result = sort.dir === 'asc' ? a.quality - b.quality : b.quality - a.quality
    } else {
      result = sort.dir === 'asc' ? a.name.localeCompare(b.name, 'zh') : b.name.localeCompare(a.name, 'zh')
    }
    if (result !== 0) return result
  }
  return 0
}

/**
 * 多键排序（稳定：同键保持传入顺序）。
 * @param targets 待排序实体；@param sorts 排序键列表（推荐末位放 quality 兜底，避免同值抖动）
 */
export function sortStatTargets<T extends StatTarget>(targets: readonly T[], sorts: readonly StatSortKey[]): T[] {
  if (sorts.length === 0) return [...targets]
  return targets
    .map((target, index) => ({ target, index }))
    .sort((x, y) => compareTargets(x.target, y.target, sorts) || x.index - y.index)
    .map((entry) => entry.target)
}

/* ── 筛选预设（会话无关的 UI 偏好，走 localStorage；不进游戏存档，避免污染存档版本号） ── */

/** 筛选预设：命名 + 条件 + 排序 */
export interface StatFilterPreset {
  name: string
  conditions: StatCondition[]
  sorts: StatSortKey[]
}

/** 预设存储键前缀（单一来源，读写共用） */
export const STAT_FILTER_PRESET_KEY = 'xy_stat_filter_presets'

/**
 * 面板作用域内的实际存储键。
 * 各面板属性池不同（装备走核心+词条、灵宠/坐骑走固定值组、法宝含系数），
 * 预设必须按作用域分桶，否则装备预设套到灵宠面板会得到一个恒不成立的条件（列表全空）。
 * @param scope 面板作用域（如 'gear' / 'fabao' / 'mount' / 'pet'）
 */
export function presetKeyOf(scope: string): string {
  return `${STAT_FILTER_PRESET_KEY}:${scope}`
}

/** 单条预设施加校验（localStorage 属外部输入，脏数据一律丢弃） */
function isPreset(v: unknown): v is StatFilterPreset {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<StatFilterPreset>
  return typeof p.name === 'string' && Array.isArray(p.conditions) && Array.isArray(p.sorts)
}

/**
 * 读取某作用域的全部预设（无存储/损坏/隐私模式 → 空数组，静默降级）
 * @param scope 面板作用域，见 presetKeyOf
 */
export function loadStatPresets(scope: string): StatFilterPreset[] {
  try {
    const raw = globalThis.localStorage?.getItem(presetKeyOf(scope))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPreset) : []
  } catch {
    return []
  }
}

/**
 * 覆盖写入某作用域的全部预设（写入失败静默——预设是便利功能，不阻断主流程）
 * @param scope 面板作用域，见 presetKeyOf
 * @param presets 该作用域下的完整预设列表
 */
export function saveStatPresets(scope: string, presets: readonly StatFilterPreset[]): void {
  try {
    globalThis.localStorage?.setItem(presetKeyOf(scope), JSON.stringify(presets))
  } catch {
    /* localStorage 不可用（隐私模式等）：静默丢弃 */
  }
}