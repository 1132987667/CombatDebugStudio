<template>
  <div v-if="ev" class="ht-insp">
    <div class="ht-insp-hd">
      <div class="ht-insp-title">
        <span class="ht-insp-phase" :class="'ht-' + meta(ev).cls" :title="'阶段分类：' + meta(ev).label">{{ meta(ev).icon }}</span>
        <span class="ht-insp-main">{{ inspTitle }}</span>
      </div>
      <div class="ht-insp-kicker">
        {{ meta(ev).label }} · 时间 {{ formatTime(ev.timestamp) }}
        <span class="ht-insp-corr" :title="`事件 ${ev.id} · 因果链 ${ev.correlationId}`">{{ inspSub }}</span>
      </div>
      <div class="ht-insp-actions">
        <Button title="切换到回放系统，并从该事件时间点开始播放" @click="playFromHere">从此回放</Button>
        <Button title="导出该事件 JSON（含 payload / 快照 / 元信息）" @click="exportEvent">导出事件 JSON</Button>
      </div>
    </div>

    <div class="ht-sec" v-if="steps.length">
      <div class="ht-sec-t">
        计算过程 · 结算步骤
        <span class="ht-steps-hint">悬停来源查看释义 · 右侧为累计值</span>
      </div>
      <div v-for="(m, i) in steps" :key="i" class="ht-frow">
        <span class="ht-fop" :class="opClass(m.op)">{{ m.op || '＝' }}</span>
        <span class="ht-flab" @mouseenter="onStepEnter($event, m.step)" @mousemove="onStepMove"
          @mouseleave="onStepLeave">{{ stepNameCN(m.step.n) }}</span>
        <span class="ht-fval" :class="valClass(m.op, m.step.v)">{{ fmtVal(m.op, m.step.v) }}</span>
        <span class="ht-facc">{{ fmtRunning(m.running) }}</span>
      </div>
      <div v-if="pl.result != null" class="ht-fres" :class="{ mismatch: resultMismatch }">
        <span class="lab">最终 · 结算结果<template v-if="resultMismatch">（与累计不一致，差额 {{ resultDiff }}）</template></span>
        <span class="num">{{ pl.result }}</span>
      </div>
    </div>

    <div class="ht-sec" v-if="pl.rolls">
      <div class="ht-sec-t">
        随机判定凭证
      </div>
      <div v-for="(c, i) in pl.rolls as RngRoll[]" :key="i" class="ht-rng">
        <div class="ht-rng-top">
          <span class="ht-rng-name">{{ rollName(c.kind) }}</span>
          <span v-if="rerolled(i)" class="ht-rng-sim" title="重掷结果同时写入分支存档，可在分支对比中核验">重掷分支</span>
          <span v-if="c.buff" class="ht-rng-note">· {{ c.buff }}</span>
          <span v-if="derivedOf(c)" class="ht-rng-note" title="真实录制未记录随机值，此值由判定结果反推">· 由结果推导</span>
          <span class="ht-rng-idx">随机 #{{ String(c.idx ?? 0).padStart(4, '0') }}</span>
        </div>
        <div class="ht-rng-bar">
          <i class="ht-rng-fill" :class="passOf(i) ? 'pass' : 'fail'" :style="{ width: (rollOf(i) * 100).toFixed(1) + '%' }"></i>
          <b class="ht-rng-th" :style="{ left: (c.rate * 100).toFixed(1) + '%' }"></b>
        </div>
        <div class="ht-rng-nums">
          <span>阈值 <b>{{ (c.rate * 100).toFixed(1) }}%</b></span>
          <span>随机值 <b :style="{ color: passOf(i) ? 'var(--color-success)' : 'var(--color-energy)' }">{{ (rollOf(i) * 100).toFixed(1) }}%</b></span>
          <span class="ht-rng-verdict" :class="passOf(i) ? 'v-pass' : 'v-fail'">
            {{ passOf(i) ? '判定通过' : '判定未通过' }}
          </span>
        </div>
        <div class="ht-rng-sens">
          <span class="ht-rng-margin" :class="{ fragile: marginOf(i) < 10 }">
            余量 {{ marginOf(i).toFixed(1) }}%<template v-if="marginOf(i) < 10"> · 敏感</template>
          </span>
          <Button size="tiny" title="重掷该判定：新随机值写入分支存档，载入分支对比核验翻转" @click="doReroll(i)">重掷该判定</Button>
          <span v-if="rerolled(i)" class="ht-rng-reroll" :class="rerollFlip(i) ? 'v-fail' : 'v-pass'">
            {{ rerollFlip(i) ? '重掷翻转！' : '重掷未翻转' }}
          </span>
        </div>
      </div>
    </div>

    <div class="ht-sec" v-if="ev._delta?.length">
      <div class="ht-sec-t">状态变化</div>
      <template v-for="(d, di) in ev._delta" :key="di">
        <div class="ht-d-tgt">参战单位 · <b>{{ store.pname(d.id) }}</b></div>
        <div v-for="(f, fi) in d.fields" :key="fi" class="ht-drow">
          <span class="ht-dstat">{{ f.k }}</span>
          <span class="ht-dbar"><i :class="f.k === 'HP' ? 'hp' : 'en'" :style="{ width: pctOf(d.id, f) + '%' }"></i></span>
          <span class="ht-dbefore">{{ f.before }}</span>
          <span class="ht-dafter" :style="{ color: f.after - f.before < 0 ? 'var(--color-danger)' : 'var(--color-success)' }">{{ f.after }}</span>
          <span class="ht-ddelta" :class="f.after - f.before < 0 ? 'dec' : 'inc'">
            {{ f.after - f.before > 0 ? '+' : '' }}{{ f.after - f.before }}
          </span>
        </div>
      </template>
    </div>

    <div class="ht-sec" v-if="pl.chain">
      <button type="button" class="ht-sec-t ht-sec-toggle" :class="{ open: showAdvanced.chain }"
        @click="showAdvanced.chain = !showAdvanced.chain">
        <span class="ht-sec-caret">▸</span> 事件因果链
      </button>
      <div v-show="showAdvanced.chain" class="ht-sec-body">
        <div v-for="(n, i) in pl.chain as ChainNode[]" :key="i" class="ht-cnode">
          <span class="ht-cnum">{{ i + 1 }}</span>
          <div>
            <div class="ht-ct">{{ n.t }}</div>
            <div class="ht-cd">{{ n.d }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="ht-sec" v-if="pl.candidates">
      <button type="button" class="ht-sec-t ht-sec-toggle" :class="{ open: showAdvanced.candidates }"
        @click="showAdvanced.candidates = !showAdvanced.candidates">
        <span class="ht-sec-caret">▸</span> AI 候选评分
      </button>
      <div v-show="showAdvanced.candidates" class="ht-sec-body">
        <div v-for="(c, i) in pl.candidates as ScoreCandidate[]" :key="i" class="ht-scrow" :class="{ win: c.id === pl.chosen }">
          <span class="n">{{ c.name }}{{ c.id === pl.chosen ? ' ✓' : '' }}</span>
          <span class="b"><i :style="{ width: c.score + '%' }"></i></span>
          <span class="v">{{ c.score }}</span>
        </div>
      </div>
    </div>

    <div class="ht-sec" v-if="pl.fields">
      <button type="button" class="ht-sec-t ht-sec-toggle" :class="{ open: showAdvanced.fields }"
        @click="showAdvanced.fields = !showAdvanced.fields">
        <span class="ht-sec-caret">▸</span> 属性重算
      </button>
      <div v-show="showAdvanced.fields" class="ht-sec-body">
        <div v-for="(f, i) in pl.fields as FieldChange[]" :key="i" class="ht-kvrow">
          <span class="k">{{ f.k }}</span>
          <span class="v">{{ f.from }} → <b style="color: var(--color-warning)">{{ f.to }}</b></span>
        </div>
      </div>
    </div>

    <div class="ht-sec" v-if="kvRows.length">
      <button type="button" class="ht-sec-t ht-sec-toggle" :class="{ open: showAdvanced.kv }"
        @click="showAdvanced.kv = !showAdvanced.kv">
        <span class="ht-sec-caret">▸</span> 载荷字段<span class="ht-sec-count">{{ kvRows.length }}</span>
      </button>
      <div v-show="showAdvanced.kv" class="ht-sec-body">
        <div v-for="(r, i) in kvRows" :key="i" class="ht-kvrow">
          <span class="k">{{ r[0] }}</span>
          <span class="v">{{ r[1] }}</span>
        </div>
      </div>
    </div>

    <div class="ht-sec" v-if="children.length">
      <button type="button" class="ht-sec-t ht-sec-toggle" :class="{ open: showAdvanced.children }"
        @click="showAdvanced.children = !showAdvanced.children">
        <span class="ht-sec-caret">▸</span> 子事件（{{ children.length }}）
      </button>
      <div v-show="showAdvanced.children" class="ht-sec-body">
        <button v-for="c in children" :key="c.id" type="button" class="ht-childrow" @click="store.focusEvent(c.id, { seek: true })">
          <span class="ci" :class="'ht-' + meta(c).cls">{{ meta(c).icon }}</span>
          <span class="cs">{{ c.summary }}</span>
          <span class="ctm">{{ formatTime(c.timestamp) }}</span>
        </button>
      </div>
    </div>
  </div>

  <div v-else class="ht-insp-empty">
    点击任意事件以检视底层数据<br />
    回放系统按时间序检视每一秒 · 调试系统按因果链审查每一次行动 —— 两者共享同一数据源
  </div>

  <Teleport to="body">
    <div v-if="stepTip.visible" class="ht-step-tip" :style="{ left: stepTip.x + 'px', top: stepTip.y + 'px' }">
      <div class="ht-step-tip-title">{{ stepTip.title }}</div>
      <div class="ht-step-tip-detail">{{ stepTip.detail }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { CalcStep, ChainNode, RngRoll, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { ACTION_TAG_TEXT } from '@/domain/battle/replay/unified/unified-debug-tree'
import { DamageCategoryName, SkillTypeName } from '@/domain/skill/types'
import type { TracePhase } from '@/shared/types/trace-event'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import {
  accumulateSteps,
  describeSrc,
  fmtRunning,
  roundStepVal,
  stepNameCN,
  type StepAccum,
} from '@/domain/battle/replay/unified/unified-steps'
import { useHaotianStore } from '../stores/haotianStore'
import Button from '@/presentation/components/Button.vue'

interface ScoreCandidate {
  id: string
  name: string
  score: number
}

interface FieldChange {
  k: string
  v?: unknown
  from: number
  to: number
}

/**
 * 检视器：默认显示 store 选中事件；也可由父级传入显式事件（组件测试注入等）。
 * event 为 undefined（未传）时回退 store.selectedEvent，为 null 时显示空态。
 */
const props = withDefaults(defineProps<{ event?: UnifiedEvent | null }>(), { event: undefined })

const store = useHaotianStore()

const ev = computed<UnifiedEvent | null>(() => (props.event === undefined ? store.selectedEvent : props.event))
const meta = (e: UnifiedEvent) => PHASE_META[e.phase]
const pl = computed<Record<string, unknown>>(() => (ev.value?.payload ?? {}) as Record<string, unknown>)

/**
 * 检视器主标题：action_execution 显示"名字 · 技能名"（从调试树节点解析，
 * 真实录制技能名由 deriveDebugTree 从同链 damage/heal 推断），替换引擎占位 summary；
 * 结算类（伤害/治疗）显示完整阶段名"伤害计算/治疗计算"，其余事件显示阶段标签；
 * 具体描述交给次级行 inspSub。
 */
const CALC_TITLE: Partial<Record<TracePhase, string>> = {
  damage_calculation: '伤害计算',
  heal_calculation: '治疗计算',
}

const inspTitle = computed<string>(() => {
  const e = ev.value
  if (!e) return ''
  if (e.phase === 'action_execution') {
    const node = store.debugNodes.find((n) => n.action && n.events.some((x) => x.id === e.id))
    if (node?.name) return node.name
  }
  return CALC_TITLE[e.phase] ?? meta(e).label
})

/** 检视器次级行：事件具体描述，剥离与主标题阶段标签重复的"伤害计算 / 治疗计算 "前缀 */
const inspSub = computed<string>(() => {
  const e = ev.value
  if (!e) return ''
  return e.summary.replace(/^(伤害计算|治疗计算) /, '')
})

// 高级区折叠态（载荷字段 / 因果链 / AI 候选 / 属性重算 / 子事件默认收起，减少信息轰炸）
// NOTE: 折叠偏好按 localStorage 持久化，跨事件 / 跨会话记忆，避免每次展开期望的区
const INSP_SEC_KEY = 'haotian.insp-sections.v1'

function loadSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(INSP_SEC_KEY)
    if (raw) return JSON.parse(raw) as Record<string, boolean>
  } catch {
    /* 读取失败静默 */
  }
  return {}
}

const showAdvanced = reactive<Record<string, boolean>>({
  kv: false,
  chain: false,
  candidates: false,
  fields: false,
  children: false,
  ...loadSections(),
})

watch(
  showAdvanced,
  (v) => {
    try {
      localStorage.setItem(INSP_SEC_KEY, JSON.stringify(v))
    } catch {
      /* 写入失败静默 */
    }
  },
  { deep: true },
)

// ───────────── 结算步骤：逐步累计 + 来源释义 ─────────────
const steps = computed<StepAccum[]>(() => {
  const list = pl.value.steps as CalcStep[] | undefined
  return list ? accumulateSteps(list) : []
})

// ── 结算步骤来源释义：跟随鼠标的自定义 tooltip（原生 title 对 src 为空的真实录制无提示） ──
const stepTip = reactive({ visible: false, x: 0, y: 0, title: '', detail: '' })
function onStepEnter(e: MouseEvent, step: CalcStep): void {
  const hint = describeSrc(step.src)
  stepTip.title = step.n
  stepTip.detail = hint ? `${hint} · 来源 ${step.src}` : `来源 ${step.src || '未记录'}`
  stepTip.visible = true
  positionStepTip(e)
}
function onStepMove(e: MouseEvent): void {
  if (stepTip.visible) positionStepTip(e)
}
function onStepLeave(): void {
  stepTip.visible = false
}
function positionStepTip(e: MouseEvent): void {
  const pad = 14
  stepTip.x = Math.min(e.clientX + pad, window.innerWidth - 240)
  stepTip.y = e.clientY + pad
}

const resultMismatch = computed(() => {
  const r = pl.value.result
  if (typeof r !== 'number' || !steps.value.length) return false
  return Math.abs(steps.value[steps.value.length - 1].running - r) > 1
})

const resultDiff = computed(() => {
  const r = pl.value.result
  if (typeof r !== 'number' || !steps.value.length) return '—'
  const diff = steps.value[steps.value.length - 1].running - r
  return `${diff > 0 ? '+' : ''}${roundStepVal(diff)}`
})

const ROLL_NAME: Record<string, string> = {
  hit: '命中判定',
  crit: '暴击判定',
  resist: '效果抵抗',
  passive: '被动触发率',
}

const KV_LABEL: Record<string, string> = {
  skill: '技能',
  skillName: '技能名',
  skillType: '技能类型',
  category: '伤害类型',
  hits: '段数',
  controlMode: '控制模式',
  buff: 'Buff',
  buffName: 'Buff 名',
  resisted: '是否被抵抗',
  passive: '被动',
  passiveId: '被动 ID',
  chance: '触发概率',
  death: '致死',
  dot: '持续伤害',
  counter: '反击',
  reason: '重算原因',
  configs: '配置条数',
  validated: '校验通过',
  winner: '胜方',
  rounds: '总回合',
  action: '动作',
  actionType: '行动类型',
  engine: '引擎',
  energyCost: '能量消耗',
  seg: '段序号',
  dodge: '闪避',
  crit: '暴击',
  stacks: '层数',
  oldStacks: '原层数',
  newStacks: '新层数',
  duration: '持续回合',
  remainingTurns: '剩余回合',
  turns: '回合数',
  round: '回合',
  amount: '数值',
  base: '基础值',
  raw: '原始值',
  final: '最终值',
  overflow: '溢出',
  targetId: '目标',
  sourceId: '来源',
  actorId: '行动方',
  attribute: '属性',
  value: '数值',
  currentTotal: '当前总值',
  verdict: '判定',
  skipReason: '跳过原因',
  owner: '持有者',
  trigger: '触发时机',
  aliveCount: '存活数',
  energyGain: '能量回复',
  chosen: '选定目标',
  instanceId: '实例 ID',
  stepId: '步骤 ID',
}

const SKIP_KEYS = ['steps', 'rolls', 'chain', 'candidates', 'fields', 'anchor', 'result']

const rollName = (kind: string): string => ROLL_NAME[kind] ?? kind
/** 真实录制未记录随机值、由判定结果反推的标记（rolls 可选扩展字段，非 RngRoll 基础成员） */
const derivedOf = (c: RngRoll): boolean => Boolean((c as { derived?: boolean }).derived)

const opClass = (op: string): string => (op === '×' ? 'mul' : op === '−' ? 'sub' : 'add')
const valClass = (op: string, v: number): string => (op === '×' ? 'mul' : op === '−' || v < 0 ? 'neg' : 'pos')
const fmtVal = (op: string, v: number): string => {
  // NOTE: 步骤值先 round 消除浮点尾差（extraValues 累加如 50.830000000000005），
  //       与累计列 fmtRunning 同口径，避免一行 50.83 一行 50.830000000000005。
  const r = roundStepVal(v)
  if (op === '×') return `× ${r}`
  if (op === '−') return `− ${Math.abs(r)}`
  if (op === '+') return `+ ${r}`
  return String(r)
}

const children = computed<UnifiedEvent[]>(() => {
  if (!ev.value) return []
  return store.indices?.children.get(ev.value.id) ?? []
})

// ───────────── RNG 敏感性（余量 + 重掷模拟）─────────────
const rerolls = reactive(new Map<string, number>())

const rerollKey = (i: number): string => `${ev.value?.id ?? ''}:${i}`
const rollOf = (i: number): number => {
  const list = pl.value.rolls as RngRoll[] | undefined
  return rerolls.get(rerollKey(i)) ?? list?.[i]?.roll ?? 0
}
const rateOf = (i: number): number => {
  const list = pl.value.rolls as RngRoll[] | undefined
  return list?.[i]?.rate ?? 0
}
const passOf = (i: number): boolean => rollOf(i) < rateOf(i)
const marginOf = (i: number): number => Math.abs(rateOf(i) - rollOf(i)) * 100
const rerolled = (i: number): boolean => rerolls.has(rerollKey(i))
/** 重掷是否翻转判定（相对原始 roll） */
const rerollFlip = (i: number): boolean => {
  const list = pl.value.rolls as RngRoll[] | undefined
  if (!list?.[i]) return false
  return passOf(i) !== list[i].roll < list[i].rate
}
function doReroll(i: number): void {
  const newRoll = Math.round(Math.random() * 1000) / 1000
  // 本地模拟仍即时展示翻转；同时把新 roll 写入真实分支并载入分支对比，
  // 让"重掷"从假模拟变为可核验的分支（不再只存在于检视器本地）
  rerolls.set(rerollKey(i), newRoll)
  if (ev.value) store.rerollIntoBranch(ev.value.id, i, newRoll)
}

/** 载荷中值为单位 id 的字段：显示名字而非内部 id（真实录制 payload 含 sourceId/targetId 等） */
const ID_KEYS = new Set(['sourceId', 'targetId', 'actorId', 'chosen'])

/** 枚举值 → 中文文本（category 普攻为 physical 等原始值；skillType 技能为 small/ultimate） */
const ENUM_TEXT: Record<string, Record<string, string>> = {
  category: DamageCategoryName,
  skillType: SkillTypeName,
  // NOTE: 复用 ACTION_TAG_TEXT，行动类型标签与时间线/行动卡片同源，避免文案漂移
  actionType: ACTION_TAG_TEXT,
}

const kvRows = computed<Array<[string, string]>>(() => {
  const rows: Array<[string, string]> = []
  const payload = pl.value
  for (const k of Object.keys(payload)) {
    if (SKIP_KEYS.includes(k)) continue
    const v = payload[k]
    // NOTE: 普通攻击路径无技能对象，payload.skillType 为 undefined，不渲染该行
    if (v === undefined || v === null || typeof v === 'object') continue
    if (ID_KEYS.has(k)) {
      rows.push([KV_LABEL[k] ?? k, store.pname(String(v))])
      continue
    }
    rows.push([KV_LABEL[k] ?? k, ENUM_TEXT[k]?.[String(v)] ?? String(v)])
  }
  return rows
})

const pctOf = (id: string, f: { k: string; after: number }): string => {
  const p = store.archive?.initialState.participants.find((x) => x.id === id)
  if (!p) return '0'
  const max = f.k === 'HP' ? p.maxHp : p.maxEnergy
  return Math.max(0, Math.min(100, (f.after / max) * 100)).toFixed(1)
}

function playFromHere(): void {
  if (!ev.value) return
  store.setMode('replay')
  store.seekTo(ev.value.timestamp, { autoplay: true })
  store.toast(`已切换至回放系统，并从 ${formatTime(ev.value.timestamp)} 开始播放`)
}

function exportEvent(): void {
  if (!ev.value) return
  const text = JSON.stringify(ev.value, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `event_${ev.value.id}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 500)
  store.toast(`已导出事件 ${ev.value.id}`)
}
</script>
