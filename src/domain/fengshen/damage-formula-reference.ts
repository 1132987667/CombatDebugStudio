import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { AttackType, DamageCategory } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { DamageBreakdown } from '@/domain/battle/combat-record'

/**
 * 伤害公式参考 —— 「公式为主、属性为辅」的封神榜「属性与公式」页数据源。
 *
 * 与旧版硬编码 FORMULAS 常量的区别：本文件的分层公式逐步对照 DamageCalculator.calculateDamage
 * 的真实执行顺序，并用 buildSampleDamageTrace() 现场调用引擎得到一条实例演算，
 * 昊天镜可据此反推「配置的伤害是否符合预期」。
 */

/** 计算阶段（按引擎真实执行顺序分层） */
export interface FormulaZone {
  id: string
  label: string
  desc: string
}

/** 单条公式：对照引擎某一环节 + PRD 章节 + 与 PRD 的一致性 */
export interface FormulaStep {
  zoneId: string
  key: string
  label: string
  /** 可读公式表达式 */
  expr: string
  /** 涉及属性 code */
  attrs?: string[]
  /** PRD 章节 */
  prd?: string
  /** 与 PRD 一致性：ok=引擎已实现且一致；gap=PRD 有规定但引擎未实现/位置不同 */
  align?: 'ok' | 'gap'
  note?: string
}

export const FORMULA_ZONES: FormulaZone[] = [
  { id: 'judge', label: '判定层', desc: '命中/闪避、暴击触发（受战斗参数开关门控）' },
  { id: 'base', label: '基础 + 额外', desc: '技能威力、extraValues 附加' },
  { id: 'crit', label: '暴击乘区', desc: '暴击伤害倍率' },
  { id: 'source', label: '来源方加成（原始伤害）', desc: '伤害提升 / 属性·物理·低血加成 → rawDamage' },
  { id: 'target', label: '目标方减免', desc: '防御、攻击类型减免、抗性、免伤、易伤、目标修正' },
  { id: 'matrix', label: '阵营克制', desc: '来源阵营 vs 目标阵营系数' },
  { id: 'clamp', label: '阈值保底', desc: '最小/最大伤害裁剪，保底非负整数' },
]

