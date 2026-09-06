/**
 * attribute-display.test.ts — 属性展示配置完整性校验：
 * 1. 全部 98 项属性均有显式展示配置（归族/层级），不依赖 fallback；
 * 2. situational 项的 group 限定在 useSituationalAttributes.isContextRelevant 已实现的匹配分支内；
 * 3. 同族内聚抽查：attackBonus/attackCoefficient/finalAttack 与 attack 同归 offense 族。
 */
import { describe, expect, it } from 'vitest'
import { AttributeMetaMap } from '@/domain/attribute/types'
import { ATTRIBUTE_DISPLAY_CONFIG, getAttributeDisplayConfig } from '@/presentation/config/attributeDisplay'

describe('属性展示配置（attributeDisplay）', () => {
  it('AttributeMetaMap 全部属性均有显式展示配置（新增属性漏配即失败）', () => {
    const missing = Object.keys(AttributeMetaMap).filter((code) => !(code in ATTRIBUTE_DISPLAY_CONFIG))
    expect(missing).toEqual([])
  })

  it('situational 项 group 限定在 isContextRelevant 已实现的分支（elemental/offense/control）', () => {
    const allowed = new Set(['elemental', 'offense', 'control'])
    const invalid = Object.entries(ATTRIBUTE_DISPLAY_CONFIG)
      .filter(([, cfg]) => cfg.displayTier === 'situational')
      .filter(([, cfg]) => !allowed.has(cfg.group))
      .map(([code]) => code)
    expect(invalid).toEqual([])
  })

  it('同族内聚：攻击衍生（加成/系数/最终攻击）与攻击同族', () => {
    const groupOf = (code: string) => getAttributeDisplayConfig(code).group
    expect(groupOf('attackBonus')).toBe(groupOf('attack'))
    expect(groupOf('attackCoefficient')).toBe(groupOf('attack'))
    expect(groupOf('finalAttack')).toBe(groupOf('attack'))
    expect(groupOf('defenseCoefficient')).toBe(groupOf('defense'))
    expect(groupOf('speedCoefficient')).toBe(groupOf('speed'))
  })

  it('展示配置无未引用的多余条目（配置里的 code 必须存在于属性系统）', () => {
    const stale = Object.keys(ATTRIBUTE_DISPLAY_CONFIG).filter((code) => !(code in AttributeMetaMap))
    expect(stale).toEqual([])
  })

  it('五行属性在「五行暂不启用」裁定期间一律 hidden（不进任何属性面板与情境高亮）', () => {
    const fiveElementCodes = [
      'waterAtk', 'fireAtk', 'metalAtk', 'woodAtk', 'earthAtk',
      'fireDamage', 'fireDamageTaken', 'waterDamageTaken', 'lightningDamageTaken',
      'metalRes', 'woodRes', 'waterRes', 'fireRes', 'earthRes',
      'fireSkillDmgBonus',
    ]
    const notHidden = fiveElementCodes.filter(
      (code) => getAttributeDisplayConfig(code).displayTier !== 'hidden',
    )
    expect(notHidden).toEqual([])
  })
})
