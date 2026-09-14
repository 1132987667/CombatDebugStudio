/**
 * questProgress.test.ts — 任务进度推进逻辑（任务子系统接线，AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖：按 kind 推进、达成封顶、clear_scene 的 sceneId 匹配、无 goal 任务不受影响、非法量 no-op。
 * NOTE: quests 是 xiyouData 模块级 reactive 单例，每个用例改动后必须恢复初始值防跨用例污染。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { progressQuests, questCompleted } from '@/presentation/modules/yanjie/xiyou/questProgress'
import { quests } from '@/presentation/modules/yanjie/xiyou/xiyouData'

function byId(id: string) {
  const q = quests.find((x) => x.id === id)
  if (!q) throw new Error(`quest ${id} not found`)
  return q
}

/** 快照/恢复全部任务的运行时态（进度 + 领取态） */
let snapshot: Array<{ progress: number; claimed?: boolean }> = []
beforeEach(() => {
  snapshot = quests.map((q) => ({ progress: q.progress, claimed: q.claimed }))
  return () => {
    for (let i = 0; i < quests.length; i++) {
      quests[i].progress = snapshot[i].progress
      quests[i].claimed = snapshot[i].claimed
    }
  }
})

describe('progressQuests（按 kind 推进）', () => {
  it('battle_win 推进战斗类任务，不影响其他 kind', () => {
    const daily = byId('q_daily_01')
    const main = byId('q_main_01')
    progressQuests('battle_win')
    expect(daily.progress).toBe(1)
    expect(main.progress).toBe(0)
  })

  it('达成后封顶：progress 不越过 target', () => {
    const daily = byId('q_daily_01')
    progressQuests('battle_win', 99)
    expect(daily.progress).toBe(daily.target)
    progressQuests('battle_win', 5)
    expect(daily.progress).toBe(daily.target)
  })

  it('clear_scene 仅推进 sceneId 匹配的任务，另一关任务不动', () => {
    const main1 = byId('q_main_01')
    const main2 = byId('q_main_02')
    progressQuests('clear_scene', 1, { sceneId: 'scene_1_boss' })
    expect(main1.progress).toBe(1)
    expect(main2.progress).toBe(0)
    progressQuests('clear_scene', 1, { sceneId: 'scene_2_boss' })
    expect(main2.progress).toBe(1)
  })

  it('clear_scene 不带 sceneId 时不推进（严格语义：通关必须指明关卡，防误推进）', () => {
    const main1 = byId('q_main_01')
    progressQuests('clear_scene')
    expect(main1.progress).toBe(0)
  })

  it('无 goal 的纯展示任务不受任何推进影响', () => {
    const staticQuest = byId('q_daily_02')
    progressQuests('battle_win', 10)
    progressQuests('kill_count', 10)
    expect(staticQuest.progress).toBe(0)
  })

  it('kill_count 按击杀数一次推进多格；amount<=0 为 no-op', () => {
    const week = byId('q_week_01')
    progressQuests('kill_count', 12)
    expect(week.progress).toBe(12)
    progressQuests('kill_count', 0)
    progressQuests('kill_count', -3)
    expect(week.progress).toBe(12)
  })
})

describe('questCompleted', () => {
  it('进度达标判定', () => {
    expect(questCompleted({ progress: 3, target: 3 })).toBe(true)
    expect(questCompleted({ progress: 2, target: 3 })).toBe(false)
  })
})
