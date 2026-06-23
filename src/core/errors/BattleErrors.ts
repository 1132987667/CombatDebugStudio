/**
 * @deprecated 请使用 '@/domain/kernel/exceptions/BattleErrors' 替代。此文件将在 Phase 8 中删除。
 */
export {
  BattleErrorCode,
  BattleError,
  BattleNotFoundError,
  ParticipantNotFoundError,
  InvalidActionError,
  SkillNotFoundError,
  InsufficientResourcesError,
  isBattleError,
  tryCatchBattleError,
  asyncTryCatch,
} from '@/domain/kernel/exceptions/BattleErrors'
