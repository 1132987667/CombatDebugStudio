import type { BattleEntity, ParticipantSide } from '@/domain/battle/type/types';
import { BattleTriggerPhase } from '@/domain/battle/type/types';
import type {
  DamageCategory,
} from '@/domain/skill/types';
import type { BattleLogEntry } from '@/shared/types/battle-log';
import type { BattleSummary } from '@/shared/types/battle-summary';



/**
 * 动画数据基础接口
 * 所有动画数据的公共属性
 */
export interface BaseEventData {
  /** 动作来源ID（可选） */
  sourceId?: string
  /** 目标ID */
  targetId: string
}

/**
 * 伤害动画数据
 */
export interface DamageEventData extends BaseEventData {
  /** 伤害/治疗值 */
  damage: number
  /** 是否暴击 */
  isCritical: boolean
  /** 伤害大类（physical/elemental/true） */
  damageCategory: DamageCategory
  /** 是否为治疗 */
  isHeal: boolean
}

/**
 * 闪避动画数据
 */
export interface MissEventData extends BaseEventData {
  /** 闪避原因描述（可选） */
  reason?: string
}

/**
 * Buff效果动画数据
 */
export interface BuffEffectEventData extends BaseEventData {
  /** Buff名称 */
  buffName: string
  /** 是否为正面Buff */
  isPositive: boolean
}

/**
 * 技能效果动画数据
 */
export interface SkillEffectEventData extends BaseEventData {
  /** 技能名称 */
  skillName: string
  /** 效果类型 */
  effectType: string
  /** 伤害大类（physical/elemental/true） */
  damageCategory: DamageCategory
}

/** 战斗结束事件数据类型 */
export interface BattleEndedEventData {
  winner: ParticipantSide;
}



/** 战斗日志事件数据类型 */
export interface BattleLogEventData {
  battleId: string;
  log: BattleLogEntry;
}

/** 团队数据变更事件数据类型 */
export interface TeamDataChangedEventData {
  allyTeam: BattleEntity[];
  enemyTeam: BattleEntity[];
}


/** 战斗事件类型映射 */
export interface BattleEvents {
  [BattleEventCodes.BATTLE_LOG]: BattleLogEventData;
  [BattleEventCodes.DAMAGE_ANIMATION]: DamageEventData;
  [BattleEventCodes.MISS_ANIMATION]: MissEventData;
  [BattleEventCodes.BATTLE_START]: void;
  [BattleEventCodes.BATTLE_ENDED]: BattleEndedEventData;
  [BattleEventCodes.BUFF_EFFECT]: BuffEffectEventData;
  [BattleEventCodes.SKILL_EFFECT]: SkillEffectEventData;
  [BattleEventCodes.TEAM_DATA_CHANGED]: TeamDataChangedEventData;
  [BattleEventCodes.BATTLE_RESET]: void;
  [BattleEventCodes.TURN_START]: { actorId: string | null };
  [BattleEventCodes.TURN_END]: void;
  [BattleEventCodes.CURRENT_ACTOR_CHANGED]: { actorId: string | null };
  [BattleEventCodes.DEBUG_PAUSE]: { phase: string };
  [BattleEventCodes.DEBUG_PAUSE_RESUME]: void;
  [BattleEventCodes.DEBUG_TOGGLE]: { enabled: boolean };
  [BattleEventCodes.PARTICIPANT_ATTRIBUTE_CHANGED]: { characterId: string };
  // 自定义事件（不在 BattleEventCodes 枚举中，但由 mitt 全局发送）
  'teamDataChanged': void;
  'battle-summary': BattleSummary;
  // mitt 约束：需要字符串和符号索引签名
  [key: string]: unknown;
  [key: symbol]: unknown;
}

/** 战斗事件名称类型 */
export type BattleEventName = keyof BattleEvents;

/** 战斗事件回调类型 */
export type BattleEventCallback<T extends BattleEventName> = (data: BattleEvents[T]) => void;



export const BattleEventCodes = {
  /** 战斗日志事件 */
  BATTLE_LOG: 'battle-log',
  /** 伤害动画事件 */
  DAMAGE_ANIMATION: 'damage-animation',
  /** 闪避动画事件 */
  MISS_ANIMATION: 'miss-animation',
  /** 战斗开始事件 */
  BATTLE_START: BattleTriggerPhase.BATTLE_START,
  /** 战斗结束事件 */
  BATTLE_ENDED: BattleTriggerPhase.BATTLE_END,
  /** Buff 效果事件 */
  BUFF_EFFECT: 'buff-effect',
  /** 技能效果事件 */
  SKILL_EFFECT: 'skill-effect',
  /** 团队数据变更事件 */
  TEAM_DATA_CHANGED: 'team-data-changed',
  /** 战斗重置事件 */
  BATTLE_RESET: 'battle-reset',
  /** 回合开始事件 */
  TURN_START: BattleTriggerPhase.TURN_START,
  /** 回合结束事件 */
  TURN_END: BattleTriggerPhase.TURN_END,
  /** 当前行动者切换事件（角色循环内，非回合开始） */
  CURRENT_ACTOR_CHANGED: 'current-actor-changed',
  /** 调试模式暂停 */
  DEBUG_PAUSE: 'debug-pause',
  /** 调试模式继续 */
  DEBUG_PAUSE_RESUME: 'debug-pause-resume',
  /** 调试模式开关切换 */
  DEBUG_TOGGLE: 'debug-toggle',
  /** 参与者属性变更事件（Buff 触发 recalculateAll 后发射） */
  PARTICIPANT_ATTRIBUTE_CHANGED: 'participant-attribute-changed',
} as const

export type BattleEventCode = (typeof BattleEventCodes)[keyof typeof BattleEventCodes]