export const DAMAGE_FORMULA_STEPS: FormulaStep[] = [
  // 判定层
  {
    zoneId: 'judge', key: 'hitRate', label: '计算命中率',
    expr: '命中值 ÷ (命中值 + 闪避值) × 100%',
    attrs: ['hitValue', 'dodgeValue'], prd: '§12', align: 'ok',
  },
  {
    zoneId: 'judge', key: 'actualHit', label: '实际命中率',
    expr: 'clamp(计算命中率 + 命中率 − 闪避率, 10%, 95%)',
    attrs: ['hit', 'dodge'], prd: '§12', align: 'ok',
  },
  {
    zoneId: 'judge', key: 'crit', label: '暴击判定',
    expr: '随机数 × 100 < 暴击率 → 暴击',
    attrs: ['critRate'], prd: '§13', align: 'gap',
    note: 'PRD §13 期望 clamp(暴击率−暴击抵抗) 且含溢出转化，引擎暂未实现；enableCrit 关闭时恒不暴击。',
  },
  // 基础 + 额外
  {
    zoneId: 'base', key: 'base', label: '基础伤害',
    expr: '技能威力 baseValue（策划填 = 倍率 × 攻击力）；无 calculation 时 attack × (1 ± 15%)',
    attrs: ['attack'], prd: '§11', align: 'ok',
    note: '技能倍率由技能配置 baseValue 承载，引擎不再二次乘攻击。',
  },
  {
    zoneId: 'base', key: 'extra', label: '额外加成',
    expr: '伤害 += Σ(关联属性值 × ratio)',
    prd: '§11', align: 'ok',
  },
  // 暴击乘区
  {
    zoneId: 'crit', key: 'crit', label: '暴击倍率',
    expr: '伤害 = floor(伤害 × 暴击伤害% ÷ 100)',
    attrs: ['critDamage'], prd: '§11', align: 'gap',
    note: 'PRD 期望倍率再减暴伤减免；引擎把暴伤减免放到目标方独立步骤 critDmgTakenReduction。',
  },
  // 来源方加成
  {
    zoneId: 'source', key: 'damageBoost', label: '伤害提升',
    expr: '× (1 + 伤害提升%)', attrs: ['damageBoost'], prd: '§11', align: 'ok',
  },
  {
    zoneId: 'source', key: 'fireSkillDmgBonus', label: '火系技能加成',
    expr: '火元素技能：× (1 + 火系技能伤害加成%)', attrs: ['fireSkillDmgBonus'], prd: '—', align: 'ok',
    note: '归档属性（随五行暂不启用），引擎步骤保留。',
  },
  {
    zoneId: 'source', key: 'physicalSkillDmgBonus', label: '物理技能加成',
    expr: '物理/普攻：× (1 + 物理技能伤害加成%)', attrs: ['physicalSkillDmgBonus'], prd: '—', align: 'ok',
    note: '归档属性，引擎步骤保留。',
  },
  {
    zoneId: 'source', key: 'damageToLowHp', label: '低血量增伤',
    expr: '目标气血 < 30%：× (1 + 对低血量加成%)', attrs: ['damageToLowHp'], prd: '—', align: 'ok',
    note: '归档属性，引擎步骤保留。→ rawDamage（减免前，供反伤基数）',
  },
  // 目标方减免
  {
    zoneId: 'target', key: 'critDmgTakenReduction', label: '暴伤减免',
    expr: '暴击时：× (1 − 暴击承伤减免%)', attrs: ['critDmgTakenReduction'], prd: '§11', align: 'ok',
  },
  {
    zoneId: 'target', key: 'defense', label: '防御减免',
    expr: '伤害 = max(0, 伤害 − 防御)', attrs: ['defense'], prd: '§11', align: 'ok',
    note: '减法公式；PRD 保底写 max(1,·)，引擎此处 max(0,·)，最终保底在 clamp 层。真伤大类跳过。',
  },
  {
    zoneId: 'target', key: 'atkTypeReduction', label: '攻击类型减免',
    expr: '普攻:×(1−普攻减免%) / 技能:×(1−技能减免%)', attrs: ['normalAtkDmgReduction', 'skillDmgReduction'], prd: '§11', align: 'ok',
  },
  {
    zoneId: 'target', key: 'elemental', label: '元素抗性',
    expr: 'ELEMENTAL：×(1−对应抗性%) ×(1+场地修正%)', attrs: ['fireRes', 'waterRes'], prd: '§11', align: 'ok',
    note: '五行暂不启用，仅 ELEMENTAL 大类触发。',
  },
  {
    zoneId: 'target', key: 'damageReduction', label: '通用免伤',
    expr: '× (1 − 免伤率%)', attrs: ['damageReduction'], prd: '§11', align: 'ok',
  },
  {
    zoneId: 'target', key: 'dmgTakenIncrease', label: '受伤增加（易伤）',
    expr: '× (1 + 受到伤害增加%)', attrs: ['damageTakenIncrease'], prd: '§11', align: 'ok',
    note: '引擎此步读取 damageTakenIncrease（归档名易伤），故该 code 不可物理删除。',
  },
  {
    zoneId: 'target', key: 'targetModifier', label: '目标修正',
    expr: '× (1 + targetModifiers 修正)', prd: '§11', align: 'ok',
  },
  // 阵营克制
  {
    zoneId: 'matrix', key: 'elementMatrix', label: '阵营克制',
    expr: '× 阵营元素克制系数（缺省 1.0）', prd: '—', align: 'ok',
  },
  // 阈值
  {
    zoneId: 'clamp', key: 'clamp', label: '阈值裁剪',
    expr: 'clamp(伤害, 最小阈值, 最大阈值) → floor', prd: '§11', align: 'ok',
    note: '最终伤害保底非负整数。',
  },
]

/**
 * 最终乘区（L4）不进 per-hit 步骤：最终攻击/最终防御在属性聚合层放大 attack/defense，
 * 最终伤害提升/减免在别处生效。此处显式说明，避免读者在链路里找不到它们。
 */
