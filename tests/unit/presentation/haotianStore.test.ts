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

  it('none 断点（手动暂停）：可添加、暂停播放、不视为条件断点武装（问题 7）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.play()
    expect(s.playback.playing).toBe(true)
    // 手动暂停断点：配置即暂停（参考 HTML setPaused 语义）
    s.addBreakpoint('none', undefined)
    expect(s.breakpoints).toHaveLength(1)
    expect(s.breakpoints[0].type).toBe('none')
    expect(s.playback.playing).toBe(false)
    // 不视为条件断点武装（bpArmed 只统计条件类）
    expect(s.bpArmed).toBe(false)
    s.clearBreakpoints()
  })

  it('单步前进命中断点：暂停并定位到断点事件，不再穿过（问题 8）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.addBreakpoint('damage', 100)
    // 从 t=0 逐事件前进 ev01→ev02→ev03→ev04→ev05（113≥100 命中）
    for (let i = 0; i < 5; i++) s.stepEvent(1)
    expect(s.selectedId).toBe('ev05')
    expect(s.playback.playing).toBe(false)
    // 命中后不穿过：下一次单步继续走到 ev06
    s.stepEvent(1)
    expect(s.selectedId).toBe('ev06')
  })

  it('单步前进未命中断点：正常步进不暂停（问题 8）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.addBreakpoint('damage', 9999) // 永不命中
    s.stepEvent(1)
    s.stepEvent(1)
    expect(s.selectedId).toBe('ev02')
    expect(s.playback.playing).toBe(false)
  })

  it('watch 断点：单步命中只计数不暂停，步进继续（问题 8 余项）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.addBreakpoint('damage', 100)
    const bpId = s.breakpoints[0].id
    s.toggleBreakpointWatch(bpId)
    expect(s.breakpoints[0].watch).toBe(true)
    // 逐事件前进 ev01→…→ev05（113≥100 命中 watch）
    for (let i = 0; i < 5; i++) s.stepEvent(1)
    expect(s.breakpointHits[bpId]).toBe(1)
    // watch 命中不暂停、不移动选中（仍是上次正常步进的事件）
    expect(s.playback.playing).toBe(false)
    expect(s.selectedId).toBe('ev05')
    // 不卡在断点上：继续单步到 ev06
    s.stepEvent(1)
    expect(s.selectedId).toBe('ev06')
    expect(s.breakpointHits[bpId]).toBe(1) // 计数不重复
  })

  it('watch 断点：多次命中计数累加（ev05 113 / ev18 306）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.addBreakpoint('damage', 100)
    const bpId = s.breakpoints[0].id
    s.toggleBreakpointWatch(bpId)
    let guard = 0
    while (s.playback.t < s.duration && guard < 200) {
      s.stepEvent(1)
      guard++
    }
    expect(s.breakpointHits[bpId]).toBe(2)
  })

  it('watch 与非 watch 同时命中：仍暂停定位，两者都计数', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.addBreakpoint('damage', 100) // watch
    s.toggleBreakpointWatch(s.breakpoints[0].id)
    s.addBreakpoint('damage', 113) // 非 watch（ev05 113 恰好命中两者）
    const watchBp = s.breakpoints.find((b) => b.watch)!
    const pauseBp = s.breakpoints.find((b) => !b.watch)!
    for (let i = 0; i < 5; i++) s.stepEvent(1) // ev05 同时命中两者
    expect(s.selectedId).toBe('ev05')
    expect(s.playback.playing).toBe(false)
    expect(s.breakpointHits[watchBp.id]).toBe(1)
    expect(s.breakpointHits[pauseBp.id]).toBe(1)
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

  it('跨战斗会话导入：不再整包拒绝，断点/过滤应用，书签按当前存档过滤（问题 9）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const session = {
      app: 'haotian',
      version: 2,
      battleId: 'OTHER_BATTLE', // 与当前存档 BT-9527 不匹配
      mode: 'replay',
      selectedId: 'ev05', // 存在 → 应应用
      bookmarks: ['ev05', 'ghost_id'], // ev05 有效，ghost_id 被过滤
      breakpoints: [{ id: 'bp_x', type: 'damage', value: 100, enabled: true }],
      showDbg: true,
      streamText: '暴击',
    }
    const file = new File([JSON.stringify(session)], 'session.json', { type: 'application/json' })
    await s.importSession(file)

    // 断点 / 过滤 / 模式跨战斗仍应用
    expect(s.breakpoints).toHaveLength(1)
    expect(s.breakpoints[0].value).toBe(100)
    expect(s.showDbg).toBe(true)
    expect(s.streamText).toBe('暴击')
    expect(s.mode).toBe('replay')
    // 书签只保留当前存档存在的 id
    expect(s.isBookmarked('ev05')).toBe(true)
    expect(s.isBookmarked('ghost_id')).toBe(false)
    // 选中事件有效则定位
    expect(s.selectedId).toBe('ev05')
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

  it('selectedTarget / selectedActor：选中事件的 目标/行动 角色（初始参与者快照）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    // ev05：火护法(u1) 攻击 金护法(u2)
    s.selectEvent('ev05')
    expect(s.selectedActor?.id).toBe('u1')
    expect(s.selectedTarget?.id).toBe('u2')
    expect(s.selectedActor?.attributes).toMatchObject({ attack: 65 })
    // 无 sourceId/targetId 的事件 → 对应角色为 null
    s.selectEvent('ev02') // turn_flow
    expect(s.selectedActor).toBeNull()
    expect(s.selectedTarget).toBeNull()
  })

  it('selectedTarget：事件无 targetId 时从同链 damage/heal 推断目标（真实录制 action_execution 兜底）', async () => {
    const s = useHaotianStore()
    const archive = {
      battleId: 't', replayId: 'r', version: '2.0.0', randomSeed: '0', startTime: 0,
      initialState: {
        participants: [
          { id: 'a', name: '甲', maxHp: 100, hp: 100, maxEnergy: 100, energy: 100, attributes: { attack: 10 } },
          { id: 'b', name: '乙', maxHp: 100, hp: 100, maxEnergy: 100, energy: 100, attributes: { attack: 20 } },
        ],
      },
      events: [
        { id: 'e1', phase: 'action_execution', correlationId: 'c1', timestamp: 0, sourceId: 'a', payload: { actionType: 'attack' }, summary: '甲 执行行动' },
        { id: 'e2', phase: 'damage_calculation', correlationId: 'c1', parentId: 'e1', timestamp: 10, sourceId: 'a', targetId: 'b', payload: { result: 30 }, summary: 'x' },
      ],
    }
    await s.loadArchiveFile(new File([JSON.stringify(archive)], 't.json', { type: 'application/json' }))
    s.selectEvent('e1') // action_execution 无 targetId → 从同链 e2 推断目标乙
    expect(s.selectedTarget?.id).toBe('b')
    expect(s.selectedTarget?.name).toBe('乙')
    expect(s.selectedActor?.id).toBe('a')
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

describe('winnerLabel（胜方翻译 — 与实时战报弹窗口径一致，修复 winner=side 显示原文）', () => {
  it('side 值翻译为 友方/敌方；unit id 带阵营前缀；未知回退原样', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    expect(s.winnerLabel('ally')).toBe('友方')
    expect(s.winnerLabel('enemy')).toBe('敌方')
    // unit id（demo 形态）走 pnameSide：带阵营前缀
    expect(s.winnerLabel('u1')).toBe('[友方]火护法')
    expect(s.winnerLabel('ghost')).toBe('ghost')
  })

  it('summaryMarkdown 导出：真实录制形态（winner=ally）显示 友方', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.archive = { ...s.archive!, winner: 'ally' }
    expect(s.summaryMarkdown()).toContain('- 胜方：友方')
  })

  it('summaryMarkdown 导出：demo（winner=u1）显示 [友方]火护法（保持现有格式）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    expect(s.summaryMarkdown()).toContain('- 胜方：[友方]火护法')
  })

  it('summaryMarkdown 导出：含 L5 技能 / L6 被动 / L7 关键事件（完整七层报告）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const md = s.summaryMarkdown()
    // L5 技能：demo 无 skillName 归"未标记技能"，5 次伤害 572
    expect(md).toContain('### 技能使用')
    expect(md).toContain('| 未标记技能 | 5 | 572 |')
    // L6 被动：复仇怒火触发 1 次
    expect(md).toContain('### 被动触发')
    expect(md).toContain('| 复仇怒火 | 火护法 | 1 |')
    // L7 关键事件：最高单次 306
    expect(md).toContain('### 关键事件')
    expect(md).toContain('306')
  })
})

