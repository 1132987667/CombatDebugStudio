/**
 * fabao.test.ts — 法宝/神器系统（PRD §22）单元自检
 *
 * 覆盖：
 * - 养成纯函数：强化消耗（单价×L）、分解返还（floor(级数×返还率)）、属性强化缩放（+4%/级）、品质上限
 * - 配置完整性：16 件名单（8 法宝 + 8 神器）、技能/牌引用闭合（releaseSkillId/extraSkillIds/
 *   充能技能存在于合并技能表；steps 引用的 buffId 存在于 buffs.json）
 * - fabao_strike 步骤结构：ratio > 0、独立乘区条件合法
 *
 * 运行: npx vitest run tests/unit/fabao.test.ts
 */
import { describe, expect, it } from 'vitest'
import fabaoJson from '@configs/xiyou/fabao.json'
import fabaoSkillsJson from '@configs/skills/skills_fabao.json'
import buffsJson from '@configs/buffs/buffs.json'
import {
  FABAO_ENHANCE_DUST,
  FABAO_MAX_SKILL_RANK,
  FABAO_QUALITY_TIERS,
  fabaoAttrValue,
  fabaoDefs,
  fabaoDustReturn,
  fabaoEnhanceCost,
  fabaoInstanceStats,
  fabaoTier,
} from '@/presentation/modules/yanjie/xiyou/fabao'

interface SkillStepLike {
  type?: string
  buffId?: string
  parameters?: { customType?: string; ratio?: number; hits?: number; independent?: { cond?: string }; altCond?: { cond?: string }; stackBuffId?: string; chance?: number }
}
interface SkillLike {
  id?: string
  triggerTimes?: string[]
  maxTriggersPerRound?: number
  condition?: string
  conditionParams?: Record<string, unknown>
  selector?: { faction?: string; strategy?: string }
  steps?: SkillStepLike[]
}

const skills = fabaoSkillsJson as unknown as SkillLike[]
const skillById = new Map(skills.map((s) => [s.id ?? '', s]))
const buffIds = new Set((buffsJson as { id: string }[]).map((b) => b.id))

describe('法宝/神器养成纯函数（PRD §22.5 品质基准）', () => {
  it('品质档强化上限 凡+3 → 仙+15', () => {
    expect(FABAO_QUALITY_TIERS.map((t) => t.enhanceCap)).toEqual([3, 6, 9, 12, 15])
  })

  it('强化金钱 = 品质单价 × 目标级（必成无失败率）', () => {
    // 凡品 +1 = 20；仙品 +15 = 200 × 15 = 3000
    expect(fabaoEnhanceCost(1, 1)).toBe(20)
    expect(fabaoEnhanceCost(5, 15)).toBe(3000)
  })

  it('强化固定消耗灵尘×1；技能升阶上限 2 阶', () => {
    expect(FABAO_ENHANCE_DUST).toBe(1)
    expect(FABAO_MAX_SKILL_RANK).toBe(2)
  })

  it('分解返还 = floor(强化级数 × 品质返还率)', () => {
    // 仙品 +15：15 × 0.7 = 10.5 → 10；凡品 +3：3 × 0.5 = 1.5 → 1；强化 0 级返 0
    expect(fabaoDustReturn({ quality: 5, enhance: 15 })).toBe(10)
    expect(fabaoDustReturn({ quality: 1, enhance: 3 })).toBe(1)
    expect(fabaoDustReturn({ quality: 3, enhance: 0 })).toBe(0)
  })

  it('属性强化缩放：每级 +4% 四舍五入（29 × 1.6 = 46.4 → 46）', () => {
    expect(fabaoAttrValue(29, 0)).toBe(29)
    expect(fabaoAttrValue(29, 15)).toBe(46)
    expect(fabaoAttrValue(12, 15)).toBe(19) // 12 × 1.6 = 19.2 → 19
  })

  it('实例属性：品质下标取值 + 系数不随强化变化', () => {
    const def = fabaoDefs.find((d) => d.id === 'fb_zhaoxianjian')!
    const stats = fabaoInstanceStats(def, { quality: 5, enhance: 0 })
    expect(stats.map((s) => s.value)).toEqual([29, 29, 6])
    const enhanced = fabaoInstanceStats(def, { quality: 5, enhance: 15 })
    expect(enhanced[0]!.value).toBe(46)
    expect(enhanced[2]!.value).toBe(6) // 系数固定
  })

  it('fabaoTier 越界钳制到 1-5', () => {
    expect(fabaoTier(0).quality).toBe(1)
    expect(fabaoTier(9).quality).toBe(5)
  })
})

