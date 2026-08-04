<template>
  <div v-if="ev" class="ht-insp">
    <div class="ht-insp-hd">
      <div class="ht-insp-kicker">
        {{ ev.id }} · <span :class="'ht-' + meta(ev).cls">{{ meta(ev).label }}</span> · {{ ev.correlationId }}
        <template v-if="ev.parentId"> · ← {{ ev.parentId }}</template>
        · 时间={{ formatTime(ev.timestamp) }}
      </div>
      <div class="ht-insp-title">{{ ev.summary }}</div>
      <div class="ht-insp-actions">
        <button class="ht-btn" title="切换到回放系统，并从该事件时间点开始播放" @click="playFromHere">▶ 从此回放</button>
        <button class="ht-btn" title="导出该事件 JSON（含 payload / 快照 / 元信息）" @click="exportEvent">⇩ 导出事件 JSON</button>
      </div>
    </div>

    <div class="ht-sec" v-if="steps.length">
      <div class="ht-sec-t">
        计算过程 · 结算步骤
        <span class="ht-steps-hint">悬停来源查看释义 · 右侧为累计值</span>
      </div>
      <div v-for="(m, i) in steps" :key="i" class="ht-frow">
        <span class="ht-fop" :class="opClass(m.op)">{{ m.op || '＝' }}</span>
        <span class="ht-flab">{{ m.step.n }}<span class="src" :title="srcTitle(m.step.src)">{{ m.step.src }}</span></span>
        <span class="ht-fval" :class="valClass(m.op, m.step.v)">{{ fmtVal(m.op, m.step.v) }}</span>
        <span class="ht-facc">{{ fmtRunning(m.running) }}</span>
      </div>
      <div v-if="pl.result != null" class="ht-fres" :class="{ mismatch: resultMismatch }">
        <span class="lab">最终 · 结算结果<template v-if="resultMismatch">（与累计不一致，差额 {{ resultDiff }}）</template></span>
        <span class="num">{{ pl.result }}</span>
      </div>
    </div>

    <div class="ht-sec" v-if="pl.rolls">
      <div class="ht-sec-t">随机判定凭证</div>
      <div v-for="(c, i) in pl.rolls as RngRoll[]" :key="i" class="ht-rng">
        <div class="ht-rng-top">
          <span class="ht-rng-name">{{ rollName(c.kind) }}</span>
          <span v-if="c.buff" class="ht-rng-note">· {{ c.buff }}</span>
          <span v-if="(c as { derived?: boolean }).derived" class="ht-rng-note" title="真实录制未记录随机值，此值由判定结果反推">· 由结果推导</span>
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
          <button class="ht-mini-btn" title="仅模拟重掷，不改变存档数据" @click="doReroll(i)">重掷该判定（仅模拟）</button>
          <span v-if="rerolled(i)" class="ht-rng-reroll" :class="rerollFlip(i) ? 'v-fail' : 'v-pass'">
            {{ rerollFlip(i) ? '重掷翻转！' : '重掷未翻转' }}
          </span>
        </div>
      </div>
    </div>

    <div class="ht-sec" v-if="ev._delta?.length">
      <div class="ht-sec-t">状态增量 · 快照（变更后绝对值）</div>
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
      <div class="ht-sec-t">事件因果链</div>
      <div v-for="(n, i) in pl.chain as ChainNode[]" :key="i" class="ht-cnode">
        <span class="ht-cnum">{{ i + 1 }}</span>
        <div>
          <div class="ht-ct">{{ n.t }}</div>
          <div class="ht-cd">{{ n.d }}</div>
        </div>
      </div>
    </div>

    <div class="ht-sec" v-if="pl.candidates">
      <div class="ht-sec-t">AI 候选评分</div>
      <div v-for="(c, i) in pl.candidates as ScoreCandidate[]" :key="i" class="ht-scrow" :class="{ win: c.id === pl.chosen }">
        <span class="n">{{ c.name }}{{ c.id === pl.chosen ? ' ✓' : '' }}</span>
        <span class="b"><i :style="{ width: c.score + '%' }"></i></span>
        <span class="v">{{ c.score }}</span>
      </div>
    </div>

    <div class="ht-sec" v-if="pl.fields">
      <div class="ht-sec-t">属性重算</div>
      <div v-for="(f, i) in pl.fields as FieldChange[]" :key="i" class="ht-kvrow">
        <span class="k">{{ f.k }}</span>
        <span class="v">{{ f.from }} → <b style="color: var(--color-warning)">{{ f.to }}</b></span>
      </div>
    </div>

    <div class="ht-sec" v-if="kvRows.length">
      <div class="ht-sec-t">载荷字段</div>
      <div v-for="(r, i) in kvRows" :key="i" class="ht-kvrow">
        <span class="k">{{ r[0] }}</span>
        <span class="v">{{ r[1] }}</span>
      </div>
    </div>

    <div class="ht-sec" v-if="children.length">
      <div class="ht-sec-t">子事件（{{ children.length }}）</div>
      <div v-for="c in children" :key="c.id" class="ht-childrow" @click="store.focusEvent(c.id, { seek: true })">
        <span class="ci" :class="'ht-' + meta(c).cls">{{ meta(c).icon }}</span>
        <span class="cs">{{ c.summary }}</span>
        <span class="ctm">{{ formatTime(c.timestamp) }}</span>
      </div>
    </div>
  </div>

  <div v-else class="ht-insp-empty">
    点击任意事件以检视底层数据<br />
    回放与调试共用同一渲染数据源（设计约定）
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { CalcStep, ChainNode, RngRoll, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import {
  accumulateSteps,
  describeSrc,
  fmtRunning,
  type StepAccum,
} from '@/domain/battle/replay/unified/unified-steps'
import { useHaotianStore } from '../stores/haotianStore'

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

const store = useHaotianStore()

const ev = computed<UnifiedEvent | null>(() => store.selectedEvent)
const meta = (e: UnifiedEvent) => PHASE_META[e.phase]
const pl = computed<Record<string, unknown>>(() => (ev.value?.payload ?? {}) as Record<string, unknown>)

// ───────────── 结算步骤：逐步累计 + 来源释义 ─────────────
const steps = computed<StepAccum[]>(() => {
  const list = pl.value.steps as CalcStep[] | undefined
  return list ? accumulateSteps(list) : []
})

const srcTitle = (src: string): string => {
  const hint = describeSrc(src)
  return hint ? `${hint}（${src}）` : src
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
  return `${diff > 0 ? '+' : ''}${Math.round(diff * 100) / 100}`
})