describe('链内导航（chainEvents / stepInChain — 同 correlationId 事件穿梭）', () => {
  it('chainEvents 返回同链全部事件（含根与子事件，按时间排序）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.selectEvent('ev05') // corr_1_1（火护法普通攻击：行动→3 段伤害→buff）
    const chain = s.chainEvents
    expect(chain.map((c) => c.id)).toEqual(['ev04', 'ev05', 'ev06', 'ev07', 'ev08'])
    // 全部同 correlationId
    expect(chain.every((c) => c.correlationId === 'corr_1_1')).toBe(true)
  })

  it('stepInChain 在同链事件间循环移动', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.selectEvent('ev05')
    s.stepInChain(1) // 后一条
    expect(s.selectedId).toBe('ev06')
    s.stepInChain(1)
    expect(s.selectedId).toBe('ev07')
    s.stepInChain(-1) // 前一条
    expect(s.selectedId).toBe('ev06')
    // 链尾循环到链首
    s.selectEvent('ev08')
    s.stepInChain(1)
    expect(s.selectedId).toBe('ev04')
  })

  it('单事件链 stepInChain 不抛错且不改变选中', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    s.selectEvent('ev00') // corr_root 仅 1 个事件
    s.stepInChain(1)
    expect(s.selectedId).toBe('ev00')
    // 不存在的事件 selectEvent 无效，选中保持
    s.selectEvent('ghost')
    expect(s.selectedId).toBe('ev00')
    expect(s.chainEvents.map((c) => c.id)).toEqual(['ev00'])
  })
})

