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
import type { UnifiedArchive, UnifiedEvent, ArchiveParticipant } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import type { TraceLevel, TracePhase } from '@/shared/types/trace-event'
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
import { diffArchives, createRateVariant, createRollVariant, diffSummary, type DiffRow } from '@/domain/battle/replay/unified/unified-diff'
import { createBreakpoint, findHitBreakpoints, type BreakpointConfig } from '@/domain/battle/replay/unified/unified-breakpoint'
import { summarizeBattle, type BattleSummary, type UnitSummary } from '@/domain/battle/replay/unified/unified-summary'
import { deriveAttrsAt } from '@/domain/battle/replay/unified/unified-attrs'
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

/** 调试会话（导出/导入 JSON 载荷）；导出恒为 v2，导入兼容 v1 迁移 */
export interface DebugSession {
  app: 'haotian'
  version: 1 | 2
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

/** 结果类型过滤值：与事件 payload 形态映射（空串 = 全部） */
export type ResultFilterKind = '' | 'damage' | 'heal' | 'dodge' | 'crit' | 'resist' | 'death' | 'buff' | 'passive'

export const RESULT_FILTER_OPTIONS: Array<{ value: ResultFilterKind; label: string }> = [
  { value: '', label: '全部结果' },
  { value: 'damage', label: '造成伤害' },
  { value: 'heal', label: '治疗' },
  { value: 'dodge', label: '闪避' },
  { value: 'crit', label: '暴击' },
  { value: 'resist', label: '被抵抗' },
  { value: 'death', label: '击杀 / 阵亡' },
  { value: 'buff', label: 'Buff 事件' },
  { value: 'passive', label: '被动触发' },
]

/** 事件是否命中指定结果类型过滤 */
export function matchResultKind(ev: UnifiedEvent, kind: string): boolean {
  const pl = ev.payload ?? {}
  switch (kind) {
    case 'damage':
      return ev.phase === 'damage_calculation' && !pl.dodge && typeof pl.result === 'number'
    case 'heal':
      return ev.phase === 'heal_calculation'
    case 'dodge':
      return pl.dodge === true
    case 'crit':
      return pl.crit === true || (typeof pl.crit === 'object' && (pl.crit as { triggered?: unknown })?.triggered === true)
    case 'resist':
      return pl.resisted === true
    case 'death':
      return pl.death === true || pl.lethalMark === true
    case 'buff':
      return ev.phase === 'buff_lifecycle' || ev.phase === 'buff_trigger'
    case 'passive':
      return ev.phase === 'passive_trigger'
    default:
      return true
  }
}

interface PersistedPrefs {
  version: number
  showDbg: boolean
  streamText: string
  bookmarks: string[]
  breakpoints: BreakpointConfig[]
  /** 强制显示无数据源的战报指标列（默认按存档完整性动态渲染） */
  showEmptyStats: boolean
  /** 事件流组合过滤（空字符串 = 全部） */
  filterPhase: string
  filterLevel: string
  filterActor: string
  filterKind: string
}

function loadPrefs(): Partial<PersistedPrefs> {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<PersistedPrefs> & { breakpoint?: BreakpointConfig; bpArmed?: boolean }
    if (parsed.version === 1) {
      // v1 迁移：单断点 + 全局开关 → 断点数组
      if (parsed.breakpoint) {
        parsed.breakpoints = [{ ...parsed.breakpoint, id: 'bp_v1', enabled: !!parsed.bpArmed }]
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
  /** 断点累计命中次数（断点 id → 次数；watch 与非 watch 都计，供面板徽标与建议 7 回归沉淀） */
  const breakpointHits = ref<Record<string, number>>({})
  const streamText = ref('')
  /** 事件流组合过滤：phase / level / 单位 / 结果类型（空串 = 全部） */
  const filterPhase = ref('')
  const filterLevel = ref('')
  const filterActor = ref('')
  const filterKind = ref('')

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
  /** 当前已加载的录制 saveKey（CommandBar 下拉回显；非记录源加载时为空） */
  const curRecordKey = ref('')

  const service = new UnifiedArchiveService()

  const pname = computed(() => (archive.value ? pnameOf(archive.value) : (id: string) => id))
  const evs = computed(() => indices.value?.evs ?? [])
  const byId = computed(() => indices.value?.byId ?? new Map<string, UnifiedEvent>())
  const duration = computed(() => indices.value?.duration ?? 0)
  const debugNodes = computed(() => allNodesFlat(debugEntries.value))
  const selectedEvent = computed<UnifiedEvent | null>(() =>
    selectedId.value ? byId.value.get(selectedId.value) ?? null : null,
  )
  /** 当前调试节点的卡片事件列表（与 DebugCards 同一数据源） */
  const debugNodeEvents = computed<UnifiedEvent[]>(() => {
    const n = debugNodeId.value ? debugNodes.value.find((x) => x.id === debugNodeId.value) : undefined
    return n?.events ?? []
  })
  /** 初始参与者快照（含 attributes）按 id 定位；无存档/未命中返回 null */
  const participantOf = (id: string | undefined): ArchiveParticipant | null => {
    if (!id) return null
    return archive.value?.initialState.participants.find((p) => p.id === id) ?? null
  }
  /** 从同因果链的 damage/heal 子事件推断行动目标（AUTO/MANUAL 发射时目标未定、旧档缺 targetId 的兜底） */
  const inferTargetFromChain = (e: UnifiedEvent): string | undefined => {
    const kids = indices.value?.children.get(e.id) ?? []
    for (const c of kids) {
      if (c.phase !== 'damage_calculation' && c.phase !== 'heal_calculation') continue
      if (c.targetId) return c.targetId
    }
    return undefined
  }
  /**
   * 当前选中事件的目标角色：优先事件 targetId；仅 action_execution 缺失时从同链 damage/heal 推断
   * （真实录制 AUTO/MANUAL 发射时目标未定）。turn_flow/buff 等链根不推断——其子事件不属于"行动目标"语义。
   */
  const selectedTarget = computed<ArchiveParticipant | null>(() => {
    const e = selectedEvent.value
    if (!e) return null
    const tid = e.targetId ?? (e.phase === 'action_execution' ? inferTargetFromChain(e) : undefined)
    return participantOf(tid)
  })
  /** 当前选中事件的行动角色（sourceId 初始快照），供"角色属性"面板行动 tab */
  const selectedActor = computed<ArchiveParticipant | null>(() => participantOf(selectedEvent.value?.sourceId))
  /** 当前回放时刻的属性快照（id → attributes，沿 attribute_recalc 事件推演） */
  const attrsAt = computed(() => (archive.value ? deriveAttrsAt(archive.value, evs.value, playback.value.t) : new Map<string, Record<string, number>>()))
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
    if (filterPhase.value) list = list.filter((e) => e.phase === filterPhase.value)
    if (filterLevel.value) list = list.filter((e) => e.level === filterLevel.value)
    if (filterActor.value) {
      const id = filterActor.value
      list = list.filter((e) => e.sourceId === id || e.targetId === id)
    }
    if (filterKind.value) list = list.filter((e) => matchResultKind(e, filterKind.value))
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

  // ── 链内导航：选中事件的同 correlationId 事件（按时间排序，含根与全部子事件）──
  const chainEvents = computed<UnifiedEvent[]>(() => {
    const sel = selectedEvent.value
    if (!sel) return []
    return evs.value
      .filter((e) => e.correlationId === sel.correlationId)
      .sort((a, b) => a.timestamp - b.timestamp)
  })

  /** 在同链事件间移动：dir=1 后一条 / -1 前一条（链首尾循环到另一端） */
  function stepInChain(dir: 1 | -1): void {
    const list = chainEvents.value
    const sel = selectedEvent.value
    if (!sel || list.length < 2) return
    const i = list.findIndex((e) => e.id === sel.id)
    if (i < 0) return
    const next = dir === 1 ? (i + 1) % list.length : (i - 1 + list.length) % list.length
    selectEvent(list[next].id, { seek: true })
  }

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
        filterPhase: filterPhase.value,
        filterLevel: filterLevel.value,
        filterActor: filterActor.value,
        filterKind: filterKind.value,
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
    curRecordKey.value = '' // 非记录源加载（demo/stress/live/导入）时无记录 key 可回显
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

  /** 删除一条已保存的录制（IndexedDB），删除后刷新列表；删除当前回显记录时清空回显 */
  async function deleteRecording(battleSystem: BattleSystem, saveKey: string): Promise<void> {
    await battleSystem.deleteBattleRecording(saveKey)
    if (curRecordKey.value === saveKey) curRecordKey.value = ''
    await refreshRecordings(battleSystem)
  }

  /** 按 saveKey 加载指定录制 */
  async function loadRecording(battleSystem: BattleSystem, saveKey: string): Promise<void> {
    const arch = await service.loadRecording(battleSystem, saveKey)
    if (arch) {
      const meta = recordings.value.find((r) => r.saveKey === saveKey)
      // 底部数据源显示所选录制的名称（词牌名），而非笼统的"战斗记录"
      await loadArchive(arch, { label: meta?.name || '战斗记录' })
      sourceKey.value = 'recordings'
      curRecordKey.value = saveKey
    } else {
      toast('战斗记录加载失败')
    }
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
        // UIParticipantSnapshot 仅暴露 5 个核心属性，进入存档供"角色属性"面板消费
        attributes: { attack: p.attack, defense: p.defense, speed: p.speed, critRate: p.critRate, critDamage: p.critDamage },
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
    switch (key) {
      case 'demo':
        if (key === sourceKey.value) return
        void loadDemo()
        break
      case 'stress':
        if (key === sourceKey.value) return
        void loadStress()
        break
      case 'live':
        if (key === sourceKey.value) return
        void attachLive()
        break
      case 'recordings': {
        const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
        // 选中"战斗记录"即加载最新保存的记录（与 demo/stress/live 选中即生效一致）；
        // 列表同步刷新，可在"选择记录…"下拉中切换其他记录
        void (async () => {
          await refreshRecordings(battleSystem)
          const first = recordings.value[0]
          if (first) await loadRecording(battleSystem, first.saveKey)
        })()
        break
      }
      case '':
        if (key === sourceKey.value) return
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

  function play(opts: { restartAtEnd?: boolean } = {}): void {
    if (!archive.value) return
    // 仅"显式点击播放按钮"播到结尾时从头重播；seekTo 保持播放（拖动到结尾）不应回跳
    if (opts.restartAtEnd && playback.value.t >= duration.value) rebuildState(0)
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
    else play({ restartAtEnd: true })
  }

  /**
   * 断点命中副作用：计数 + 按命中断点的 watch 语义决定是否暂停定位。
   * 返回 'pause'（命中非 watch 断点，已暂停，调用方短路）/ 'watch'（仅 watch 断点命中，已计数标记，不打断）/ 'none'。
   * NOTE: 播放循环与单步前进共用同一入口，保证断点语义一致（资深用户建议 4 / 审计问题 8）。
   */
  function applyBreakpoint(ev: UnifiedEvent): 'pause' | 'watch' | 'none' {
    const hits = findHitBreakpoints(ev, breakpoints.value)
    if (!hits.length) return 'none'
    for (const bp of hits) breakpointHits.value[bp.id] = (breakpointHits.value[bp.id] ?? 0) + 1
    // 任一非 watch 断点命中 → 暂停定位（原语义）；全部为 watch → 只标记 + 计数，不打断
    if (hits.some((bp) => !bp.watch)) {
      fxEventId.value = ev.id
      selectedId.value = ev.id
      rebuildState(ev.timestamp)
      pause()
      toast(`断点命中: ${ev.summary}`)
      syncHash()
      if (mode.value === 'debug') {
        const node = nodeOfEvent(debugEntries.value, ev.id)
        if (node && node.id !== debugNodeId.value) selectDebugNode(node.id)
      }
      return 'pause'
    }
    // watch 模式：静默标记 + 计数，不 toast / 不 seek / 不移动选中（「只记录不打断」）
    fxEventId.value = ev.id
    return 'watch'
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
      if (ev && applyBreakpoint(ev) === 'pause') return
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
    if (!target) return
    // NOTE: 单步前进 = 执行到该事件，命中断点应暂停（与播放循环一致）；
    //       后退是回看、seekTo 是显式导航，均不拦截（标准调试器 jump 语义）。
    //       watch 断点命中不暂停：applyBreakpoint 返回 'watch' 时继续正常步进（计数 + 标记已做）。
    if (dir > 0 && applyBreakpoint(target) === 'pause') return
    if (mode.value === 'replay') fxEventId.value = target.id
    selectEvent(target.id, { seek: true })
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
    // none = 手动暂停：配置即暂停（参考 HTML setPaused(true,'手动暂停') 语义，
    // 不参与自动命中检测——checkBreakpointHit 对 none 恒 false）
    if (type === 'none') pause()
    persistPrefs()
  }

  function removeBreakpoint(id: string): void {
    breakpoints.value = breakpoints.value.filter((b) => b.id !== id)
    const next = { ...breakpointHits.value }
    delete next[id]
    breakpointHits.value = next
    persistPrefs()
  }

  function toggleBreakpoint(id: string): void {
    breakpoints.value = breakpoints.value.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b))
    persistPrefs()
  }

  /** 切换断点 watch 模式：命中只标记 + 计数，不暂停 */
  function toggleBreakpointWatch(id: string): void {
    breakpoints.value = breakpoints.value.map((b) => (b.id === id ? { ...b, watch: !b.watch } : b))
    persistPrefs()
  }

  function clearBreakpoints(): void {
    breakpoints.value = []
    breakpointHits.value = {}
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

  function syncHash(): string {
    if (!archive.value) return ''
    let h = `#m=${mode.value}`
    if (sourceKey.value) h += `&s=${sourceKey.value}`
    h += `&b=${archive.value.battleId}`
    if (selectedId.value) h += `&e=${selectedId.value}`
    try {
      history.replaceState(null, '', h)
    } catch {
      /* hash 写入失败静默 */
    }
    return h
  }

  /** 深链来源解析：`s`（demo/stress/live/recordings）+ 可选 `b`（battleId）。无来源段返回 '' */
  function deeplinkSource(): HaotianSourceKey {
    const ms = location.hash.match(/s=(demo|recordings|stress|live)/)
    return (ms?.[1] as HaotianSourceKey) ?? ''
  }

  /**
   * 应用深链 `#m=&s=&b=&e=`：
   * - `m` 切模式；`e` 定位事件（需已加载存档）。
   * - `s`/`b` 用于打开时加载对应来源的存档（demo/stress 直接载入；recordings 按 battleId
   *   匹配已存录制加载），与当前存档不一致时才重载——`s` 缺失时沿用已加载存档。
   * 返回 true 表示深链已定位到事件（调用方无需再灌演示存档）。
   */
  async function applyDeepLink(): Promise<boolean> {
    const mm = location.hash.match(/m=(replay|debug)/)
    const me = location.hash.match(/e=([\w]+)/)
    if (mm) setMode(mm[1] as HaotianMode, true)

    const wantSource = deeplinkSource()
    if (wantSource && wantSource !== sourceKey.value) {
      switch (wantSource) {
        case 'demo':
          await loadDemo()
          break
        case 'stress':
          await loadStress()
          break
        case 'live':
          await attachLive()
          break
        case 'recordings': {
          const mb = location.hash.match(/b=([\w-]+)/)
          const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
          await refreshRecordings(battleSystem)
          const rec = recordings.value.find((r) => r.battleId === mb?.[1])
          if (rec) await loadRecording(battleSystem, rec.saveKey)
          break
        }
      }
    }

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
        () => toast('深链已复制 — 含来源/战斗/模式/事件定位'),
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
    const lines = [
      `## 战斗摘要 · ${escMdCell(sum.battleId)}`,
      '',
      `- 回合数：${sum.rounds}`,
      `- 时长：${formatTime(sum.durationMs)}`,
      `- 胜方：${escMdCell(win)}`,
      '',
      `| ${head.join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
      ...rows.map(line),
    ]
    // L5 技能使用（无事件则省略，避免空表）
    if (sum.skills.length) {
      lines.push(
        '',
        '### 技能使用',
        '',
        '| 技能 | 次数 | 输出 | 占比 | 治疗 | 暴击 |',
        '| --- | --- | --- | --- | --- | --- |',
        ...sum.skills.map((s) => `| ${escMdCell(s.skillName)} | ${s.uses} | ${s.damage} | ${s.pct}% | ${s.heal} | ${s.crits} |`),
      )
    }
    // L6 被动触发
    if (sum.passives.length) {
      lines.push(
        '',
        '### 被动触发',
        '',
        '| 被动 | 拥有者 | 触发次数 |',
        '| --- | --- | --- |',
        ...sum.passives.map((p) => `| ${escMdCell(p.name)} | ${escMdCell(p.owner)} | ${p.triggered} |`),
      )
    }
    // L7 关键事件
    if (sum.keyEvents.length) {
      lines.push('', '### 关键事件', '')
      for (const e of sum.keyEvents) lines.push(`- T${e.turn} ${escMdCell(e.text)}`)
    }
    lines.push('')
    return lines.join('\n')
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
      // NOTE: 跨战斗导入不再整包拒绝——断点是条件式（phase/level/阈值，与事件 id 无关），
      //       换一场战斗仍有意义；书签/选中事件是战斗专属 id，只应用当前存档中存在的。
      const sameBattle = archive.value?.battleId === s.battleId
      if (Array.isArray(s.bookmarks)) {
        const valid = s.bookmarks.filter((id) => byId.value.has(id))
        bookmarks.value = new Set(valid)
      }
      if (s.version === 2 && Array.isArray(s.breakpoints)) {
        breakpoints.value = s.breakpoints
      } else if (s.version === 1 && s.breakpoint) {
        // v1 会话迁移：单断点 → 断点数组
        breakpoints.value = [{ ...s.breakpoint, id: 'bp_v1', enabled: !!s.bpArmed }]
      }
      showDbg.value = s.showDbg ?? false
      streamText.value = s.streamText ?? ''
      if (s.mode) setMode(s.mode, true)
      if (s.selectedId && byId.value.has(s.selectedId)) selectEvent(s.selectedId, { seek: true })
      persistPrefs()
      toast(sameBattle ? '调试会话已应用' : `会话已应用（断点/过滤通用；书签按当前存档过滤，原属 ${s.battleId}）`)
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

  /** 重掷判定 → 生成真实分支：把新 roll 写入分支存档并载入分支对比（替代检视器本地假模拟） */
  function rerollIntoBranch(eventId: string, rollIndex: number, roll: number): void {
    if (!archive.value) return
    const ev = archive.value.events.find((e) => e.id === eventId)
    const rolls = (ev?.payload as Record<string, unknown>)?.rolls
    if (!Array.isArray(rolls) || !rolls[rollIndex]) {
      toast('该判定无可重掷的随机值')
      return
    }
    const variant = createRollVariant(archive.value, eventId, rollIndex, roll)
    setBranch(variant)
    toast(`重掷已生成分支：判定随机值 → ${roll}，可在分支对比中查看翻转差异`)
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

  /** 导入统一存档 JSON 作为主视图（回放/调试双工作台）——与唤灵台战报弹窗「导出 JSON」联通；多场生成的文件为数组，导入第一场 */
  async function loadArchiveFile(file: File): Promise<void> {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as UnifiedArchive | UnifiedArchive[]
      if (Array.isArray(parsed)) {
        if (!parsed.length) {
          toast('存档文件为空')
          return
        }
        const first = parsed[0]
        if (!Array.isArray(first?.events)) {
          toast('存档文件格式不合法（缺少 events 事件流）')
          return
        }
        await loadArchive(first, { label: '导入存档' })
        toast(parsed.length > 1
          ? `已导入存档 ${first.battleId}（文件含 ${parsed.length} 场，已导入第一场）`
          : `已导入存档 ${first.battleId}，可在回放/调试工作台使用`)
        return
      }
      if (!Array.isArray(parsed?.events)) {
        toast('存档文件格式不合法（缺少 events 事件流）')
        return
      }
      await loadArchive(parsed, { label: '导入存档' })
      toast(`已导入存档 ${parsed.battleId}，可在回放/调试工作台使用`)
    } catch {
      toast('存档导入失败')
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
    if (typeof prefs.filterPhase === 'string') filterPhase.value = prefs.filterPhase
    if (typeof prefs.filterLevel === 'string') filterLevel.value = prefs.filterLevel
    if (typeof prefs.filterActor === 'string') filterActor.value = prefs.filterActor
    if (typeof prefs.filterKind === 'string') filterKind.value = prefs.filterKind
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
    selectedTarget,
    selectedActor,
    attrsAt,
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
    breakpointHits,
    bpArmed,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    toggleBreakpointWatch,
    clearBreakpoints,
    bpOpen,
    sumOpen,
    diffOpen,
    streamText,
    filterPhase,
    filterLevel,
    filterActor,
    filterKind,
    branch,
    diffRows,
    diffStats,
    setBranch,
    loadSampleBranch,
    rerollIntoBranch,
    loadBranchFromFile,
    loadBranchRecording,
    clearBranch,
    focusMode,
    toggleFocus,
    isRelated,
    chainEvents,
    stepInChain,
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
    deleteRecording,
    loadRecording,
    curRecordKey,
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
    loadArchiveFile,
    exportSession,
    importSession,
    setMode,
    toggleMode,
    toggleDbg,
    toggleDiag,
    rebuildState,
  }
})
