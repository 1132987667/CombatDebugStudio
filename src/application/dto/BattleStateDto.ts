/**
 * 战斗状态数据传输对象
 * 用于应用层与表现层之间的数据传递
 */
import type { BattleEntity, BattleAction } from '@/domain/battle/types';
import type { BattleStatus, ParticipantSide } from '@/domain/battle/types';

export interface BattleState {
  battleId: string
  participants: Map<string, BattleEntity>
  actions: BattleAction[]
  /** 回合顺序，按速度规则排序 */
  turnOrder: string[]
  /** 当前行动次序索引，0-based，表示当前回合内的第几个行动 */
  currentTurn: number
  /** 当前回合数（1-based，从 1 开始） */
  currentRound: number
  /** 战斗状态 */
  battleState: BattleStatus
  startTime: number
  endTime?: number
  winner?: ParticipantSide
}