describe('深链增强（#m=&s=&b=&e=：携带来源/战斗，打开时按来源加载存档）', () => {
  it('syncHash 携带来源与 battleId（s/b/e 三段）', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const hash = s.syncHash()
    expect(hash).toContain('#m=debug')
    expect(hash).toContain('&s=demo')
    expect(hash).toContain('&b=BT-9527')
  })

  it('applyDeepLink：深链指定 s=demo 且未加载时自动载入演示存档', async () => {
    const s = useHaotianStore()
    location.hash = '#m=debug&s=demo&b=BT-9527&e=ev05'
    const ok = await s.applyDeepLink()
    expect(ok).toBe(true)
    expect(s.archive?.battleId).toBe('BT-9527')
    expect(s.selectedId).toBe('ev05')
    expect(s.sourceKey).toBe('demo')
    location.hash = ''
  })

  it('applyDeepLink：深链指定 s=demo 但当前已加载同一来源时不再重复加载', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    location.hash = '#m=debug&s=demo&b=BT-9527&e=ev07'
    const ok = await s.applyDeepLink()
    expect(ok).toBe(true)
    expect(s.selectedId).toBe('ev07')
    location.hash = ''
  })

  it('applyDeepLink：无深链时快速返回 false 且不加载存档', async () => {
    const s = useHaotianStore()
    location.hash = ''
    const ok = await s.applyDeepLink()
    expect(ok).toBe(false)
    expect(s.archive).toBeNull()
  })
})

