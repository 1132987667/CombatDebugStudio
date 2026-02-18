/**
 * 战斗事件类型定义
 * 为 BattleManager 的事件系统提供类型安全保障
 */

import type { BattleLogEntry } from '@/types/battle-log';
import type { BattleParticipant, ParticipantSide } from '@/types/battle';

// 战斗日志事件数据类型
export interface BattleLogEventData {
  battleId: string;
  log: BattleLogEntry;
}

// 战斗状态更新事件数据类型
export interface BattleStateUpdateEventData {
  battleId: string;
  participants: BattleParticipant[];
  turnOrder: string[];
  currentTurn: number;
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

// Buff效果事件数据类型
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

// 战斗事件类型映射
export interface BattleEvents {
  'battle-log': BattleLogEventData;
  'battle-state-update': BattleStateUpdateEventData;
  'damage-animation': DamageAnimationEventData;
  'miss-animation': MissAnimationEventData;
  'battle-ended': BattleEndedEventData;
  'buff-effect': BuffEffectEventData;
  'skill-effect': SkillEffectEventData;
}

// 战斗事件名称类型
export type BattleEventName = keyof BattleEvents;

// 战斗事件回调类型
export type BattleEventCallback<T extends BattleEventName> = (data: BattleEvents[T]) => void;
