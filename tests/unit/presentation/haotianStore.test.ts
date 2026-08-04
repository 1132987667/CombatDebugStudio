// @vitest-environment happy-dom
/**
 * 文件: haotianStore.test.ts
 * 功能: 昊天镜 store 状态机测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 存档装配、书签、断点、会话导入往返、流过滤
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHaotianStore } from '@/presentation/modules/haotian/stores/haotianStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('haotianStore（演示存档装配）', () => {
  it('loadDemo 装配存档 / 校验 / 索引 / 调试树', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    expect(s.archive?.battleId).toBe('BT-9527')
    expect(s.validation?.errors).toEqual([])
    expect(s.evs).toHaveLength(20)
    expect(s.debugNodes.some((n) => n.action)).toBe(true)
    expect(s.currentTurn).toBe(0)
  })

  it('书签切换与计数', () => {
    const s = useHaotianStore()
    s.toggleBookmark('ev05')
    expect(s.bookmarkCount).toBe(1)
    expect(s.isBookmarked('ev05')).toBe(true)
    s.toggleBookmark('ev05')
    expect(s.bookmarkCount).toBe(0)
  })

  it('断点列表：添加 / 启停 / 清除', () => {
    const s = useHaotianStore()
    s.addBreakpoint('damage', 150)
    expect(s.breakpoints).toHaveLength(1)
    expect(s.breakpoints[0].type).toBe('damage')
    expect(s.breakpoints[0].value).toBe(150)
    expect(s.bpArmed).toBe(true)
    s.toggleBreakpoint(s.breakpoints[0].id)
    expect(s.bpArmed).toBe(false)
    s.addBreakpoint('level', 'warn')
    expect(s.bpArmed).toBe(true)
    s.clearBreakpoints()
    expect(s.breakpoints).toHaveLength(0)
    expect(s.bpArmed).toBe(false)
  })

  it('会话导入往返（书签/断点/模式/过滤）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const session = {
      app: 'haotian',
      version: 1,
      battleId: 'BT-9527',
      mode: 'debug',
      selectedId: 'ev05',
      bookmarks: ['ev05', 'ev07'],
      breakpoint: { type: 'damage', value: 200 },
      bpArmed: true,
      showDbg: true,
      streamText: '暴击',
    }
    const file = new File([JSON.stringify(session)], 'session.json', { type: 'application/json' })
    await s.importSession(file)

    expect(s.bookmarkCount).toBe(2)
    // v1 会话迁移：单断点 → 断点数组（enabled 取原 bpArmed）
    expect(s.breakpoints).toHaveLength(1)
    expect(s.breakpoints[0].type).toBe('damage')
    expect(s.breakpoints[0].value).toBe(200)
    expect(s.breakpoints[0].enabled).toBe(true)
    expect(s.bpArmed).toBe(true)
    expect(s.showDbg).toBe(true)
    expect(s.streamText).toBe('暴击')
    expect(s.mode).toBe('debug')
    expect(s.selectedId).toBe('ev05')
  })

  it('非法会话文件被拒绝', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const file = new File([JSON.stringify({ app: 'evil' })], 'bad.json', { type: 'application/json' })
    await s.importSession(file)
    expect(s.bookmarkCount).toBe(0)
  })

  it('流搜索过滤', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const total = s.evs.length
    s.streamText = '暴击'
    expect(s.filteredEvents.length).toBeGreaterThan(0)
    expect(s.filteredEvents.length).toBeLessThan(total)
    s.streamText = '不存在的关键词zz'
    expect(s.filteredEvents).toHaveLength(0)
  })
})

describe('pnameSide（摘要导出/面板单位名 — 带阵营前缀，与日志口径一致）', () => {
  it('demo 存档：ally/enemy 单位带 [友方]/[敌方] 前缀', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    expect(s.pnameSide('u1')).toBe('[友方]火护法')
    expect(s.pnameSide('u2')).toBe('[敌方]金护法')
  })

  it('未知 id 回退原样；side 缺失的旧档回退纯名字（不误标阵营）', () => {
    const s = useHaotianStore()
    s.archive = {
      battleId: 't1',
      replayId: 'r1',
      version: '1',
      randomSeed: 'x',
      startTime: 0,
      initialState: {
        participants: [
          { id: 'a', name: '甲', side: 'ally' },
          { id: 'b', name: '乙' }, // 缺 side（老档迁移）
        ],
      },
      events: [],
    } as never
    expect(s.pnameSide('a')).toBe('[友方]甲')
    expect(s.pnameSide('b')).toBe('乙')
    expect(s.pnameSide('ghost')).toBe('ghost')
  })
})
