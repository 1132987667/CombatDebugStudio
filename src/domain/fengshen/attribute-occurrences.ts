/**
 * 属性出现规则表（B1b 属性中心）
 *
 * 同一语义属性散落在多张表、多处字段中，口径各异。本模块以「属性出现规则」声明式描述
 * 每个出现位置，并提供**纯提取器**：给定「一行原始数据 + 属性 code」，返回该行命中的
 * 字段路径与该处承载的值文本。
 *
 * 口径三档：
 * - baseline  基准值：定义属性的基础来源（属性定义 / 成长曲线 / 玩家配置基础与成长 / 装备词条区间）
 * - derived   派生值：由基准值换算而来（玩家配置的属性点转化）
 * - reference 引用值：别处引用该属性代码作为配置项（系统投放 / 词缀修正）
 *
 * 与 REFERENCE_RULES 的分工：后者服务「引用完整性校验 / 删除保护」（关心"是否悬空"），
 * 本表服务「属性 → 全系统出现位置」查询（关心"值是多少、口径是什么"），二者不可互相替代。
 */

import type { FengshenTableName } from './types'

/** 属性出现位置的口径分类 */
export type AttributeOccurrenceKind = 'baseline' | 'derived' | 'reference'

/** 口径分类的中文标签（分组展示用） */
export const ATTRIBUTE_OCCURRENCE_KIND_LABEL: Record<AttributeOccurrenceKind, string> = {
  baseline: '基准值',
  derived: '派生值',
  reference: '引用值',
}

/** 单条属性出现记录（某表某行的某字段出现了该属性 code） */
export interface AttributeOccurrence {
  /** 来源表（跳转用；params 域文档同样标注 'params'） */
  table: FengshenTableName
  /** 来源行 id（跳转定位用；params 域即该文档 key，如 player_config） */
  rowId: string
  /** 行显示名（name 优先，缺省回退 rowId） */
  rowName: string
  /** 字段路径（人话定位，如 'perLevel.attack' / 'systems[0].distributions[1].attribute'） */
  field: string
  /** 该处属性承载的值文本（定值 / 区间 / 公式 / 转化率等） */
  valueText: string
  /** 口径分类 */
  kind: AttributeOccurrenceKind
  /** 口径 + 位置的中文标签（如 '基准值 · 成长曲线'，组内二次分组用） */
  label: string
}

/** 提取器命中项（字段路径 + 值文本） */
export interface AttributeHit {
  /** 字段路径（人话定位） */
  field: string
  /** 该处属性承载的值文本 */
  valueText: string
}

/** 属性出现提取规则：声明「某表的某处字段出现属性 code」并给出纯提取器 */
export interface AttributeOccurrenceRule {
  /** 分组标签（口径 · 位置） */
  label: string
  /** 口径分类 */
  kind: AttributeOccurrenceKind
  /** 来源表（params 域文档写 'params'，靠 docId 定位） */
  table: FengshenTableName
  /** params 域固定文档 id；非 params 表为 undefined（逐行扫全表） */
  docId?: string
  /**
   * 纯提取器：从单行数据中提取命中 code 的字段路径与值文本。
   * @param data 单行原始数据（params 域为 BattleParamData.data）
   * @param code 目标属性代码
   * @returns 命中项数组；未命中返回空数组（不抛错——配置残缺时视图不炸）
   */
  extract: (data: unknown, code: string) => AttributeHit[]
}

/** 安全取对象（排除数组与 null） */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** 安全取数组（非数组返回空数组） */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 同键取值：仅当值为 number 时命中（缺失 / 非数字一律视为未出现） */
function numberAtKey(source: Record<string, unknown> | null, code: string): number | null {
  const value = source?.[code]
  return typeof value === 'number' ? value : null
}

/** 投放规则值文本（fixed / range / formula 三模式的可读描述） */
function describeDistribution(rule: Record<string, unknown>): string {
  const mode = rule.mode
  if (mode === 'fixed') return `定值 ${rule.value ?? '—'}`
  if (mode === 'range') {
    const range = asRecord(rule.range)
    return `区间 ${range?.min ?? '—'}~${range?.max ?? '—'}`
  }
  if (mode === 'formula') {
    const formula = asRecord(rule.formula)
    return `公式 ${formula?.template ?? 'linear'}：${formula?.k ?? '—'}×等级+${formula?.b ?? '—'}`
  }
  return String(mode ?? '—')
}

