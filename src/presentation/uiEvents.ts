import mitt, { type Emitter } from 'mitt'

/**
 * 跨模块 UI 导航事件（表现层全局单例）。
 * 与战斗领域事件总线（UIEventBus / TriggerEventBus）分离——后者承载战斗触发语义，这里只做模块间导航信号。
 */
/** 封神榜某预设阵容请求在唤灵台加载（payload：lineupId） */
export const OPEN_LINEUP_EVENT = 'fengshen:open-lineup'

/** 唤灵台战报请求在昊天镜分析该战斗（payload：battleId） */
export const OPEN_ANALYSIS_EVENT = 'huanling:open-analysis'

export interface UINavEvents {
  [OPEN_LINEUP_EVENT]: string
  [OPEN_ANALYSIS_EVENT]: string
  // mitt 约束：Emitter<Events> 要求 Events extends Record<EventType, unknown>，必须保留
  [key: string]: unknown
  [key: symbol]: unknown
}

export const uiNavBus: Emitter<UINavEvents> = mitt<UINavEvents>()
