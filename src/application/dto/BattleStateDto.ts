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
  /** 鍥炲悎椤哄簭锛屾寜閫熷害瑙勫垯鎺掑簭 */
  turnOrder: string[]
  /** 褰撳墠琛屽姩娆″簭绱㈠紩锛?-based锛岃〃绀哄綋鍓嶅洖鍚堝唴鐨勭鍑犱釜琛屽姩锛?*/
  currentTurn: number
  /** 褰撳墠鍥炲悎鏁帮紙1-based锛屼粠 1 寮€濮嬶級 */
  currentRound: number
  /** 鎴樻枟鐘舵€?*/
  battleState: BattleStatus
  startTime: number
  endTime?: number
  winner?: ParticipantSide
}
