/**
 * questProgress.test.ts — 任务进度推进逻辑（任务子系统接线，AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖：clear_scene 的 sceneId 匹配、达成封顶、无 goal 任务不受影响、非法量 no-op。
 * NOTE: quests 是 xiyouData 模块级 reactive 单例，每个用例改动后必须恢复初始值防跨用例污染；
 *       日常/周常及 battle_win/kill_count/purchase/brew 推进源已按单机定位删除。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { progressQuests, questCompleted } from '@/presentation/modules/yanjie/xiyou/questProgress'
import { quests } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import type { XiyouQuest } from '@/presentation/modules/yanjie/xiyou/types'

const FIXTURE_QUESTS: XiyouQuest[] = [
  { id: 't_scene', type: '主线', name: '通关fixture', desc: '', progress: 0, target: 2, reward: '', goal: { kind: 'clear_scene', target: 2, sceneId: 'scene_fixture' } },
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

describe('progressQuests（clear_scene 推进）', () => {
  it('clear_scene 仅推进 sceneId 匹配的任务，另一关任务不动', () => {
    const main1 = byId('q_main_01')
    const main2 = byId('q_main_02')
    progressQuests('clear_scene', 1, { sceneId: 'scene_1_boss' })
    expect(main1.progress).toBe(1)
    expect(main2.progress).toBe(0)
    progressQuests('clear_scene', 1, { sceneId: 'scene_2_boss' })
    expect(main2.progress).toBe(1)
  })

  it('达成后封顶：progress 不越过 target', () => {
    const fixture = byId('t_scene')
    progressQuests('clear_scene', 99, { sceneId: 'scene_fixture' })
    expect(fixture.progress).toBe(fixture.target)
    progressQuests('clear_scene', 5, { sceneId: 'scene_fixture' })
    expect(fixture.progress).toBe(fixture.target)
  })

  it('clear_scene 不带 sceneId 时不推进（严格语义：通关必须指明关卡，防误推进）', () => {
    const main1 = byId('q_main_01')
    progressQuests('clear_scene')
    expect(main1.progress).toBe(0)
  })

  it('无 goal 的纯展示任务不受任何推进影响', () => {
    const staticQuest = byId('t_static')
    progressQuests('clear_scene', 10, { sceneId: 'scene_fixture' })
    expect(staticQuest.progress).toBe(0)
  })

  it('amount<=0 为 no-op（0 是合法业务值，不得误推进）', () => {
    const fixture = byId('t_scene')
    progressQuests('clear_scene', 0, { sceneId: 'scene_fixture' })
    progressQuests('clear_scene', -3, { sceneId: 'scene_fixture' })
    expect(fixture.progress).toBe(0)
  })
})

describe('questCompleted', () => {
  it('进度达标判定', () => {
    expect(questCompleted({ progress: 3, target: 3 })).toBe(true)
    expect(questCompleted({ progress: 2, target: 3 })).toBe(false)
  })
})

describe('progressQuests（新手引导推进源）', () => {
  // 直接用 quest.json 的 q_intro_*（配置即夹具），不动 quests 数组结构避免与顶层快照钩子嵌套
  const intro = (id: string) => byId(id)

  beforeEach(() => {
    for (const q of quests) {
      if (q.id?.startsWith('q_intro_')) q.progress = 0
    }
  })

  it('穿装备推进 equip_gear，不影响加点/打造任务', () => {
    progressQuests('equip_gear', 1)
    expect(intro('q_intro_01').progress).toBe(1)
    expect(intro('q_intro_02').progress).toBe(0)
    expect(intro('q_intro_03').progress).toBe(0)
  })

  it('加点逐次推进 alloc_stat，封顶 target', () => {
    progressQuests('alloc_stat', 2)
    expect(intro('q_intro_02').progress).toBe(2)
    progressQuests('alloc_stat', 2)
    expect(intro('q_intro_02').progress).toBe(3)
  })

  it('打造推进 forge_gear', () => {
    progressQuests('forge_gear', 1)
    expect(intro('q_intro_03').progress).toBe(1)
  })

  it('clear_scene 不误推进引导任务（kind 隔离）', () => {
    progressQuests('clear_scene', 5, { sceneId: 'scene_fixture' })
    expect(intro('q_intro_01').progress).toBe(0)
    expect(intro('q_intro_02').progress).toBe(0)
    expect(intro('q_intro_03').progress).toBe(0)
  })
})
