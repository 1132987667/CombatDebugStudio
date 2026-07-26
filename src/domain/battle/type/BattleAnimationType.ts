import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import type {
  DamageEventData,
  MissEventData,
  BuffEffectEventData,
  SkillEffectEventData,
} from '@/domain/battle/type/BattleEventType'

/**
 * 动画类型联合类型
 * 定义所有支持的动画事件类型
 */
export type AnimationType =
  | typeof BattleEventCodes.DAMAGE_ANIMATION
  | typeof BattleEventCodes.MISS_ANIMATION
  | typeof BattleEventCodes.BUFF_EFFECT
  | typeof BattleEventCodes.SKILL_EFFECT
  | typeof BattleEventCodes.ANIMATION_COMPLETE

/**
 * 动画数据联合类型
 */
export type AnimationData =
  | DamageEventData
  | MissEventData
  | BuffEffectEventData
  | SkillEffectEventData

/**
 * 动画队列项接口
 * 定义动画队列中每个动画项的结构
 */
export interface AnimationQueueItem {
  /** 动画类型 */
  type: AnimationType
  /** 动画数据 */
  data: AnimationData
  /** 动画持续时间（毫秒） */
  duration: number
  /** Promise 解析函数，动画完成时调用 */
  resolve: () => void
}