describe('数据源显示（底部状态栏 source 与顶部下拉回显）', () => {
  it('loadRecording 后底部数据源显示所选录制的名称（而非笼统的"战斗记录"）', async () => {
    const s = useHaotianStore()
    const rec = {
      battleId: 'bt-r1',
      replayId: 'rp-1',
      version: '2.0.0',
      randomSeed: '7',
      startTime: 0,
      initialState: { participants: [] },
      events: [],
      traceEvents: [],
    }
    const bs = { loadBattleRecording: async () => rec } as unknown as Parameters<typeof s.loadRecording>[0]
    s.recordings.push({ saveKey: 'rec_001', battleId: 'bt-r1', name: '词牌·斩妖', startTime: 0, eventCount: 0 })

    await s.loadRecording(bs, 'rec_001')

    expect(s.source).toBe('词牌·斩妖')
    expect(s.sourceKey).toBe('recordings')
    expect(s.curRecordKey).toBe('rec_001')
  })
})

describe('回放播放状态机（rAF 手动驱动）', () => {
  /** 接管 rAF 与时钟：advance(ms) 手动推进一帧，restore() 还原全局 */
  function drivePlayback(): { advance: (ms: number) => void; restore: () => void } {
    let cb: FrameRequestCallback | null = null
    let now = 1000
    const raf = globalThis.requestAnimationFrame.bind(globalThis)
    const nowFn = performance.now.bind(performance)
    globalThis.requestAnimationFrame = ((fn: FrameRequestCallback): number => {
      cb = fn
      return 1
    }) as typeof requestAnimationFrame
    performance.now = (() => now) as typeof performance.now
    return {
      advance(ms: number): void {
        now += ms
        const f = cb
        cb = null
        if (f) f(now)
      },
      restore(): void {
        globalThis.requestAnimationFrame = raf
        performance.now = nowFn
      },
    }
  }

  it('togglePlay 后时间随帧推进，播到末尾自动暂停', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const d = drivePlayback()
    try {
      s.togglePlay()
      expect(s.playback.playing).toBe(true)
      const t0 = s.playback.t
      d.advance(500)
      expect(s.playback.t).toBeGreaterThan(t0)
      expect(s.playback.playing).toBe(true)
      let guard = 0
      while (s.playback.playing && guard < 300) {
        d.advance(100)
        guard++
      }
      expect(s.playback.playing).toBe(false)
      expect(s.playback.t).toBe(s.duration)
    } finally {
      d.restore()
    }
  })

  it('播放中把进度条拖到最右端（seekTo duration + keepPlay）：应停在结尾而非回跳开头', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const d = drivePlayback()
    try {
      s.togglePlay()
      d.advance(300)
      expect(s.playback.playing).toBe(true)
      s.seekTo(s.duration, { keepPlay: true })
      // 期望：t 停在结尾（下一帧即自动暂停），绝不回跳 0
      expect(s.playback.t).toBe(s.duration)
    } finally {
      d.restore()
    }
  })

  it('seekTo 到中间位置并保持播放：从该位置继续，不重置', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const d = drivePlayback()
    try {
      s.togglePlay()
      d.advance(200)
      const mid = s.playback.t + 800
      s.seekTo(mid, { keepPlay: true })
      expect(s.playback.t).toBe(mid)
      expect(s.playback.playing).toBe(true)
    } finally {
      d.restore()
    }
  })

  it('播放到结尾后再次点击播放：从开头重播', async () => {
    const s = useHaotianStore()
    await s.loadDemo()
    const d = drivePlayback()
    try {
      s.togglePlay()
      let guard = 0
      while (s.playback.playing && guard < 300) {
        d.advance(100)
        guard++
      }
      expect(s.playback.playing).toBe(false)
      expect(s.playback.t).toBe(s.duration)
      s.togglePlay() // 播完再播 → 从头
      expect(s.playback.playing).toBe(true)
      expect(s.playback.t).toBe(0)
    } finally {
      d.restore()
    }
  })
})
