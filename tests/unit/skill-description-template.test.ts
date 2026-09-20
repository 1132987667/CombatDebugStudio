/**
 * 技能描述模板渲染测试（P2/UI-1）
 * {{damage}}/{{heal}} 变量取自 steps 的 calculation 公式描述，与配置数值同源
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describeCalculation, renderSkillDescription } from '@/domain/skill/calculation-utils'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { DamageHealCalculationConfig, SkillConfig } from '@/domain/skill/types'

function makeSkillConfig(overrides: Partial<SkillConfig>): SkillConfig {
  return {
    id: 'test_skill',
    name: '测试技能',
    description: '',
    energyCost: 0,
    cooldown: 0,
    selector: { faction: 'enemy', strategy: 'first', count: 1 },
    steps: [],
    ...overrides,
  } as SkillConfig
}

const calc = (overrides: Partial<DamageHealCalculationConfig>): DamageHealCalculationConfig => ({
  baseValue: 0,
  extraValues: [],
  ...overrides,
})

describe('describeCalculation', () => {
  it('纯属性加成 → 百分比 + 属性中文名', () => {
    expect(describeCalculation(calc({ extraValues: [{ attribute: ATTRIBUTE_CODE.attack, ratio: 1 }] })))
      .toBe('100% 攻击力')
  })

  it('基础值 + 等级加成 → 倍数写法', () => {
    expect(describeCalculation(calc({ baseValue: 50, extraValues: [{ attribute: 'level', ratio: 5 }] })))
      .toBe('50+等级×5')
  })

  it('小数比率 → 百分比（浮点误差消除）', () => {
    expect(describeCalculation(calc({ extraValues: [{ attribute: ATTRIBUTE_CODE.attack, ratio: 1.2 }] })))
      .toBe('120% 攻击力')
  })

  it('相同属性加成合并（两条 level×5 → 等级×10）', () => {
    expect(describeCalculation(calc({
      baseValue: 150,
      extraValues: [{ attribute: 'level', ratio: 5 }, { attribute: 'level', ratio: 5 }],
    }))).toBe('150+等级×10')
  })
})

describe('renderSkillDescription', () => {
  it('替换 {{damage}}', () => {
    const config = makeSkillConfig({
      description: '造成 {{damage}} 伤害',
      steps: [{ type: 'deal_damage', calculation: calc({ extraValues: [{ attribute: ATTRIBUTE_CODE.attack, ratio: 1 }] }) }],
    } as Partial<SkillConfig>)
    expect(renderSkillDescription(config)).toBe('造成 100% 攻击力 伤害')
  })

  it('替换 {{heal}}', () => {
    const config = makeSkillConfig({
      description: '恢复 {{heal}} 气血',
      steps: [{ type: 'heal', calculation: calc({ baseValue: 50, extraValues: [{ attribute: 'level', ratio: 5 }] }) }],
    } as Partial<SkillConfig>)
    expect(renderSkillDescription(config)).toBe('恢复 50+等级×5 气血')
  })

  it('无模板时原样返回（幂等，缓存安全）', () => {
    const config = makeSkillConfig({ description: '造成 100% 攻击力伤害' })
    expect(renderSkillDescription(config)).toBe('造成 100% 攻击力伤害')
  })

  it('无 description 返回空串', () => {
    expect(renderSkillDescription(makeSkillConfig({}))).toBe('')
  })

  it('模板无对应 calculation → 保留原文供配置作者发现', () => {
    const config = makeSkillConfig({ description: '造成 {{damage}} 伤害', steps: [{ type: 'apply_buff' }] })
    expect(renderSkillDescription(config)).toBe('造成 {{damage}} 伤害')
  })

  it('容忍模板空白变体 {{ damage }}', () => {
    const config = makeSkillConfig({
      description: '造成 {{ damage }} 伤害',
      steps: [{ type: 'deal_damage', calculation: calc({ extraValues: [{ attribute: ATTRIBUTE_CODE.attack, ratio: 0.5 }] }) }],
    } as Partial<SkillConfig>)
    expect(renderSkillDescription(config)).toBe('造成 50% 攻击力 伤害')
  })
})

describe('已迁移配置冒烟：所有模板描述都能完整渲染', () => {
  const files = ['skill_player_xiyou.json', 'skills_fabao.json']

  for (const file of files) {
    it(`${file} 渲染后不含残留模板变量`, () => {
      const path = resolve(__dirname, '../../configs/skills', file)
      const skills = JSON.parse(readFileSync(path, 'utf8')) as SkillConfig[]
      const templated = skills.filter((s) => s.description?.includes('{{'))
      expect(templated.length).toBeGreaterThan(0) // 确认冒烟真的扫到了迁移数据
      for (const s of templated) {
        const rendered = renderSkillDescription(s)
        expect(rendered, `${s.id}`).not.toContain('{{')
      }
    })
  }
})
