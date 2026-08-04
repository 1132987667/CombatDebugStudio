/**
 * 文件: log-segment-factory.test.ts
 * 功能: 片段工厂函数单元测试
 */
import { describe, it, expect } from 'vitest'
import {
  skillSegment,
  passiveSegment,
  blocksToHtml,
  segsText,
} from '@/shared/utils/log-segment-factory'
import type {
  BuffConfigLookup,
  SkillConfigLookup,
} from '@/shared/utils/log-segment-factory'
import type { LogSegment, NarrativeBlock } from '@/shared/types/battle-log'

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

// ==================== HTML 导出 ====================

function makeTextSeg(text: string): LogSegment {
  return { text }
}

function makeSkillSeg(name: string, id: string): LogSegment {
  return { text: `【${name}】`, classStr: 'log-skill', hover: { kind: 'skill', id }, kind: 'skill' }
}

function makeDamageSeg(value: number): LogSegment {
  return { text: String(value), kind: 'damage' }
}

function makeHealSeg(value: number): LogSegment {
  return { text: String(value), kind: 'heal' }
}


describe('segsText（TXT 导出纯文本 — 与 HTML/面板同口径补前缀）', () => {
  it('entity 段缺前缀但 faction 明确 → 自动补 [友方]/[敌方]', () => {
    const segs = [
      { text: '史莱姆', kind: 'entity', faction: 'enemy' },
      { text: ' 受到 ' },
      { text: '30', classStr: 'log-damage', kind: 'damage' },
      { text: ' 点伤害' },
    ]
    expect(segsText(segs)).toBe('[敌方]史莱姆 受到 30 点伤害')
  })

  it('已带前缀 / 自身 / 无 faction（回放 id）原样输出', () => {
    expect(
      segsText([
        { text: '[友方]剑客', kind: 'entity', faction: 'ally' },
        { text: ' 对 ' },
        { text: '[敌方]史莱姆', kind: 'entity', faction: 'enemy' },
        { text: ' 使用 【火球术】' },
      ]),
    ).toBe('[友方]剑客 对 [敌方]史莱姆 使用 【火球术】')
    expect(segsText([{ text: '自身', kind: 'entity', faction: 'ally' }])).toBe('自身')
    expect(segsText([{ text: 'u1', kind: 'entity', classStr: 'log-friendly' }])).toBe('u1')
  })
})

describe('blocksToHtml', () => {  it('renders skill chip with correct class', () => {
    const blocks: NarrativeBlock[] = [
      {
        type: 'action',
        header: [makeSkillSeg('烈焰斩', 'skill_fire_slash')],
        subs: [[makeDamageSeg(150)]],
      },
    ]
    const html = blocksToHtml(blocks, { title: '测试', generatedAt: 'now' })
    expect(html).toContain('chip--skill')
    expect(html).toContain('class="num num--damage"')
    expect(html).toContain('烈焰斩')
    expect(html).toContain('150')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<style>')
  })

  it('renders battle-header, round, and summary blocks', () => {
    const blocks: NarrativeBlock[] = [
      { type: 'battle-header', segments: [makeTextSeg('测试对局')] },
      { type: 'round', turn: 1 },
      { type: 'summary', lines: [[makeTextSeg('战斗结束')]] },
    ]
    const html = blocksToHtml(blocks, { title: '测试', generatedAt: 'now' })
    expect(html).toContain('nb--battle-header')
    expect(html).toContain('第 1 回合')
    expect(html).toContain('nb--summary')
    expect(html).toContain('战斗结束')
  })

  it('renders settlement and snapshot sections', () => {
    const blocks: NarrativeBlock[] = [
      { type: 'settlement', lines: [[makeDamageSeg(50)]] },
      { type: 'snapshot', lines: [[makeHealSeg(30)]] },
    ]
    const html = blocksToHtml(blocks, { title: '测试', generatedAt: 'now' })
    expect(html).toContain('nb--settlement')
    expect(html).toContain('num--damage')
    expect(html).toContain('nb--snapshot')
    expect(html).toContain('num--heal')
  })
})
