/**
 * 狂暴 Buff — 自包含脚本示范类
 *
 * 这是一个"完全由脚本驱动"的 Buff，不依赖 JSON 配置提供逻辑或数值。
 * 框架通过静态 CONFIG 读取元数据（duration、stackRule 等），
 * 通过 DEFAULT_PARAMS 提供参数默认值，运行时可从 context.config.parameters 覆写。
 *
 * 效果：
 *   - 攻击力 +100（刷新时额外 +20，可累积）
 *   - 暴击率 +20%（刷新时额外 +5%）
 *   - 暴击伤害 +50%
 *   - 防御力 -30%（乘法削弱）
 *   - 每 2 回合损失 5% 当前气血值（狂暴代价）
 */
import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import type { BuffEffectLine } from '@/domain/buff/types'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { StackRule, ControlType, ScriptBuffConfig } from '@/domain/buff/types'
import { EffectType } from '@/domain/skill/types'

export class BerserkBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_berserk'

  /**
   * 自包含配置——框架在注册时读取此属性，存入 BuffScriptRegistry。
   * 调用方 addBuff() 不传或缺省字段时，从此处填充。
   * NOTE: 路径互斥由框架的 PATH 判定保证——有脚本（PATH A）时 effectPlan/JSON attributes
   *       一律不执行，脚本通过 context.addModifier() 自行管理修饰符，无需 selfContained 标记。
   */
  public static readonly CONFIG: ScriptBuffConfig = {
    id: 'buff_berserk',
    name: '狂暴',
    description: '陷入狂暴状态，攻击力大幅提升，但防御力降低，每回合损失气血值',
    duration: 4,
    maxStacks: 1,
    cooldown: 9,
    isPermanent: false,
    stackRule: StackRule.REFRESH,
    controlType: ControlType.NONE,
    selfContained: true,
  }

  /** 参数默认值——运行时可通过 context.config.parameters 覆写 */
  private static readonly DEFAULT_PARAMS = {
    attackBonus: 100,
    selfDamagePercent: 0.05,
    selfDamageInterval: 2, // 每 N 回合触发一次自残
    refreshAttackBonus: 20,
    refreshCritRateBonus: 5,
    defensePenalty: 30,
    critRateBonus: 20,
    critDamageBonus: 50,
  }

  // ==================== 气血周期 ====================

  protected _onApply(context: BuffContext): void {
    this.log(context, '陷入狂暴状态！攻击力大幅提升，但防御力降低')

    const params = this.resolveParams(context)

    this.addModifier(
      context,
      ATTRIBUTE_CODE.attack,
      params.attackBonus,
      ModifierType.ADDITIVE,
    )
    this.addModifier(
      context,
      ATTRIBUTE_CODE.critRate,
      params.critRateBonus,
      ModifierType.ADDITIVE,
    )
    this.addModifier(
      context,
      ATTRIBUTE_CODE.critDamage,
      params.critDamageBonus,
      ModifierType.ADDITIVE,
    )
    // ponytail: 防御削弱用 MULTIPLICATIVE，value 为 -30 → 最终防御 *= 0.7
    this.addModifier(
      context,
      ATTRIBUTE_CODE.defense,
      -params.defensePenalty,
      ModifierType.MULTIPLICATIVE,
    )

    // ponytail: 运行时状态——currentAttackBonus 供 _onRefresh 读取
    context.setVariable('currentAttackBonus', params.attackBonus)
    context.setVariable('currentCritRateBonus', params.critRateBonus)
    // ponytail: 回合计数器用于 _onUpdate 自残检测（回合制，非实时时间）
    context.setVariable('turnsSinceSelfDamage', 0)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '狂暴状态结束，恢复平静')
    // ponytail: 基类 BaseBuffScript.onRemove 已调用 context.removeModifiers()，无需重复
  }

  /**
   * 每回合更新：基于回合计数器的自残检测。
   * this.log 仅记录日志；实际伤害需通过 battleSystem 回调传递。
   */
  protected _onUpdate(context: BuffContext): void {
    const params = this.resolveParams(context)
    const interval = params.selfDamageInterval
    const turnsSince =
      (context.getVariable<number>('turnsSinceSelfDamage') ?? 0) + 1

    if (turnsSince >= interval) {
      this.log(
        context,
        `狂暴的代价：损失 ${(params.selfDamagePercent * 100).toFixed(0)}% 当前气血值`,
      )
      // 通过百分比伤害回调造成自残
      this.triggerEvent(context, EffectType.DEAL_DAMAGE, {
        damagePercent: params.selfDamagePercent,
      })
      context.setVariable('turnsSinceSelfDamage', 0)
    } else {
      context.setVariable('turnsSinceSelfDamage', turnsSince)
    }
  }

  /**
   * 刷新（通过 refreshBuff API 调用，与 StackRule.REFRESH 的 remove+re-apply 不同）。
   * 在此场景下旧修饰符仍存在，因此以增量方式叠加 refreshBonus。
   */
  protected _onRefresh(context: BuffContext): void {
    this.log(context, '狂暴之力进一步增强！')

    const params = this.resolveParams(context)
    const currentAttack =
      context.getVariable<number>('currentAttackBonus') ?? params.attackBonus
    const currentCrit =
      context.getVariable<number>('currentCritRateBonus') ??
      params.critRateBonus

    const newAttack = currentAttack + params.refreshAttackBonus
    const newCrit = currentCrit + params.refreshCritRateBonus

    // ponytail: 增量叠加——只增加 refresh 部分，原有修饰符不变
    this.addModifier(
      context,
      ATTRIBUTE_CODE.attack,
      params.refreshAttackBonus,
      ModifierType.ADDITIVE,
    )
    this.addModifier(
      context,
      ATTRIBUTE_CODE.critRate,
      params.refreshCritRateBonus,
      ModifierType.ADDITIVE,
    )

    context.setVariable('currentAttackBonus', newAttack)
    context.setVariable('currentCritRateBonus', newCrit)

    this.log(
      context,
      `攻击力额外 +${params.refreshAttackBonus}，暴击率 +${params.refreshCritRateBonus}%`,
    )
  }

  public getEffectLines(context: BuffContext): BuffEffectLine[] {
    const params = this.resolveParams(context)
    return [
      {
        text: `每 ${params.selfDamageInterval} 回合损失 ${(params.selfDamagePercent * 100).toFixed(0)}% 当前气血值`,
        kind: 'dot',
      },
    ]
  }

  // ==================== 辅助方法 ====================

  /**
   * 解析参数：优先从 context.config.parameters 读取，否则使用 DEFAULT_PARAMS。
   * 允许 JSON 或技能配置在 parameters 中覆写单个参数值。
   */
  private resolveParams(
    context: BuffContext,
  ): typeof BerserkBuff.DEFAULT_PARAMS {
    const get = <K extends keyof typeof BerserkBuff.DEFAULT_PARAMS>(key: K) =>
      this.getConfigValue(context, key, BerserkBuff.DEFAULT_PARAMS[key])

    return {
      attackBonus: get('attackBonus'),
      selfDamagePercent: get('selfDamagePercent'),
      selfDamageInterval: get('selfDamageInterval'),
      refreshAttackBonus: get('refreshAttackBonus'),
      refreshCritRateBonus: get('refreshCritRateBonus'),
      defensePenalty: get('defensePenalty'),
      critRateBonus: get('critRateBonus'),
      critDamageBonus: get('critDamageBonus'),
    }
  }
}

export const BUFF_ID = BerserkBuff.BUFF_ID
