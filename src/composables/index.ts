/**
 * Composables 统一导出
 */

// 战斗生命周期
export {
  useBattleLifecycle,
  useRafTimer,
} from '@/composables/useBattleLifecycle'
export type {
  TimerResource,
  LifecycleOptions,
} from '@/composables/useBattleLifecycle'

// 战斗参与者绑定
export {
  useBattleParticipant,
  useBattleParticipants,
} from '@/composables/useBattleParticipant'
export type {
  UseBattleParticipantReturn,
  ParticipantStats,
} from '@/composables/useBattleParticipant'

// 参与者属性访问
export { useParticipantStats } from './useParticipantStats'
export type {
  UseParticipantStatsReturn,
  FormattedAttribute,
  CombatStatType,
} from './useParticipantStats'
export { getStatName, getStatIcon } from './useParticipantStats'
