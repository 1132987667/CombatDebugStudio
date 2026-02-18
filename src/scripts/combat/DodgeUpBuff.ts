import { BaseBuffScript } from '@/scripts/base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

export class DodgeUpBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_dodge_up'

  protected _onApply(context: BuffContext): void {
    this.log(context, '闪避率提升')
    
    // 提升闪避率
    const dodgeBonus = this.getConfigValue(context, 'dodgeBonus', 0.2)
    this.addModifier(context, 'dodgeRate', dodgeBonus, 'ADDITIVE')
    
    context.setVariable('dodgeBonus', dodgeBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '闪避率提升效果结束')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 无需特殊更新逻辑
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '闪避率提升效果刷新')
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = DodgeUpBuff.BUFF_ID
