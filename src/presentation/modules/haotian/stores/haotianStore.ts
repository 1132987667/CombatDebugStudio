/**
 * 文件: haotianStore.ts
 * 功能: 昊天镜双工作台状态中枢（V4「回放系统 ⇄ 调试系统」）
 * 描述: 持有统一存档 + 索引 + 校验 + 调试树 + 回放状态机，组件不持有战斗状态。
 *       P1 扩展：书签 / 条件断点 / 调试会话（导出导入）/ 流搜索过滤 / 偏好持久化 /
 *               Worker 校验管线 / 压测存档。
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { UnifiedArchive, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { buildArchiveIndices, type ArchiveIndices } from '@/domain/battle/replay/unified/unified-indices'
import {
  allNodesFlat,
  deriveDebugTree,
  nodeOfEvent,
  type DebugTreeEntry,
} from '@/domain/battle/replay/unified/unified-debug-tree'
import { validateUnified, type ValidationResult } from '@/domain/battle/replay/unified/unified-validator'
import {
  advanceSimTo,
  currentTurnAt,
  formatTime,
  lastEventAt,
  cloneSimTable,
  buildSimCheckpoints,
  nearestCheckpoint,
  type SimTable,
  type SimCheckpoint,
} from '@/domain/battle/replay/unified/unified-sim'
import { createStressArchive } from '@/domain/battle/replay/unified/stress-archive'
import { diffArchives, createRateVariant, diffSummary, type DiffRow } from '@/domain/battle/replay/unified/unified-diff'
import { checkAnyBreakpointHit, createBreakpoint, type BreakpointConfig } from '@/domain/battle/replay/unified/unified-breakpoint'
import { summarizeBattle, type BattleSummary, type UnitSummary } from '@/domain/battle/replay/unified/unified-summary'
import { runValidationPipeline } from '@/shared/utils/unified-worker'
import { UnifiedArchiveService, type RecordingMeta } from '@/application/service/UnifiedArchiveService'
import { LiveBattleStream, type LiveParticipant } from '@/application/service/LiveBattleStream'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

export type HaotianMode = 'replay' | 'debug'

/** 顶部数据源 key（CommandBar 下拉回显，与 store.source 展示标签联动） */
export type HaotianSourceKey = '' | 'demo' | 'recordings' | 'stress' | 'live'

export interface PlaybackState {
  t: number
  playing: boolean
  speed: number
  follow: boolean
  /** 播放循环已推进的事件下标（断点续推） */
  firedIdx: number
  /** 上一帧时间戳（rAF 增量计算） */
  last: number
}

/** 调试会话（导出/导入 JSON 载荷） */
export interface DebugSession {
  app: 'haotian'
  version: 2
  battleId: string
  mode: HaotianMode
  selectedId: string | null
  bookmarks: string[]
  breakpoints: BreakpointConfig[]
  showDbg: boolean
  streamText: string
}

const PREF_KEY = 'haotian.prefs.v1'
const PREF_VERSION = 2

interface PersistedPrefs {
  version: number
  showDbg: boolean
  streamText: string
  bookmarks: string[]
  breakpoints: BreakpointConfig[]
  /** 强制显示无数据源的战报指标列（默认按存档完整性动态渲染） */
  showEmptyStats: boolean
}

function loadPrefs(): Partial<PersistedPrefs> {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<PersistedPrefs> & { breakpoint?: BreakpointConfig; bpArmed?: boolean }
    if (parsed.version === 1) {
      // v1 迁移：单断点 + 全局开关 → 断点数组
      if (parsed.breakpoint) {
        parsed.breakpoints = [{ id: 'bp_v1', ...parsed.breakpoint, enabled: !!parsed.bpArmed }]
      }
      return parsed
    }
    if (parsed.version !== PREF_VERSION) return {}
    return parsed
  } catch {
    return {}
  }
}

const pnameOf = (archive: UnifiedArchive) => (id: string): string => {
  const p = archive.initialState.participants.find((x) => x.id === id)
  return p ? p.name : id
}

/** 存档来源展示标签 → 顶部下拉 key（CommandBar 回显） */
const LABEL_TO_SOURCE_KEY: Record<string, HaotianSourceKey> = {
  演示存档: 'demo',
  战斗记录: 'recordings',
  压测存档: 'stress',
  实时战斗: 'live',
}

let rafHandle = 0