const ROLL_NAME: Record<string, string> = {
  hit: '命中判定',
  crit: '暴击判定',
  resist: '效果抵抗',
  passive: '被动触发率',
}

const KV_LABEL: Record<string, string> = {
  skill: '技能',
  hits: '段数',
  controlMode: '控制模式',
  buff: 'Buff',
  resisted: '是否被抵抗',
  passive: '被动',
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
  engine: '引擎',
  seg: '段序号',
}

const SKIP_KEYS = ['steps', 'rolls', 'chain', 'candidates', 'fields', 'anchor', 'result']

const rollName = (kind: string): string => ROLL_NAME[kind] ?? kind

const opClass = (op: string): string => (op === '×' ? 'mul' : op === '−' ? 'sub' : 'add')
const valClass = (op: string, v: number): string => (op === '×' ? 'mul' : op === '−' || v < 0 ? 'neg' : 'pos')
const fmtVal = (op: string, v: number): string => {
  if (op === '×') return `× ${v}`
  if (op === '−') return `− ${Math.abs(v)}`
  if (op === '+') return `+ ${v}`
  return String(v)
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
  rerolls.set(rerollKey(i), Math.round(Math.random() * 1000) / 1000)
}

const kvRows = computed<Array<[string, string]>>(() => {
  const rows: Array<[string, string]> = []
  const payload = pl.value
  for (const k of Object.keys(payload)) {
    if (SKIP_KEYS.includes(k)) continue
    const v = payload[k]
    if (v === null || typeof v === 'object') continue
    rows.push([KV_LABEL[k] ?? k, String(v)])
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
