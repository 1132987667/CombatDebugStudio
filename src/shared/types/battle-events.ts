/**
 * 战斗事件类型定义
 * 为 BattleManager 的事件系统提供类型安全保障
 */

import type { BattleLogEntry } from '@/shared/types/battle-log';
import type { BattleEntity, ParticipantSide } from '@/domain/battle/types';

// 战斗日志事件数据类型
export interface BattleLogEventData {
  battleId: string;
  log: BattleLogEntry;
}

// 伤害动画事件数据类型
export interface DamageAnimationEventData {
  targetId: string;
  damage: number;
  damageType: string;
  isCritical: boolean;
  isHeal: boolean;
}

// 闪避动画事件数据类型
export interface MissAnimationEventData {
  targetId: string;
}

// 战斗结束事件数据类型
export interface BattleEndedEventData {
  winner: ParticipantSide;
}

// Buff 效果事件数据类型
export interface BuffEffectEventData {
  targetId: string;
  buffName: string;
  isPositive: boolean;
}

// 技能效果事件数据类型
export interface SkillEffectEventData {
  sourceId: string;
  targetId: string;
  skillName: string;
  effectType: string;
  damageType: string;
}

// 团队数据变更事件数据类型
export interface TeamDataChangedEventData {
  allyTeam: BattleEntity[];
  enemyTeam: BattleEntity[];
}


export const BattleEventCodes = {
  /** 战斗日志事件 */
  BATTLE_LOG: 'battle-log',
  /** 伤害动画事件 */
  DAMAGE_ANIMATION: 'damage-animation',
  /** 闪避动画事件 */
  MISS_ANIMATION: 'miss-animation',
  /** 战斗结束事件 */
  BATTLE_ENDED: 'battle-ended',
  /** Buff 效果事件 */
  BUFF_EFFECT: 'buff-effect',
  /** 技能效果事件 */
  SKILL_EFFECT: 'skill-effect',
  /** 团队数据变更事件 */
  TEAM_DATA_CHANGED: 'team-data-changed',
  /** 战斗重置事件 */
  BATTLE_RESET: 'battle-reset',
  /** 回合开始事件 */
  TURN_START: 'turnStart',
  /** 回合结束事件 */
  TURN_END: 'turnEnd',
} as const

export type BattleEventCode = (typeof BattleEventCodes)[keyof typeof BattleEventCodes]

export interface BattleEvent {
  eventId: string;
  type: 'action' | 'state_change' | 'turn_start' | 'turn_end' | 'battle_start' | 'battle_end';
  timestamp: number;
  turn: number;
  data: any;
}

// 战斗事件类型映射
export interface BattleEvents {
  [BattleEventCodes.BATTLE_LOG]: BattleLogEventData;
  [BattleEventCodes.DAMAGE_ANIMATION]: DamageAnimationEventData;
  [BattleEventCodes.MISS_ANIMATION]: MissAnimationEventData;
  [BattleEventCodes.BATTLE_ENDED]: BattleEndedEventData;
  [BattleEventCodes.BUFF_EFFECT]: BuffEffectEventData;
  [BattleEventCodes.SKILL_EFFECT]: SkillEffectEventData;
  [BattleEventCodes.TEAM_DATA_CHANGED]: void;
  [BattleEventCodes.BATTLE_RESET]: void;
  [BattleEventCodes.TURN_START]: void;
  [BattleEventCodes.TURN_END]: void;
}

// 战斗事件名称类型
export type BattleEventName = keyof BattleEvents;

// 战斗事件回调类型
export type BattleEventCallback<T extends BattleEventName> = (data: BattleEvents[T]) => void;