describe('法宝/神器配置完整性（16 件名单 + 引用闭合）', () => {
  it('名单 = 8 法宝 + 8 神器（PRD §22.6/§22.7 唯一名单）', () => {
    expect(fabaoJson.fabao).toHaveLength(8)
    expect(fabaoJson.relic).toHaveLength(8)
    expect(fabaoDefs).toHaveLength(16)
  })

  it('品质数值数组长度 = 5（凡/玄/地/天/仙）', () => {
    for (const d of fabaoDefs) {
      expect(d.primary.values, `${d.id} primary`).toHaveLength(5)
      expect(d.secondary.values, `${d.id} secondary`).toHaveLength(5)
      expect(d.coefficient.values, `${d.id} coefficient`).toHaveLength(5)
    }
  })

  it('每件释放技能存在，且为满 3 层触发的被动（每回合至多 1 次）', () => {
    for (const d of fabaoDefs) {
      const s = skillById.get(d.releaseSkillId)
      expect(s, `${d.id} → ${d.releaseSkillId} 缺失`).toBeTruthy()
      expect(s!.triggerTimes, `${d.releaseSkillId} 需事件触发`).toBeTruthy()
      expect(s!.maxTriggersPerRound).toBe(1)
      expect(s!.condition).toBe('source_buff_stack_min')
      expect(s!.conditionParams).toMatchObject({ min: 3 })
    }
  })

  it('充能技能存在：法宝 on_crit/on_kill、神器 damage_taken/dodge/shield_break，每回合总获取上限 +2', () => {
    const fb = skillById.get('skill_fb_charge_gen')!
    expect(fb.triggerTimes).toEqual(expect.arrayContaining(['turn_start', 'on_crit', 'on_kill']))
    expect(fb.maxTriggersPerRound).toBe(2)
    const sq = skillById.get('skill_sq_charge_gen')!
    expect(sq.triggerTimes).toEqual(
      expect.arrayContaining(['turn_start', 'damage_taken', 'dodge', 'shield_break']),
    )
    expect(sq.maxTriggersPerRound).toBe(2)
  })

  it('extraSkillIds 引用闭合（风火轮联动被动）', () => {
    for (const d of fabaoDefs) {
      for (const id of d.extraSkillIds ?? []) {
        expect(skillById.has(id), `${d.id} extraSkill ${id}`).toBe(true)
      }
    }
  })

  it('全部 steps 引用的 buffId 存在于 buffs.json', () => {
    for (const s of skills) {
      for (const step of s.steps ?? []) {
        if (step.buffId) {
          expect(buffIds.has(step.buffId), `${s.id} → buff ${step.buffId}`).toBe(true)
        }
      }
    }
  })

  it('fabao_strike 步骤结构合法（ratio > 0，条件乘区带 cond）', () => {
    const strikeSkills = skills.filter((s) =>
      (s.steps ?? []).some((st) => st.parameters?.customType === 'fabao_strike'),
    )
    expect(strikeSkills).toHaveLength(8) // 8 件法宝全部走 fabao_strike
    for (const s of strikeSkills) {
      for (const st of s.steps ?? []) {
        if (st.parameters?.customType !== 'fabao_strike') continue
        expect(st.parameters.ratio, `${s.id} ratio`).toBeGreaterThan(0)
        if (st.parameters.independent) {
          expect(st.parameters.independent.cond).toBeTruthy()
        }
        if (st.parameters.hits) {
          expect(st.parameters.hits).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })

  it('神器触发效果不使用 fabao_strike（不走伤害管线，不可暴击）', () => {
    for (const d of fabaoDefs.filter((x) => x.kind === 'relic')) {
      const s = skillById.get(d.releaseSkillId)!
      const hasStrike = (s.steps ?? []).some(
        (st) => st.parameters?.customType === 'fabao_strike',
      )
      expect(hasStrike, `${d.id} 神器不应含 fabao_strike`).toBe(false)
    }
  })

  it('净化类步骤必须声明 exceptControl（PRD：净化不解除控制）', () => {
    const cleanseSteps = skills.flatMap((s) => s.steps ?? []).filter((st) => st.type === 'remove_debuff')
    expect(cleanseSteps.length).toBeGreaterThanOrEqual(2) // 玉净瓶×1 + 紫金葫芦×1
    for (const st of cleanseSteps) {
      expect(st.parameters && 'exceptControl' in st.parameters, '净化需 exceptControl').toBe(true)
    }
  })

  it('聚灵珠释放后灵能+1：满 3 层触发，清 2 留 1（单次引用，不先清后加）', () => {
    const s = skillById.get('skill_fb_release_julingzhu')!
    const removes = (s.steps ?? []).filter((st) => st.type === 'remove_buff')
    expect(removes).toHaveLength(1)
    expect(removes[0]!.buffId).toBe('buff_fb_charge')
    expect((removes[0] as { count?: number }).count).toBe(2)
  })
})
