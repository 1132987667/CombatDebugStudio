/**
 * @deprecated 请使用 '@/domain/battle/aggregate/BattleState' 替代。此文件将在 Phase 8 中删除。
 */
export {
  createDefaultBattleData,
  convertToBattleState,
  BattleEndCheckResult,
  checkBattleEndCondition,
  isBattleActive,
  isBattlePaused,
  isBattleEnded,
} from '@/domain/battle/aggregate/BattleState'
