/**
 * 文件: haotianStore.ts
 * 功能: 昊天镜双工作台状态中枢（V4「回放系统 ⇄ 调试系统」）
 * 描述: 持有统一存档 + 索引 + 校验 + 调试树 + 回放状态机，组件不持有战斗状态。
 *       P1 扩展：书签 / 条件断点 / 调试会话（导出导入）/ 流搜索过滤 / 偏好持久化 /
 *               Worker 校验管线 / 压测存档。
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
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
import { checkBreakpointHit, type BreakpointConfig } from '@/domain/battle/replay/unified/unified-breakpoint'
import { summarizeBattle, type BattleSummary, type UnitSummary } from '@/domain/battle/replay/unified/unified-summary'
import { runValidationPipeline } from '@/shared/utils/unified-worker'
import { UnifiedArchiveService, type RecordingMeta } from '@/application/service/UnifiedArchiveService'
import { LiveBattleStream, type LiveParticipant } from '@/application/service/LiveBattleStream'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { useBattleStore } from '@/presentation/stores/battleStore'

export type HaotianMode = 'replay' | 'debug'

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

export interface ToastItem {
  id: number
  msg: string
}

/** 调试会话（导出/导入 JSON 载荷） */
export interface DebugSession {
  app: 'haotian'
  version: 1
  battleId: string
  mode: HaotianMode
  selectedId: string | null
  bookmarks: string[]
  breakpoint: BreakpointConfig
  bpArmed: boolean
  showDbg: boolean
  streamText: string
}

const PREF_KEY = 'haotian.prefs.v1'
const PREF_VERSION = 1

interface PersistedPrefs {
  version: number
  showDbg: boolean
  streamText: string
  bookmarks: string[]
  breakpoint: BreakpointConfig
  bpArmed: boolean
}

function loadPrefs(): Partial<PersistedPrefs> {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedPrefs
    // 版本不匹配视为格式已变更，忽略旧偏好，避免静默错位
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

let toastSeq = 0
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
  const toasts = ref<ToastItem[]>([])
  const playback = ref<PlaybackState>({ t: 0, playing: false, speed: 1, follow: true, firedIdx: 0, last: 0 })
  const cur = ref<SimTable>({})
  /** 推演检查点（seek 从最近检查点续推，避免全量重跑） */
  const simCheckpoints = ref<SimCheckpoint[]>([])
  const debugNodeId = ref<string | null>(null)
  const fxEventId = ref<string | null>(null)

  // ── P1：书签 / 断点 / 过滤 ──
  const bookmarks = ref<Set<string>>(new Set())
  const breakpoint = ref<BreakpointConfig>({ type: 'none' })
  const bpArmed = ref(false)
  const streamText = ref('')

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
  const summary = computed<BattleSummary | null>(() => (archive.value ? summarizeBattle(archive.value) : null))
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
        breakpoint: breakpoint.value,
        bpArmed: bpArmed.value,
      }
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
    } catch {
      /* 持久化失败静默 */
    }
  }

  // ───────────── 数据装配 ─────────────

  function toast(msg: string): void {
    const item: ToastItem = { id: ++toastSeq, msg }
    toasts.value.push(item)
    setTimeout(() => {
      toasts.value = toasts.value.filter((x) => x.id !== item.id)
    }, 2400)
  }

  async function loadArchive(
    next: UnifiedArchive,
    opts: { followEnd?: boolean; skipWorker?: boolean } = {},
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
    const firstAction = allNodesFlat(debugEntries.value).find((n) => n.action)
    if (firstAction) selectDebugNode(firstAction.id)
    rebuildState(opts.followEnd ? duration.value : 0)
    syncHash()
  }

  async function loadDemo(): Promise<void> {
    await loadArchive(service.loadDemo())
  }

  async function loadLatest(battleSystem: BattleSystem): Promise<void> {
    const arch = await service.loadLatest(battleSystem)
    if (arch) await loadArchive(arch)
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
    if (arch) await loadArchive(arch)
    else toast('战斗记录加载失败')
  }

  async function loadStress(count = 2000): Promise<void> {
    const t0 = performance.now()
    await loadArchive(createStressArchive(count))
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
        void loadArchive(liveStream.currentArchive(), { followEnd: true, skipWorker: true })
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
    await loadArchive(liveStream.currentArchive(), { followEnd: true, skipWorker: true })
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
    return checkBreakpointHit(ev, breakpoint.value, bpArmed.value)
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

  // ───────────── 断点 ─────────────

  function setBreakpoint(bp: BreakpointConfig, armed: boolean): void {
    breakpoint.value = bp
    bpArmed.value = armed && bp.type !== 'none'
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
      version: 1,
      battleId: archive.value.battleId,
      mode: mode.value,
      selectedId: selectedId.value,
      bookmarks: [...bookmarks.value],
      breakpoint: breakpoint.value,
      bpArmed: bpArmed.value,
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

  function summaryMarkdown(): string {
    const sum = summary.value
    if (!sum) return ''
    const win = sum.winner ? nm(sum.winner) : '—'
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
      const s = JSON.parse(text) as DebugSession
      if (s?.app !== 'haotian' || s.version !== 1) {
        toast('会话文件格式不合法')
        return
      }
      if (!archive.value || s.battleId !== archive.value.battleId) {
        toast(`会话属于 ${s.battleId}，与当前存档 ${archive.value?.battleId ?? '—'} 不匹配，已拒绝应用`)
        return
      }
      if (Array.isArray(s.bookmarks)) bookmarks.value = new Set(s.bookmarks)
      if (s.breakpoint) breakpoint.value = s.breakpoint
      bpArmed.value = s.bpArmed ?? false
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

  // ───────────── 派生展示 ─────────────

  const timeRead = computed(() => formatTime(playback.value.t))

  // 初始化偏好
  {
    const prefs = loadPrefs()
    if (prefs.showDbg !== undefined) showDbg.value = prefs.showDbg
    if (prefs.streamText !== undefined) streamText.value = prefs.streamText
    if (Array.isArray(prefs.bookmarks)) bookmarks.value = new Set(prefs.bookmarks)
    if (prefs.breakpoint) breakpoint.value = prefs.breakpoint
    if (prefs.bpArmed) bpArmed.value = true
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
    debugEntries,
    debugNodes,
    mode,
    selectedId,
    selectedEvent,
    showDbg,
    diagOpen,
    toasts,
    playback,
    cur,
    debugNodeId,
    fxEventId,
    duration,
    currentTurn,
    lastEvent,
    pname,
    pnameSide,
    timeRead,
    summary,
    exportSummaryMarkdown,
    exportSummaryCsv,
    bookmarks,
    bookmarkCount,
    isBookmarked,
    toggleBookmark,
    breakpoint,
    bpArmed,
    setBreakpoint,
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