export const useHaotianStore = defineStore('haotian', () => {
  const archive = ref<UnifiedArchive | null>(null)
  const validation = ref<ValidationResult | null>(null)
  const parseMs = ref(0)
  const validateMs = ref(0)
  const indices = ref<ArchiveIndices | null>(null)
  const debugEntries = ref<DebugTreeEntry[]>([])
  const mode = ref<HaotianMode>('debug')
  const selectedId = ref<string | null>(null)
  const showDbg = ref(false)
  const diagOpen = ref(false)
  const playback = ref<PlaybackState>({ t: 0, playing: false, speed: 1, follow: true, firedIdx: 0, last: 0 })
  const cur = ref<SimTable>({})
  /** 推演检查点（seek 从最近检查点续推，避免全量重跑） */
  const simCheckpoints = ref<SimCheckpoint[]>([])
  const debugNodeId = ref<string | null>(null)
  const fxEventId = ref<string | null>(null)
  /** 当前存档来源（演示/录制/压测/实时），供状态栏等展示 */
  const source = ref('')
  /** 数据源 key（顶部下拉回显与命令栏联动，R3） */
  const sourceKey = ref<HaotianSourceKey>('')

  // ── P1：书签 / 断点 / 过滤 ──
  const bookmarks = ref<Set<string>>(new Set())
  const bookmarkOpen = ref(false)
  const breakpoints = ref<BreakpointConfig[]>([])
  const streamText = ref('')

  // ── UI 面板开关（命令栏 / 快捷键 / 组件共享）──
  const bpOpen = ref(false)
  const sumOpen = ref(false)
  const diffOpen = ref(false)
  /** 战斗摘要范围：整场 / 截断到当前回放位置 */
  const summaryCut = ref<'full' | 'playback'>('full')

  // ── P1：分支对比 / 树聚焦 ──
  const branch = ref<UnifiedArchive | null>(null)
  const focusMode = ref(false)

  // ── P2：实时战斗流 ──
  const liveMode = ref(false)
  const liveFollowArmed = ref(false)
  const recordings = ref<RecordingMeta[]>([])

  const service = new UnifiedArchiveService()

  const pname = computed(() => (archive.value ? pnameOf(archive.value) : (id: string) => id))
  const evs = computed(() => indices.value?.evs ?? [])
  const byId = computed(() => indices.value?.byId ?? new Map<string, UnifiedEvent>())
  const duration = computed(() => indices.value?.duration ?? 0)
  const debugNodes = computed(() => allNodesFlat(debugEntries.value))
  const selectedEvent = computed<UnifiedEvent | null>(() =>
    selectedId.value ? byId.value.get(selectedId.value) ?? null : null,
  )
  const currentTurn = computed(() => currentTurnAt(evs.value, playback.value.t))
  const lastEvent = computed(() => lastEventAt(evs.value, playback.value.t))
  const bookmarkCount = computed(() => bookmarks.value.size)
  const summary = computed<BattleSummary | null>(() =>
    archive.value ? summarizeBattle(archive.value, summaryCut.value === 'playback' ? playback.value.t : undefined) : null,
  )
  /** 是否强制显示无数据源的指标列（resists 等；默认按存档完整性动态渲染） */
  const showEmptyStats = ref(false)
  /** 当前存档是否含被抵抗事件（真实录制无 debuff 抵抗机制，恒无此事件 → resists 列默认隐藏） */
  const hasResisted = computed(() =>
    evs.value.some(
      (e) => e.phase === 'buff_lifecycle' && (e.payload as Record<string, unknown>)?.resisted,
    ),
  )
  function toggleShowEmptyStats(): void {
    showEmptyStats.value = !showEmptyStats.value
    persistPrefs()
  }
  const filteredEvents = computed(() => {
    let list = evs.value
    if (!showDbg.value) list = list.filter((e) => !PHASE_META[e.phase].debugOnly)
    if (streamText.value) {
      const kw = streamText.value.toLowerCase()
      list = list.filter((e) => `${e.summary} ${e.correlationId}`.toLowerCase().includes(kw))
    }
    return list
  })

  // ── 分支对比派生 ──
  const diffRows = computed<DiffRow[]>(() =>
    archive.value && branch.value ? diffArchives(archive.value, branch.value) : [],
  )
  const diffStats = computed(() => diffSummary(diffRows.value))

  // ── 树聚焦派生：选中事件的因果链（向上到根 + 向下子树）──
  const relatedEventIds = computed(() => {
    const sel = selectedEvent.value
    if (!sel || !indices.value) return new Set<string>()
    const byId = indices.value.byId
    const children = indices.value.children
    const set = new Set<string>()
    const path: UnifiedEvent[] = []
    let cur: UnifiedEvent | undefined = sel
    while (cur) {
      path.push(cur)
      set.add(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    const stack = [...path]
    while (stack.length) {
      const n = stack.pop()!
      const kids = children.get(n.id)
      if (kids) {
        for (const k of kids) {
          if (!set.has(k.id)) {
            set.add(k.id)
            stack.push(k)
          }
        }
      }
    }
    return set
  })
  const isRelated = (id: string): boolean => relatedEventIds.value.has(id)

  // ───────────── 偏好持久化 ─────────────

  function persistPrefs(): void {
    try {
      const prefs: PersistedPrefs = {
        version: PREF_VERSION,
        showDbg: showDbg.value,
        streamText: streamText.value,
        bookmarks: [...bookmarks.value],
        breakpoints: breakpoints.value,
        showEmptyStats: showEmptyStats.value,
      }
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
    } catch {
      /* 持久化失败静默 */
    }
  }

  // ───────────── 数据装配 ─────────────

  // NOTE: 通知统一走全局 notificationStore（C1 重构），store 保留 toast 语义入口
  function toast(msg: string): void {
    useNotificationStore().toast(msg, 'info', 2600)
  }

  async function loadArchive(
    next: UnifiedArchive,
    opts: { followEnd?: boolean; skipWorker?: boolean; label?: string } = {},
  ): Promise<void> {
    let pipeline: { validation: ValidationResult; parseMs: number; validateMs: number }
    if (opts.skipWorker) {
      const t0 = performance.now()
      pipeline = { validation: validateUnified(next), parseMs: 0, validateMs: performance.now() - t0 }
    } else {
      pipeline = await runValidationPipeline(next)
    }
    const idx = buildArchiveIndices(next)
    archive.value = next
    validation.value = pipeline.validation
    parseMs.value = pipeline.parseMs
    validateMs.value = pipeline.validateMs
    indices.value = idx
    debugEntries.value = deriveDebugTree(idx.evs, idx.byId, pnameOf(next))
    simCheckpoints.value = buildSimCheckpoints(next, idx.evs)
    selectedId.value = null
    debugNodeId.value = null
    playback.value = { t: 0, playing: false, speed: playback.value.speed, follow: playback.value.follow, firedIdx: 0, last: 0 }
    if (opts.label !== undefined) {
      source.value = opts.label
      sourceKey.value = LABEL_TO_SOURCE_KEY[opts.label] ?? sourceKey.value
    }
    const firstAction = allNodesFlat(debugEntries.value).find((n) => n.action)
    if (firstAction) selectDebugNode(firstAction.id)
    rebuildState(opts.followEnd ? duration.value : 0)
    syncHash()
  }

  async function loadDemo(): Promise<void> {
    await loadArchive(service.loadDemo(), { label: '演示存档' })
  }

  async function loadLatest(battleSystem: BattleSystem): Promise<void> {
    const arch = await service.loadLatest(battleSystem)
    if (arch) await loadArchive(arch, { label: '战斗记录' })
    else await loadDemo()
  }

  /** 刷新已保存录制列表（IndexedDB） */
  async function refreshRecordings(battleSystem: BattleSystem): Promise<void> {
    try {
      recordings.value = await service.listRecordings(battleSystem)
    } catch {
      recordings.value = []
    }
  }

  /** 按 saveKey 加载指定录制 */
  async function loadRecording(battleSystem: BattleSystem, saveKey: string): Promise<void> {
    const arch = await service.loadRecording(battleSystem, saveKey)
    if (arch) await loadArchive(arch, { label: '战斗记录' })
    else toast('战斗记录加载失败')
  }

  async function loadStress(count = 2000): Promise<void> {
    const t0 = performance.now()
    await loadArchive(createStressArchive(count), { label: '压测存档' })
    toast(`压测存档已生成：${count} 事件（合成 ${Math.round(performance.now() - t0)}ms）`)
  }

  // ───────────── 实时战斗流（P2）─────────────

  let liveStream: LiveBattleStream | null = null
  let liveRaf = 0
  let liveWatcher: (() => void) | null = null
  let followWatcher: (() => void) | null = null

  function currentLiveParticipants(): LiveParticipant[] {
    const b = useBattleStore()
    const out: LiveParticipant[] = []
    for (const [, p] of b.participants) {
      out.push({
        id: p.id,
        name: p.name,
        maxHp: p.maxHealth,
        hp: p.currentHealth,
        maxEnergy: p.maxEnergy,
        energy: p.currentEnergy,
        side: p.team,
      })
    }
    return out
  }

  /** 实时更新：首次全量装载；后续增量追加（重建索引/树，保留选中态，跟随尾部） */
  function applyLive(): void {
    if (!liveStream || liveRaf) return
    liveRaf = requestAnimationFrame(() => {
      liveRaf = 0
      if (!liveStream) return
      const arch = archive.value
      // 首次装载或切换场次：全量
      if (!arch || arch.battleId !== liveStream.getBattleId()) {
        void loadArchive(liveStream.currentArchive(), { followEnd: true, skipWorker: true, label: '实时战斗' })
        return
      }
      const existing = new Set(arch.events.map((e) => e.id))
      const fresh = liveStream.getEvents().filter((e) => !existing.has(e.id))
      if (!fresh.length) return
      arch.events.push(...fresh)
      const idx = buildArchiveIndices(arch)
      indices.value = idx
      debugEntries.value = deriveDebugTree(idx.evs, idx.byId, pnameOf(arch))
      // 增量扩展检查点（实时流尾部追加），避免每帧全量重建
      simCheckpoints.value = buildSimCheckpoints(arch, idx.evs, 200, simCheckpoints.value)
      rebuildState(duration.value) // 跟随尾部：舞台/事件流显示最新状态
    })
  }

  /** 订阅实时战斗流；战斗未激活返回 false */
  async function startLive(battleSystem: BattleSystem, eventBus: IDomainEventBus): Promise<boolean> {
    const b = useBattleStore()
    if (!b.isBattleActive) {
      toast('当前无进行中的战斗（先在唤灵台开始战斗）')
      return false
    }
    stopLive()
    const makeStream = (): LiveBattleStream =>
      new LiveBattleStream({
        eventBus,
        collector: battleSystem.traceCollector ?? null,
        getParticipants: currentLiveParticipants,
        onUpdate: applyLive,
        onEnd: () => {
          liveMode.value = false
          toast('实时战斗结束，已保留最终存档（可回放）')
        },
      })
    liveStream = makeStream()
    liveMode.value = true
    liveStream.start()
    await loadArchive(liveStream.currentArchive(), { followEnd: true, skipWorker: true, label: '实时战斗' })
    // resetBattle() 会 clear() 共享事件总线（清掉本订阅）；以 currentBattleId 变化为重建信号
    liveWatcher = watch(
      () => b.currentBattleId,
      () => {
        if (!liveMode.value || !b.isBattleActive) return
        liveStream?.dispose()
        liveStream = makeStream()
        liveStream.start()
        applyLive()
      },
    )
    return true
  }

  function stopLive(): void {
    if (liveWatcher) {
      liveWatcher()
      liveWatcher = null
    }
    if (followWatcher) {
      followWatcher()
      followWatcher = null
    }
    liveFollowArmed.value = false
    liveStream?.dispose()
    liveStream = null
    liveMode.value = false
  }

  /** 实时跟随：战斗尚未开始就保持待命，开战后自动接入实时流 */
  function armLiveFollow(battleSystem: BattleSystem, eventBus: IDomainEventBus): void {
    if (liveFollowArmed.value) return
    liveFollowArmed.value = true
    toast('已开启实时跟随：战斗开始后自动接入昊天镜')
    const b = useBattleStore()
    followWatcher = watch(
      () => b.isBattleActive,
      async (active) => {
        if (!active || !liveFollowArmed.value) return
        liveFollowArmed.value = false
        if (followWatcher) {
          followWatcher()
          followWatcher = null
        }
        await startLive(battleSystem, eventBus)
      },
    )
  }

  /** 数据源入口（命令栏 / 空态共用）：加载最近一次战斗记录，无记录回退演示存档 */
  async function attachLatest(): Promise<void> {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    await loadLatest(battleSystem)
  }

  /** 数据源入口（命令栏 / 空态共用）：战斗已激活则直接接管，否则保持待命（开战后自动接入） */
  async function attachLive(): Promise<void> {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    const eventBus = container.resolve<BuffSystem>('BuffSystem').getEventBus() as IDomainEventBus
    const ok = await startLive(battleSystem, eventBus)
    if (!ok) armLiveFollow(battleSystem, eventBus)
  }

  /** 顶部下拉数据源分发（CommandBar select 唯一入口；loader 内部回写 sourceKey 保证回显一致） */
  function setSourceKey(key: HaotianSourceKey): void {
    if (key === sourceKey.value) return
    switch (key) {
      case 'demo':
        void loadDemo()
        break
      case 'stress':
        void loadStress()
        break
      case 'live':
        void attachLive()
        break
      case 'recordings': {
        const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
        void refreshRecordings(battleSystem)
        break
      }
      case '':
        stopLive()
        break
    }
  }

  // ───────────── 回放状态机 ─────────────

  function rebuildState(t: number): void {
    if (!archive.value || !indices.value) return
    playback.value.t = Math.max(0, Math.min(duration.value, t))
    // 从最近的检查点续推：seek 无需每次从 initialState 全量重跑
    const cp = nearestCheckpoint(simCheckpoints.value, playback.value.t)
    if (!cp) return
    cur.value = cloneSimTable(cp.sim)
    playback.value.firedIdx = advanceSimTo(cur.value, evs.value, playback.value.t, cp.idx)
  }

  function play(): void {
    if (!archive.value) return
    if (playback.value.t >= duration.value) rebuildState(0)
    if (playback.value.playing) return
    playback.value.playing = true
    playback.value.last = performance.now()
    rafHandle = requestAnimationFrame(tickLoop)
  }

  function pause(): void {
    playback.value.playing = false
    if (rafHandle) cancelAnimationFrame(rafHandle)
    rafHandle = 0
  }

  function togglePlay(): void {
    if (playback.value.playing) pause()
    else play()
  }

  function checkBreakpoint(ev: UnifiedEvent): boolean {
    return checkAnyBreakpointHit(ev, breakpoints.value)
  }

  function tickLoop(now: number): void {
    if (!playback.value.playing) return
    const dt = now - (playback.value.last ?? now)
    playback.value.last = now
    playback.value.t = Math.min(duration.value, playback.value.t + dt * playback.value.speed)
    const before = playback.value.firedIdx
    playback.value.firedIdx = advanceSimTo(cur.value, evs.value, playback.value.t, playback.value.firedIdx)
    for (let i = before; i < playback.value.firedIdx; i++) {
      const ev = evs.value[i]
      if (ev && checkBreakpoint(ev)) {
        fxEventId.value = ev.id
        selectedId.value = ev.id
        rebuildState(ev.timestamp)
        pause()
        toast(`断点命中: ${ev.summary}`)
        syncHash()
        return
      }
    }
    if (playback.value.firedIdx > before && evs.value[playback.value.firedIdx - 1]) {
      fxEventId.value = evs.value[playback.value.firedIdx - 1].id
    }
    if (playback.value.t >= duration.value) {
      pause()
      return
    }
    rafHandle = requestAnimationFrame(tickLoop)
  }

  function seekTo(t: number, opts: { autoplay?: boolean; keepPlay?: boolean } = {}): void {
    const wasPlaying = playback.value.playing
    pause()
    rebuildState(t)
    if (opts.autoplay || (wasPlaying && opts.keepPlay)) play()
  }

  /** 逐事件步进（dir=1 下一事件，dir=-1 上一事件） */
  function stepEvent(dir: 1 | -1): void {
    const list = evs.value
    const t = playback.value.t
    let target: UnifiedEvent | null = null
    if (dir > 0) target = list.find((e) => e.timestamp > t + 1) ?? null
    else {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].timestamp < t - 1) {
          target = list[i]
          break
        }
      }
    }
    if (target) {
      if (mode.value === 'replay') fxEventId.value = target.id
      selectEvent(target.id, { seek: true })
    }
  }

  function selectDebugNode(id: string): void {
    const node = debugNodes.value.find((n) => n.id === id)
    if (!node) return
    debugNodeId.value = id
  }

  // ───────────── 书签 ─────────────

  function isBookmarked(id: string): boolean {
    return bookmarks.value.has(id)
  }

  function toggleBookmark(id: string): void {
    const next = new Set(bookmarks.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    bookmarks.value = next
    persistPrefs()
  }

  function removeBookmark(id: string): void {
    const next = new Set(bookmarks.value)
    next.delete(id)
    bookmarks.value = next
    persistPrefs()
  }

  function clearBookmarks(): void {
    bookmarks.value = new Set()
    persistPrefs()
    toast('已清除全部书签')
  }

  function toggleBookmarkPanel(): void {
    bookmarkOpen.value = !bookmarkOpen.value
  }

  /** 书签事件列表（按时间序），供书签面板展示与跳转 */
  const bookmarkedEvents = computed<UnifiedEvent[]>(() => evs.value.filter((e) => bookmarks.value.has(e.id)))

  // ───────────── 断点 ─────────────

  /** 是否有任一启用断点（命令栏 / 状态栏显性标识） */
  const bpArmed = computed(() => breakpoints.value.some((b) => b.enabled && b.type !== 'none'))

  function addBreakpoint(type: BreakpointConfig['type'], value: number | string | undefined): void {
    breakpoints.value.push(createBreakpoint(type, value))
    persistPrefs()
  }

  function removeBreakpoint(id: string): void {
    breakpoints.value = breakpoints.value.filter((b) => b.id !== id)
    persistPrefs()
  }

  function toggleBreakpoint(id: string): void {
    breakpoints.value = breakpoints.value.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b))
    persistPrefs()
  }

  function clearBreakpoints(): void {
    breakpoints.value = []
    persistPrefs()
  }

  // ───────────── 选中 / 焦点 / 深链 ─────────────

  function selectEvent(id: string, opts: { seek?: boolean; fx?: boolean } = {}): void {
    const ev = byId.value.get(id)
    if (!ev) return
    selectedId.value = id
    if (opts.seek) seekTo(ev.timestamp)
    if (opts.fx) fxEventId.value = id
    if (mode.value === 'debug') {
      const node = nodeOfEvent(debugEntries.value, id)
      if (node && node.id !== debugNodeId.value) selectDebugNode(node.id)
    }
    syncHash()
  }

  function focusEvent(id: string, opts: { seek?: boolean; fx?: boolean } = {}): void {
    selectEvent(id, opts)
  }

  function syncHash(): void {
    if (!archive.value) return
    let h = `#m=${mode.value}`
    if (selectedId.value) h += `&e=${selectedId.value}`
    try {
      history.replaceState(null, '', h)
    } catch {
      /* hash 写入失败静默 */
    }
  }

  function applyDeepLink(): boolean {
    const mm = location.hash.match(/m=(replay|debug)/)
    const me = location.hash.match(/e=([\w]+)/)
    if (mm) setMode(mm[1] as HaotianMode, true)
    if (me && me[1] && byId.value.has(me[1])) {
      selectEvent(me[1], { seek: true })
      return true
    }
    return false
  }

  function copyDeepLink(): void {
    const url = location.href.split('#')[0] + location.hash
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => toast('深链已复制 — 含模式与事件定位'),
        () => toast('深链复制失败'),
      )
    } else {
      toast('当前环境不支持剪贴板')
    }
  }

  function exportArchive(): void {
    if (!archive.value) return
    const text = JSON.stringify(archive.value, null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `battle_debug_${archive.value.battleId}_v${archive.value.version}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 500)
    toast('已导出统一存档 — 一份文件，回放与调试两种能力')
  }

  // ───────────── 调试会话（导出 / 导入）─────────────

  function exportSession(): void {
    if (!archive.value) return
    const session: DebugSession = {
      app: 'haotian',
      version: 2,
      battleId: archive.value.battleId,
      mode: mode.value,
      selectedId: selectedId.value,
      bookmarks: [...bookmarks.value],
      breakpoints: breakpoints.value,
      showDbg: showDbg.value,
      streamText: streamText.value,
    }
    const text = JSON.stringify(session, null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `haotian-session-${archive.value.battleId}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 500)
    toast('已导出调试会话 — 书签/断点/过滤一键复现')
  }

  /** 摘要单位行（按 initialState 顺序，附意外单位） */
  function summaryRows(): Array<{ id: string; s: UnitSummary }> {
    const sum = summary.value
    if (!sum) return []
    const known = new Set(archive.value?.initialState.participants.map((p) => p.id) ?? [])
    const ids = (archive.value?.initialState.participants.map((p) => p.id) ?? []).concat(
      Object.keys(sum.units).filter((id) => !known.has(id)),
    )
    return ids.map((id) => ({ id, s: sum.units[id] })).filter((r) => r.s)
  }

  /** Markdown 表格单元转义：竖线与换行会破坏表格结构（存档 id 可来自外部导入） */
  const escMdCell = (s: string): string => s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')

  /** CSV 字段转义（RFC 4180）：含分隔符/引号/换行时双引号包裹，内部引号翻倍 */
  const escCsvCell = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

  /** 单位 id → 带阵营前缀的名字（摘要导出/面板与日志口径一致；side 缺失或未知回退纯名字） */
  const pnameSide = (id: string): string => {
    const p = archive.value?.initialState.participants.find((x) => x.id === id)
    if (!p) return pname.value(id)
    if (p.side === 'ally') return `[友方]${p.name}`
    if (p.side === 'enemy') return `[敌方]${p.name}`
    return p.name
  }

  /** 单位 id → 名字（摘要导出与对话框一致；未知单位回退 id） */
  const nm = (id: string): string => pnameSide(id)

  /**
   * 胜方显示名：winner 可能是 side 值（真实录制 'ally'/'enemy'）或 unit id（demo），
   * 统一为可读中文——side 值翻译为 友方/敌方，unit id 走 pnameSide（带阵营前缀）。
   * 修复前 side 值经 pnameSide 查不到参与者、原样返回 'ally'，与实时战报弹窗口径不一致。
   */
  const SIDE_LABEL: Record<string, string> = { ally: '友方', enemy: '敌方' }
  const winnerLabel = (winner: string): string => SIDE_LABEL[winner] ?? pnameSide(winner)

  function summaryMarkdown(): string {
    const sum = summary.value
    if (!sum) return ''
    const win = sum.winner ? winnerLabel(sum.winner) : '—'
    const rows = summaryRows()
    const head = ['参战单位', '攻击', '输出', '承伤', '治疗', '暴击', '闪避', '抵抗', 'Buff 施加', '击杀']
    const line = (r: { id: string; s: UnitSummary }): string =>
      `| ${escMdCell(nm(r.id))} | ${r.s.attacks} | ${r.s.dealt} | ${r.s.taken} | ${r.s.healed} | ${r.s.crits} | ${r.s.dodges} | ${r.s.resists} | ${r.s.buffsApplied} | ${r.s.kills} |`
    return [
      `## 战斗摘要 · ${escMdCell(sum.battleId)}`,
      '',
      `- 回合数：${sum.rounds}`,
      `- 时长：${formatTime(sum.durationMs)}`,
      `- 胜方：${escMdCell(win)}`,
      '',
      `| ${head.join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
      ...rows.map(line),
      '',
    ].join('\n')
  }

  function summaryCsv(): string {
    const sum = summary.value
    if (!sum) return ''
    const rows = summaryRows()
    const head = ['单位', '攻击', '输出', '承伤', '治疗', '暴击', '闪避', '抵抗', 'Buff 施加', '击杀']
    const lines = [
      head.join(','),
      ...rows.map((r) =>
        [escCsvCell(nm(r.id)), r.s.attacks, r.s.dealt, r.s.taken, r.s.healed, r.s.crits, r.s.dodges, r.s.resists, r.s.buffsApplied, r.s.kills].join(','),
      ),
    ]
    // BOM 前缀：Windows Excel 按 UTF-8 打开中文不乱码
    return '\uFEFF' + lines.join('\r\n')
  }

  function download(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 500)
  }

  function exportSummaryMarkdown(): void {
    if (!summary.value) return
    download(`battle_summary_${summary.value.battleId}.md`, summaryMarkdown(), 'text/markdown;charset=utf-8')
    toast('已导出战斗摘要 Markdown')
  }

  function exportSummaryCsv(): void {
    if (!summary.value) return
    download(`battle_summary_${summary.value.battleId}.csv`, summaryCsv(), 'text/csv;charset=utf-8')
    toast('已导出战斗摘要 CSV')
  }

  /** 导入调试会话（文件 JSON），应用后提示 */
  async function importSession(file: File): Promise<void> {
    try {
      const text = await file.text()
      const s = JSON.parse(text) as DebugSession & { breakpoint?: BreakpointConfig; bpArmed?: boolean }
      if (s?.app !== 'haotian' || (s.version !== 1 && s.version !== 2)) {
        toast('会话文件格式不合法')
        return
      }
      if (!archive.value || s.battleId !== archive.value.battleId) {
        toast(`会话属于 ${s.battleId}，与当前存档 ${archive.value?.battleId ?? '—'} 不匹配，已拒绝应用`)
        return
      }
      if (Array.isArray(s.bookmarks)) bookmarks.value = new Set(s.bookmarks)
      if (s.version === 2 && Array.isArray(s.breakpoints)) {
        breakpoints.value = s.breakpoints
      } else if (s.version === 1 && s.breakpoint) {
        // v1 会话迁移：单断点 → 断点数组
        breakpoints.value = [{ id: 'bp_v1', ...s.breakpoint, enabled: !!s.bpArmed }]
      }
      showDbg.value = s.showDbg ?? false
      streamText.value = s.streamText ?? ''
      if (s.mode) setMode(s.mode, true)
      if (s.selectedId && byId.value.has(s.selectedId)) selectEvent(s.selectedId, { seek: true })
      persistPrefs()
      toast('调试会话已应用')
    } catch {
      toast('会话导入失败')
    }
  }

  // ───────────── 分支对比 ─────────────

  function setBranch(next: UnifiedArchive | null): void {
    branch.value = next
    if (next) toast(`分支已载入：${next.battleId} · 与当前存档对比`)
    else branch.value = null
  }

  /** 生成示例分支：改写首个随机判定事件的阈值（如暴击率 → 0.30） */
  function loadSampleBranch(): void {
    if (!archive.value) return
    const target = archive.value.events.find((e) => Array.isArray((e.payload as Record<string, unknown>)?.rolls))
    if (!target) {
      toast('当前存档无随机判定，无法生成示例分支')
      return
    }
    const variant = createRateVariant(archive.value, target.id, 0, 0.3)
    setBranch(variant)
  }

  async function loadBranchFromFile(file: File): Promise<void> {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as UnifiedArchive
      if (!Array.isArray(parsed?.events)) {
        toast('分支文件格式不合法')
        return
      }
      setBranch(parsed)
    } catch {
      toast('分支文件导入失败')
    }
  }

  /** 从已保存录制载入分支（分支对比） */
  async function loadBranchRecording(battleSystem: BattleSystem, saveKey: string): Promise<void> {
    const arch = await service.loadRecording(battleSystem, saveKey)
    if (arch) setBranch(arch)
    else toast('分支记录加载失败')
  }

  function clearBranch(): void {
    branch.value = null
  }

  // ───────────── 树聚焦 ─────────────

  function toggleFocus(): void {
    focusMode.value = !focusMode.value
  }

  // ───────────── 模式 ─────────────

  function setMode(m: HaotianMode, silent = false): void {
    if (mode.value === m) return
    mode.value = m
    if (m === 'replay') rebuildState(playback.value.t)
    syncHash()
    if (!silent) toast(m === 'replay' ? '回放系统 — 按 timestamp 播放 · StateDelta 快照跳转' : '调试系统 — 时间线树 / 卡片流 / RNG 凭证')
  }

  function toggleMode(): void {
    setMode(mode.value === 'replay' ? 'debug' : 'replay')
  }

  function toggleDbg(): void {
    showDbg.value = !showDbg.value
    persistPrefs()
  }

  function toggleDiag(): void {
    diagOpen.value = !diagOpen.value
  }

  function toggleSummaryCut(): void {
    summaryCut.value = summaryCut.value === 'full' ? 'playback' : 'full'
  }

  // ───────────── 派生展示 ─────────────

  const timeRead = computed(() => formatTime(playback.value.t))

  // 初始化偏好
  {
    const prefs = loadPrefs()
    if (prefs.showDbg !== undefined) showDbg.value = prefs.showDbg
    if (prefs.streamText !== undefined) streamText.value = prefs.streamText
    if (Array.isArray(prefs.bookmarks)) bookmarks.value = new Set(prefs.bookmarks)
    if (Array.isArray(prefs.breakpoints) && prefs.breakpoints.length) breakpoints.value = prefs.breakpoints
    if (prefs.showEmptyStats !== undefined) showEmptyStats.value = prefs.showEmptyStats
  }

  return {
    archive,
    validation,
    parseMs,
    validateMs,
    indices,
    evs,
    byId,
    filteredEvents,
    source,
    sourceKey,
    setSourceKey,
    debugEntries,
    debugNodes,
    mode,
    selectedId,
    selectedEvent,
    showDbg,
    diagOpen,
    playback,
    cur,
    debugNodeId,
    fxEventId,
    duration,
    currentTurn,
    lastEvent,
    pname,
    pnameSide,
    winnerLabel,
    timeRead,
    summary,
    summaryCut,
    toggleSummaryCut,
    showEmptyStats,
    hasResisted,
    toggleShowEmptyStats,
    summaryMarkdown,
    summaryCsv,
    exportSummaryMarkdown,
    exportSummaryCsv,
    bookmarks,
    bookmarkCount,
    bookmarkOpen,
    bookmarkedEvents,
    isBookmarked,
    toggleBookmark,
    removeBookmark,
    clearBookmarks,
    toggleBookmarkPanel,
    breakpoints,
    bpArmed,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    clearBreakpoints,
    checkBreakpoint,
    bpOpen,
    sumOpen,
    diffOpen,
    streamText,
    branch,
    diffRows,
    diffStats,
    setBranch,
    loadSampleBranch,
    loadBranchFromFile,
    loadBranchRecording,
    clearBranch,
    focusMode,
    toggleFocus,
    isRelated,
    toast,
    loadDemo,
    loadLatest,
    loadStress,
    attachLatest,
    attachLive,
    liveMode,
    liveFollowArmed,
    recordings,
    refreshRecordings,
    loadRecording,
    startLive,
    stopLive,
    armLiveFollow,
    play,
    pause,
    togglePlay,
    seekTo,
    stepEvent,
    selectDebugNode,
    selectEvent,
    focusEvent,
    syncHash,
    applyDeepLink,
    copyDeepLink,
    exportArchive,
    exportSession,
    importSession,
    setMode,
    toggleMode,
    toggleDbg,
    toggleDiag,
    rebuildState,
  }
})
