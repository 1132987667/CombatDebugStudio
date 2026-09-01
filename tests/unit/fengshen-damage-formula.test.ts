/**
 * 伤害公式参考 · 实例演算测试
 *
 * 现场调用 DamageCalculator，验证 buildSampleDamageTrace 的逐步骤演算与 PRD/引擎口径一致。
 * 运行: npx vitest run tests/unit/fengshen-damage-formula.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  DAMAGE_FORMULA_STEPS,
  FORMULA_ZONES,
  buildSampleDamageTrace,
} from '@/domain/fengshen/damage-formula-reference'

describe('伤害公式参考', () => {
  it('每条公式步骤都归属到已定义的阶段', () => {
    const zoneIds = new Set(FORMULA_ZONES.map((z) => z.id))
    for (const s of DAMAGE_FORMULA_STEPS) {
      expect(zoneIds.has(s.zoneId)).toBe(true)
    }
  })

  it('实例演算：来源加成 + 目标减免 + 防御减法，逐步骤引擎复算（每步 floor，非手算）', () => {
    const t = buildSampleDamageTrace()
    const names = t.steps.map((s) => s.stepName)
    // 覆盖关键乘区环节
    expect(names).toEqual(
      expect.arrayContaining(['base', 'extra', 'damageBoost', 'defense', 'skillDmgReduction', 'damageReduction', 'dmgTakenIncrease']),
    )
    // 引擎每步 floor：600→(+50)650→×1.2=780→×1.15 因浮点 896.99…→raw 896
    expect(t.result.rawDamage).toBe(896)
    // 896→−120=776→×0.9=698→×0.92=642→×1.15=738
    expect(t.result.finalDamage).toBe(738)
    expect(t.result.isCritical).toBe(false)
    expect(t.result.isMiss).toBe(false)
  })

  it('步骤链连续：逐击变换子链（damageBoost 起）衔接至最终伤害', () => {
    const t = buildSampleDamageTrace()
    // 组装块起点：base 0 → 600（baseValue）
    expect(t.steps[0].stepName).toBe('base')
    expect(t.steps[0].before).toBe(0)
    expect(t.steps[0].after).toBe(600)
    // preCrit 步骤重述小计（650），不是变换环节——变换子链从 damageBoost 起
    const start = t.steps.findIndex((s) => s.stepName === 'damageBoost')
    expect(start).toBeGreaterThan(0)
    const chain = t.steps.slice(start)
    expect(chain[0].before).toBe(650) // = preCrit 小计
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].before).toBe(chain[i - 1].after)
    }
    expect(chain[chain.length - 1].after).toBe(t.result.finalDamage)
  })
})