export const L4_NOTE =
  '最终攻击 / 最终防御（L4）在属性聚合层放大基础值，不体现为逐击步骤；技能威力已在策划配置中按「倍率 × 攻击力」折入 baseValue。'

// ===== 实例演算：现场调用 DamageCalculator =====

/** 结构最小化的演示实体：仅实现 calculateDamage 真正读取的成员，用 cast 规避 BattleEntity 全量内部状态。 */
function makeSampleEntity(
  id: string,
  attrs: Record<string, number>,
  extra: Partial<Pick<BattleEntity, 'maxHealth' | 'currentHealth'>> = {},
): BattleEntity {
  const e = {
    id,
    maxHealth: extra.maxHealth ?? 1000,
    currentHealth: extra.currentHealth ?? 1000,
    getAttribute: (code: string) => attrs[code] ?? 0,
  }
  return e as unknown as BattleEntity
}

export interface DamageTraceStep {
  stepName: string
  description: string
  before?: number
  after?: number
}

export interface DamageTraceSample {
  /** 输入面板：攻击方/目标/技能关键参数 */
  inputs: { group: string; label: string; value: string }[]
  steps: DamageTraceStep[]
  result: { rawDamage: number; finalDamage: number; isCritical: boolean; isMiss: boolean }
}

/** 一条覆盖 来源加成 + 目标减免 + 防御(减法) + 免伤 + 易伤 的确定性演算（无暴击/闪避随机）。 */
export function buildSampleDamageTrace(): DamageTraceSample {
  const source = makeSampleEntity('attacker', {
    attack: 100,
    critRate: 0,
    damageBoost: 20,
    physicalSkillDmgBonus: 15,
  })
  const target = makeSampleEntity('defender', {
    defense: 120,
    skillDmgReduction: 10,
    damageReduction: 8,
    damageTakenIncrease: 15,
  }, { maxHealth: 1000, currentHealth: 800 })

  const skillStep = {
    type: 'deal_damage',
    damageCategory: DamageCategory.PHYSICAL,
    attackType: AttackType.SKILL,
    calculation: {
      baseValue: 600,
      extraValues: [{ attribute: 'attack', ratio: 0.5 }],
    },
  } as unknown as ExtendedSkillStep

  // 默认 config：enableCrit=false / enableDodge=false → 全程无 rng，结果稳定可复算
  const calc = new DamageCalculator()
  const result = calc.calculateDamage(skillStep, source, target)
  const traceSteps = collectSteps(skillStep, source, target)

  return {
    inputs: [
      { group: '攻击方', label: '技能威力 baseValue', value: '600' },
      { group: '攻击方', label: 'attack（extra 0.5）', value: '100' },
      { group: '攻击方', label: '伤害提升', value: '20%' },
      { group: '攻击方', label: '物理技能加成', value: '15%' },
      { group: '目标', label: '防御', value: '120' },
      { group: '目标', label: '技能减免', value: '10%' },
      { group: '目标', label: '免伤率', value: '8%' },
      { group: '目标', label: '受伤增加（易伤）', value: '15%' },
    ],
    steps: traceSteps,
    result: {
      rawDamage: result.rawDamage,
      finalDamage: result.damage,
      isCritical: result.isCritical,
      isMiss: result.isMiss,
    },
  }
}

/** 借助带 record 的执行上下文把 DamageBreakdown.steps 取出（calculateDamage 会把 breakdown 挂到 context.record）。 */
function collectSteps(
  skillStep: ExtendedSkillStep,
  source: BattleEntity,
  target: BattleEntity,
): DamageTraceStep[] {
  const record: { damageBreakdown?: DamageBreakdown; effects?: unknown[] } = { effects: [] }
  const calc = new DamageCalculator()
  calc.calculateDamage(skillStep, source, target, { record } as never)
  const steps = record.damageBreakdown?.steps ?? []
  return steps.map((s) => ({
    stepName: s.stepName,
    description: s.description,
    before: s.before,
    after: s.after,
  }))
}
