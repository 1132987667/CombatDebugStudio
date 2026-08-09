/**
 * 文件: unified-steps.ts
 * 功能: 结算步骤（CalcStep）展示辅助：运算符归一 + 逐步累计 + 来源释义（纯函数）
 * 描述: 解决「结算步骤链要人肉心算、src 字段无含义、运算符全半角混排」的易用性痛点。
 *       仅做展示层推导，不改动存档数据。
 */

import type { CalcStep } from './unified-archive'
import { round } from '@/shared/utils/math'

/** 运算符归一：半角 / 异体符号 → 全角统一展示符 */
export function normalizeOp(op: string): string {
  switch (op) {
    case '-':
      return '−'
    case '*':
    case 'x':
    case 'X':
      return '×'
    default:
      return op
  }
}

/** 逐步累计结果：每一步的归一化运算符 + 应用后的累计值 */
export interface StepAccum {
  step: CalcStep
  op: string
  running: number
}

/**
 * 按 Modifier Chain 语义从左到右累计：首步（op=''）赋值，后续按 +/−/× 更新。
 * 展示时以 Math.round(running*100)/100 输出，避免浮点尾差。
 * HACK: 假定 steps 为链式累计（当前 demo/录制契约）。若未来出现「各步独立贡献最后求和」
 *       的语义，累计列会误导——检视器对终值偏差 >1 标红即为自检信号，届时再改此函数。
 */
export function accumulateSteps(steps: CalcStep[]): StepAccum[] {
  const out: StepAccum[] = []
  let running = 0
  for (const s of steps) {
    const op = normalizeOp(s.op)
    if (op === '+') running += s.v
    else if (op === '−') running -= s.v
    else if (op === '×') running *= s.v
    else running = s.v
    out.push({ step: s, op, running })
  }
  return out
}

/** 精确到 2 位小数的展示（整数省略小数位） */
export function fmtRunning(n: number): string {
  const r = round(n, 2)
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

/** 步骤值规整：消除浮点尾差（如 145×0.35 累加出 50.830000000000005 → 50.83）。展示/转换共用 */
export function roundStepVal(v: number): number {
  return round(v, 2)
}

/** src 常见来源的精确释义（覆盖 demo / 录制高频值） */
const EXPLICIT_SRC: Record<string, string> = {
  'skill_cfg.base': '技能基础值',
  'unit.atk': '攻击者攻击力',
  'target.def': '目标防御力',
  'crit_rate': '暴击倍率',
  'buff.poison': '中毒 · 持续伤害',
  'passive.base': '被动基础值',
  'passive.combo_heart': '连击之心被动',
  'buff_gold_shield': '金甲护体',
  'buff_guardian_revenge_rage': '复仇怒火',
  'buff_yishang': '易伤加成',
}

/**
 * 引擎 DamageStep.stepName 英文标识 → 中文展示名（DamageCalculator.ts 生成的固定集合）。
 * 结算步骤行 / 事件流等展示处统一走 stepNameCN，不改引擎语义标识，也不动存档数据。
 */
const STEP_NAME_CN: Record<string, string> = {
  base: '基础值',
  extra: '额外加成',
  preCrit: '暴击前值',
  crit: '暴击',
  damageBoost: '伤害加成',
  fireSkillDmgBonus: '火系增伤',
  physicalSkillDmgBonus: '物理增伤',
  damageToLowHp: '对低血量增伤',
  critDmgTakenReduction: '受暴击减伤',
  defense: '防御',
  normalAtkReduction: '普攻减伤',
  skillDmgReduction: '技能减伤',
  elementalResistance: '元素抗性',
  fieldElemental: '场地元素',
  damageReduction: '减伤',
  dmgTakenIncrease: '受伤害增加',
  targetModifier: '目标修正',
  elementMatrix: '元素矩阵',
  clamp: '钳制',
}

/** 步骤名展示：引擎英文标识 → 中文；未命中（demo 已中文 / 未知来源）原样返回 */
export function stepNameCN(name: string): string {
  return STEP_NAME_CN[name] ?? name
}

/** src 释义解析：先查精确表，再按前缀归类；未命中返回 null */
export function describeSrc(src: string): string | null {
  if (EXPLICIT_SRC[src]) return EXPLICIT_SRC[src]
  if (src.startsWith('skill_cfg.')) return `技能配置 · ${src.slice('skill_cfg.'.length)}`
  if (src.startsWith('unit.')) return `攻击者属性 · ${src.slice('unit.'.length)}`
  if (src.startsWith('target.')) return `目标属性 · ${src.slice('target.'.length)}`
  if (src.startsWith('passive.')) return `被动效果 · ${src.slice('passive.'.length)}`
  if (src.startsWith('buff.')) return `Buff · ${src.slice('buff.'.length)}`
  if (src.startsWith('buff_')) return `Buff · ${src.slice('buff_'.length)}`
  return null
}
