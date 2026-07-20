/**
 * 事件总线
 * 从 src/main.ts 抽取而来，解决领域层反向依赖 presentation 入口的问题
 */
import mitt from 'mitt'
import type { BattleEvents } from '@/domain/battle/type/BattleEventType'

export const eventBus = mitt<BattleEvents>()
