/**
 * questProgress.ts — 任务进度推进（任务子系统接线）
 *
 * 推进源（调用方）：战斗胜利/击杀计数（BattleZen 结算）、关卡通关（BattleZen finishRun）、
 * 坊市购买（packStore.purchase）、炼丹（AlchemyPanel.brew）。
 * 进度直接写在 xiyouData.quests 的响应式对象上（QuestPanel 免桥接），存档经 save-bridge 持久化。
 * NOTE: 本模块只 import 数据层（xiyouData/types），供 packStore 等 store 反向依赖而不成环；
 *       奖励发放（需 playerStore/packStore）由 QuestPanel 领取时执行。
 */
import type { QuestGoalKind } from './types'
import { quests } from './xiyouData'

/** 推进匹配目标类型的所有未达成任务；clear_scene 仅当 meta.sceneId 与 goal.sceneId 一致时推进 */
export function progressQuests(kind: QuestGoalKind, amount = 1, meta?: { sceneId?: string }): void {
  if (amount <= 0) return
  for (const q of quests) {
    const goal = q.goal
    if (!goal || goal.kind !== kind || q.progress >= goal.target) continue
    if (kind === 'clear_scene' && goal.sceneId && meta?.sceneId !== goal.sceneId) continue
    q.progress = Math.min(goal.target, q.progress + amount)
  }
}

/** 任务是否达成（供领取校验 / UI 判定） */
export function questCompleted(q: { progress: number; target: number }): boolean {
  return q.progress >= q.target
}
