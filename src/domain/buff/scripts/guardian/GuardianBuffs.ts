/**
 * 守护者 Buff 脚本集合
 * 每个类对应一个 buff ID，继承 AttributeBuffTemplate 实现属性修正。
 * ponytail: 所有类写在一个文件中减少文件数量，通过静态 BUFF_ID 自动注册。
 */
import { AttributeBuffTemplate, type AttributeModifier } from '@/domain/buff/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

/* ========== 复仇怒火：受击+5%攻击，可叠5层 ========== */
export class RevengeRageBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_revenge_rage'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.attack, value: (ctx) => this.getConfigValue(ctx, 'stackBonus', 5), type: ModifierType.PERCENTAGE, description: '复仇怒火' }]
  }
  protected _onApply(context: BuffContext): void {
    context.setVariable('_bonus', this.getConfigValue(context, 'stackBonus', 5))
    super._onApply(context)
  }
}
/* ========== 破甲打击：降低目标20%防御，2回合 ========== */
export class ArmorBreakBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_armor_break'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.defense, value: -20, type: ModifierType.PERCENTAGE, description: '破甲打击' }]
  }
}
/* ========== 坚毅护盾：伤害减免标记（需配合伤害拦截） ========== */
export class FirmShieldBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_firm_shield'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.damageReduction, value: 0, type: ModifierType.ADDITIVE, description: '坚毅护盾' }]
  }
}
/* ========== 静电反冲：沉默攻击者1回合（buff 本身只是标记） ========== */
export class StaticReboundBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_static_rebound'
  protected getModifiers(): AttributeModifier[] {
    return []
  }
}
/* ========== 先发制人：首回合伤害+25%，1回合 ========== */
export class FirstStrikeBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_first_strike'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.damageBoost, value: 25, type: ModifierType.ADDITIVE, description: '先发制人' }]
  }
}
/* ========== 蓄力爆发：下回合伤害+100%，1回合 ========== */
export class ChargeBurstBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_charge_burst'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.damageBoost, value: 100, type: ModifierType.ADDITIVE, description: '蓄力爆发' }]
  }
}
/* ========== 元素迟缓：全体敌方速度-5%，1回合 ========== */
export class ElementSlowBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_element_slow'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.speed, value: -5, type: ModifierType.PERCENTAGE, description: '元素迟缓' }]
  }
}
/* ========== 绝望气场：敌方暴击-15% ========== */
export class DespairAuraBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_despair_aura'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.critRate, value: -15, type: ModifierType.ADDITIVE, description: '绝望气场' }]
  }
}
/* ========== 治愈微风：友方防御+20%，1次攻击后移除 ========== */
export class HealBreezeBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_heal_breeze'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.defense, value: 20, type: ModifierType.PERCENTAGE, description: '治愈微风' }]
  }
}
/* ========== 以牙还牙：下次攻击伤害标记（伤害加成通过 modify_attribute 实现） ========== */
export class EyeForEyeBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_eye_for_eye'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.damageBoost, value: 0, type: ModifierType.ADDITIVE, description: '以牙还牙' }]
  }
}
/* ========== 复仇之怒：攻+30% 暴+20%，3回合 ========== */
export class RevengeFuryBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_revenge_fury'
  protected getModifiers(): AttributeModifier[] {
    return [
      { attribute: ATTRIBUTE_CODE.attack, value: 30, type: ModifierType.PERCENTAGE, description: '复仇之怒-攻' },
      { attribute: ATTRIBUTE_CODE.critRate, value: 20, type: ModifierType.ADDITIVE, description: '复仇之怒-暴' },
    ]
  }
}
/* ========== 麻痹触手：速度-50%（标记状态） ========== */
export class ParalyzeBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_paralyze'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.speed, value: -50, type: ModifierType.PERCENTAGE, description: '麻痹触手' }]
  }
}
/* ========== 献祭之怒：攻+50% 暴+20%，永久 ========== */
export class SacrificeRageBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_sacrifice_rage'
  protected getModifiers(): AttributeModifier[] {
    return [
      { attribute: ATTRIBUTE_CODE.attack, value: 50, type: ModifierType.PERCENTAGE, description: '献祭之怒-攻' },
      { attribute: ATTRIBUTE_CODE.critRate, value: 20, type: ModifierType.ADDITIVE, description: '献祭之怒-暴' },
    ]
  }
}
/* ========== 狂战士：攻+30% 防-15%，3回合 ========== */
export class BerserkerBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_berserker'
  protected getModifiers(): AttributeModifier[] {
    return [
      { attribute: ATTRIBUTE_CODE.attack, value: 30, type: ModifierType.PERCENTAGE, description: '狂战士-攻' },
      { attribute: ATTRIBUTE_CODE.defense, value: -15, type: ModifierType.PERCENTAGE, description: '狂战士-防' },
    ]
  }
}
/* ========== 疾风迅雷：速度差伤害标记 ========== */
export class WindThunderBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_wind_thunder'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.damageBoost, value: 0, type: ModifierType.ADDITIVE, description: '疾风迅雷' }]
  }
}
/* ========== 随机嘲讽 ========== */
export class RandomTauntBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_random_taunt'
  protected getModifiers(): AttributeModifier[] {
    return []
  }
}
/* ========== 背水护甲：标记 buff，能量抵扣伤害由 BattleParticipantImpl.takeDamage 处理 ========== */
export class BackwaterArmorBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_backwater_armor'
  protected getModifiers(): AttributeModifier[] {
    return []
  }
}
/* ========== 疾风叠步：普攻命中+5%速度，无限叠加，持续到战斗结束 ========== */
export class SwiftWindBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'guardian_buff_swift_wind'
  protected getModifiers(): AttributeModifier[] {
    return [{ attribute: ATTRIBUTE_CODE.speed, value: (ctx) => this.getConfigValue(ctx, 'stackBonus', 5), type: ModifierType.PERCENTAGE, description: '疾风叠步' }]
  }
}
