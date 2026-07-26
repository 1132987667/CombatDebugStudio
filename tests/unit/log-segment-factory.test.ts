/**
 * 文件: log-segment-factory.test.ts
 * 功能: 片段工厂函数单元测试
 */
import { describe, it, expect } from 'vitest'
import {
  buffSegment,
  skillSegment,
  passiveSegment,
} from '@/shared/utils/log-segment-factory'
import type {
  BuffConfigLookup,
  SkillConfigLookup,
} from '@/shared/utils/log-segment-factory'

const mockBuffLookup: BuffConfigLookup = {
  getBuffConfig(buffId: string) {
    const configs: Record<string, any> = {
      buff_leader_aura: {
        id: 'buff_leader_aura',
        name: '统领光环',
        category: 'aura',
        aura: {},
      },
      buff_poison: {
        id: 'buff_poison',
        name: '中毒',
        category: 'dot',
        tags: ['dot'],
        isDebuff: true,
      },
      buff_stun: {
        id: 'buff_stun',
        name: '眩晕',
        category: 'control',
        controlType: 'stun',
      },
      buff_iron_armor: {
        id: 'buff_iron_armor',
        name: '铁甲护体',
        category: 'attribute',
        attributes: { dmgReduction: '+20%' },
      },
      buff_unknown: undefined,
    }
    return configs[buffId] as any
  },
}

const mockSkillLookup: SkillConfigLookup = {
  getSkillConfig(skillId: string) {
    const configs: Record<string, any> = {
      skill_water_heal: {
        id: 'skill_water_heal',
        name: '水疗波',
        description: '恢复友方气血',
      },
      passive_combo_heart: {
        id: 'passive_combo_heart',
        name: '连击之心',
        description: '普攻有25%概率追加攻击',
      },
    }
    return configs[skillId]
  },
}

describe('buffSegment', () => {
  it('produces correct segment for aura buff', () => {
    const seg = buffSegment('buff_leader_aura', mockBuffLookup)
    expect(seg.text).toBe('【统领光环】')
    expect(seg.classStr).toBe('log-buff')
    expect(seg.hover).toEqual({ kind: 'buff', id: 'buff_leader_aura' })
  })

  it('produces correct segment for dot buff', () => {
    const seg = buffSegment('buff_poison', mockBuffLookup)
    expect(seg.text).toBe('【中毒】')
    expect(seg.classStr).toBe('log-debuff')
    expect(seg.hover).toEqual({ kind: 'buff', id: 'buff_poison' })
  })

  it('produces control class for control buff', () => {
    const seg = buffSegment('buff_stun', mockBuffLookup)
    expect(seg.classStr).toBe('log-control')
  })

  it('falls back to buffId when config not found', () => {
    const seg = buffSegment('buff_unknown', mockBuffLookup)
    expect(seg.text).toBe('【buff_unknown】')
    expect(seg.classStr).toBe('log-buff')
    expect(seg.hover).toEqual({ kind: 'buff', id: 'buff_unknown' })
  })
})

describe('skillSegment', () => {
  it('produces correct segment for a skill', () => {
    const seg = skillSegment('skill_water_heal', mockSkillLookup)
    expect(seg.text).toBe('【水疗波】')
    expect(seg.classStr).toBe('log-skill')
    expect(seg.hover).toEqual({ kind: 'skill', id: 'skill_water_heal' })
  })

  it('falls back to skillId when config not found', () => {
    const seg = skillSegment('skill_missing', mockSkillLookup)
    expect(seg.text).toBe('【skill_missing】')
  })
})

describe('passiveSegment', () => {
  it('produces correct segment for a passive', () => {
    const seg = passiveSegment('passive_combo_heart', mockSkillLookup)
    expect(seg.text).toBe('【连击之心】')
    expect(seg.classStr).toBe('log-passive')
    expect(seg.hover).toEqual({ kind: 'passive', id: 'passive_combo_heart' })
  })
})
