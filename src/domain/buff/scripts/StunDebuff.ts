import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * 眩晕debuff脚本
 * 使目标无法行动，跳过其回合
 */
export class StunDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_stun'

  protected _onApply(context: BuffContext): void {
    this.log(context, '被眩晕了！无法行动')
    
    context.setVariable('isStunned', true)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '眩晕效果消失')
    context.setVariable('isStunned', false)
  }

  protected _onUpdate(context: BuffContext): void {
    // 眩晕状态只阻止行动，不影响其他属性
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '眩晕效果延长！')
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = StunDebuff.BUFF_ID