/**
 * 属性出现规则表（8 条，覆盖 6 处出现位置）。
 * 顺序即视图分组展示顺序：先基准值，再派生值，最后引用值。
 */
export const ATTRIBUTE_OCCURRENCE_RULES: readonly AttributeOccurrenceRule[] = [
  // ① attributes 表 code 字段（属性定义本身；id === code）
  {
    label: '基准值 · 属性定义',
    kind: 'baseline',
    table: 'attributes',
    extract: (data, code) => (asRecord(data)?.code === code ? [{ field: 'code', valueText: code }] : []),
  },
  // ② growth 表 perLevel MAP 键
  {
    label: '基准值 · 成长曲线',
    kind: 'baseline',
    table: 'growth',
    extract: (data, code) => {
      const value = numberAtKey(asRecord(asRecord(data)?.perLevel), code)
      return value === null ? [] : [{ field: `perLevel.${code}`, valueText: `每级 +${value}` }]
    },
  },
  // ③ params/player_config → data.base.<attr>（1 级基础属性）
  {
    label: '基准值 · 玩家配置（1 级基础）',
    kind: 'baseline',
    table: 'params',
    docId: 'player_config',
    extract: (data, code) => {
      const value = numberAtKey(asRecord(asRecord(data)?.base), code)
      return value === null ? [] : [{ field: `base.${code}`, valueText: String(value) }]
    },
  },
  // ③ params/player_config → data.growth.<attr>（每级固定成长）
  {
    label: '基准值 · 玩家配置（每级成长）',
    kind: 'baseline',
    table: 'params',
    docId: 'player_config',
    extract: (data, code) => {
      const value = numberAtKey(asRecord(asRecord(data)?.growth), code)
      return value === null ? [] : [{ field: `growth.${code}`, valueText: `每级 +${value}` }]
    },
  },
  // ③ params/player_config → data.conversion.<attr>（属性点转化，派生口径）
  {
    label: '派生值 · 玩家配置（属性点转化）',
    kind: 'derived',
    table: 'params',
    docId: 'player_config',
    extract: (data, code) => {
      const value = numberAtKey(asRecord(asRecord(data)?.conversion), code)
      return value === null ? [] : [{ field: `conversion.${code}`, valueText: `1 属性点 → ${value}` }]
    },
  },
  // ④ params/system_distribution → data.systems[].distributions[].attribute
  {
    label: '引用值 · 系统投放',
    kind: 'reference',
    table: 'params',
    docId: 'system_distribution',
    extract: (data, code) => {
      const hits: AttributeHit[] = []
      asArray(asRecord(data)?.systems).forEach((systemRaw, si) => {
        asArray(asRecord(systemRaw)?.distributions).forEach((ruleRaw, di) => {
          const rule = asRecord(ruleRaw)
          if (rule?.attribute !== code) return
          hits.push({
            field: `systems[${si}].distributions[${di}].attribute`,
            valueText: describeDistribution(rule),
          })
        })
      })
      return hits
    },
  },
  // ⑤ equipment_affixes 表 attribute 字段（值口径为 valueRange 区间）
  {
    label: '基准值 · 装备词条区间',
    kind: 'baseline',
    table: 'equipment_affixes',
    extract: (data, code) => {
      const row = asRecord(data)
      if (row?.attribute !== code) return []
      const range = asRecord(row.valueRange)
      if (typeof range?.min !== 'number' || typeof range?.max !== 'number') {
        return [{ field: 'valueRange', valueText: '（区间缺失）' }]
      }
      return [{ field: 'valueRange', valueText: `${range.min}~${range.max}` }]
    },
  },
  // ⑥ affixes 表 statModifiers[].attribute
  {
    label: '引用值 · 词缀修正',
    kind: 'reference',
    table: 'affixes',
    extract: (data, code) => {
      const hits: AttributeHit[] = []
      asArray(asRecord(data)?.statModifiers).forEach((modifierRaw, i) => {
        const modifier = asRecord(modifierRaw)
        if (modifier?.attribute !== code) return
        // 缺省 PERCENTAGE（相对乘区）；ADDITIVE 为百分点口径（对 base=0 的比率/加成型属性）
        const tag = modifier.type === 'ADDITIVE' ? '百分点' : '百分比'
        hits.push({ field: `statModifiers[${i}]`, valueText: `${tag} ${modifier.percent ?? '—'}%` })
      })
      return hits
    },
  },
]