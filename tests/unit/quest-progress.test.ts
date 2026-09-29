/**
 * questProgress.test.ts — 任务进度推进逻辑（任务子系统接线，AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖：按 kind 推进、达成封顶、clear_scene 的 sceneId 匹配、无 goal 任务不受影响、非法量 no-op。
 * NOTE: quests 是 xiyouData 模块级 reactive 单例，每个用例改动后必须恢复初始值防跨用例污染；
 *       battle_win/kill_count/无 goal 的 kind 由测试内 fixture 提供（日常/周常已按单机定位删除）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { progressQuests, questCompleted } from '@/presentation/modules/yanjie/xiyou/questProgress'
import { quests } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import type { XiyouQuest } from '@/presentation/modules/yanjie/xiyou/types'

const FIXTURE_QUESTS: XiyouQuest[] = [
  { id: 't_battle', type: '主线', name: '战斗fixture', desc: '', progress: 0, target: 3, reward: '', goal: { kind: 'battle_win', target: 3 } },
  { id: 't_kill', type: '主线', name: '击杀fixture', desc: '', progress: 0, target: 50, reward: '', goal: { kind: 'kill_count', target: 50 } },
  { id: 't_static', type: '主线', name: '纯展示fixture', desc: '', progress: 0, target: 1, reward: '' },
]

const fixtureCount = FIXTURE_QUESTS.length

function byId(id: string) {
  const q = quests.find((x) => x.id === id)
  if (!q) throw new Error(`quest ${id} not found`)
  return q
}

/** 快照/恢复全部任务的运行时态（进度 + 领取态），并摘除测试注入的 fixture */
let snapshot: Array<{ progress: number; claimed?: boolean }> = []
beforeEach(() => {
  snapshot = quests.map((q) => ({ progress: q.progress, claimed: q.claimed }))
  quests.push(...FIXTURE_QUESTS.map((f) => ({ ...f, goal: f.goal ? { ...f.goal } : undefined })))
  return () => {
    quests.splice(quests.length - fixtureCount, fixtureCount)
    for (let i = 0; i < quests.length; i++) {
      quests[i].progress = snapshot[i].progress
      quests[i].claimed = snapshot[i].claimed
    }
  }
})

describe('progressQuests（按 kind 推进）', () => {
  it('battle_win 推进战斗类任务，不影响其他 kind', () => {
    const battle = byId('t_battle')
    const main = byId('q_main_01')
    progressQuests('battle_win')
    expect(battle.progress).toBe(1)
    expect(main.progress).toBe(0)
  })

  it('达成后封顶：progress 不越过 target', () => {
    const battle = byId('t_battle')
    progressQuests('battle_win', 99)
    expect(battle.progress).toBe(battle.target)
    progressQuests('battle_win', 5)
    expect(battle.progress).toBe(battle.target)
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
    const staticQuest = byId('t_static')
    progressQuests('battle_win', 10)
    progressQuests('kill_count', 10)
    expect(staticQuest.progress).toBe(0)
  })

  it('kill_count 按击杀数一次推进多格；amount<=0 为 no-op', () => {
    const kill = byId('t_kill')
    progressQuests('kill_count', 12)
    expect(kill.progress).toBe(12)
    progressQuests('kill_count', 0)
    progressQuests('kill_count', -3)
    expect(kill.progress).toBe(12)
  })
})

describe('questCompleted', () => {
  it('进度达标判定', () => {
    expect(questCompleted({ progress: 3, target: 3 })).toBe(true)
    expect(questCompleted({ progress: 2, target: 3 })).toBe(false)
  })
})
