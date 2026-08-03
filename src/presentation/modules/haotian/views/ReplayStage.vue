<template>
  <div class="ht-stage">
    <div class="ht-stage-hd">
      <span class="ht-time-read">{{ store.timeRead }}</span>
      <span class="ht-chip ht-turn">{{ store.currentTurn ? '第 ' + store.currentTurn + ' 回合' : '待命' }}</span>
      <span class="ht-chip">{{ phaseChipLabel }}</span>
      <span class="ht-proj-tag">投影 1 · <b>按时间戳回放</b></span>
    </div>

    <div class="ht-arena">
      <div v-for="(side, si) in sides" :key="si" class="ht-arena-side" :class="{ right: si === 1 }">
        <div v-for="p in side" :key="p.id" class="ht-unit" :data-uid="p.id"
          :class="{ dead: hpOf(p) <= 0, acting: actingId === p.id }">
          <div class="ht-u-top">
            <span class="ht-u-name">{{ p.name }}</span>
            <span class="ht-u-id">{{ p.id }}</span>
            <span class="ht-u-dead">阵亡</span>
          </div>
          <div class="ht-bar hp" :class="hpTone(p)">
            <i :style="{ width: hpPct(p) + '%' }"></i>
            <span class="txt">{{ Math.max(0, hpOf(p)) }} / {{ p.maxHp }}</span>
          </div>
          <div class="ht-bar en"><i :style="{ width: enPct(p) + '%' }"></i></div>
          <div class="ht-u-en">能量 {{ Math.max(0, enOf(p)) }} / {{ p.maxEnergy }}</div>
          <div class="ht-u-buffs">
            <span v-for="b in buffsOf(p)" :key="b.name" class="ht-bf">{{ b.name }}{{ b.stacks > 1 ? ' ×' + b.stacks : '' }}</span>
          </div>
          <div class="ht-floats"></div>
        </div>
      </div>
      <div class="ht-arena-mid"><span class="ht-vs">VS</span></div>
      <div class="ht-overlay" :class="{ show: overlayShow }">
        <div class="big">胜利</div>
        <div class="sub">{{ overlaySub }}</div>
      </div>
    </div>

    <div class="ht-transport">
      <button class="ht-tbtn" title="回到开头" @click="store.seekTo(0)">⏮</button>
      <button class="ht-tbtn" title="上一事件 (←)" @click="store.stepEvent(-1)">⏪</button>
      <button class="ht-tbtn primary" title="播放/暂停 (空格)" @click="store.togglePlay()">
        {{ store.playback.playing ? '⏸' : '▶' }}
      </button>
      <button class="ht-tbtn" title="下一事件 (→)" @click="store.stepEvent(1)">⏩</button>
      <button class="ht-tbtn" title="到结尾" @click="store.seekTo(store.duration)">⏭</button>

      <div class="ht-speed-seg">
        <button v-for="s in SPEEDS" :key="s" :class="{ on: store.playback.speed === s }" :title="`播放速度 ${s} 倍`" @click="store.playback.speed = s">
          {{ s }}×
        </button>
      </div>

      <div class="ht-seek" @click="onSeekClick">
        <div class="ht-seek-track"></div>
        <span v-for="ev in seekMarks" :key="ev.id" class="ht-tick" :class="'ht-' + meta(ev).tick"
          :style="{ left: tsPct(ev) + '%' }" :title="`${formatTime(ev.timestamp)} · ${ev.summary}`"
          @click.stop="store.focusEvent(ev.id, { seek: true, fx: true })"></span>
        <span class="ht-cur" :style="{ left: curPct + '%' }"></span>
      </div>

      <button class="ht-tbtn tgl" :class="{ on: store.playback.follow }" title="播放时跟随事件流 (F)"
        @click="store.playback.follow = !store.playback.follow">⌖</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ArchiveParticipant, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import { useHaotianStore } from '../stores/haotianStore'

const SPEEDS = [0.5, 1, 2, 4]

const store = useHaotianStore()

const meta = (ev: UnifiedEvent) => PHASE_META[ev.phase]

const participants = computed<ArchiveParticipant[]>(() => store.archive?.initialState.participants ?? [])
const sides = computed<ArchiveParticipant[][]>(() => {
  const list = participants.value
  const mid = Math.ceil(list.length / 2)
  return [list.slice(0, mid), list.slice(mid)]
})

const unitOf = (id: string) => store.cur[id] ?? { hp: 0, en: 0, buffs: [] }
const hpOf = (p: ArchiveParticipant): number => unitOf(p.id).hp
const enOf = (p: ArchiveParticipant): number => unitOf(p.id).en
const buffsOf = (p: ArchiveParticipant) => unitOf(p.id).buffs ?? []
const hpPct = (p: ArchiveParticipant): number => Math.max(0, Math.min(100, (hpOf(p) / p.maxHp) * 100))
const enPct = (p: ArchiveParticipant): number => Math.max(0, Math.min(100, (enOf(p) / p.maxEnergy) * 100))
const hpTone = (p: ArchiveParticipant): string => {
  const pct = hpPct(p)
  if (pct <= 25) return 'low'
  if (pct <= 50) return 'warn'
  return ''
}

const phaseChipLabel = computed(() => {
  const e = store.lastEvent
  return e ? `${meta(e).label} · ${e.id}` : '—'
})

const tsPct = (ev: UnifiedEvent): number => (store.duration ? (ev.timestamp / store.duration) * 100 : 0)
const curPct = computed(() => (store.duration ? (store.playback.t / store.duration) * 100 : 0))

// seek 刻度聚簇：只标 回合开始 与 战斗根事件（生命周期），避免千级事件刻度重叠
const seekMarks = computed(() =>
  store.evs.filter((e) => {
    if (meta(e).debugOnly && !store.showDbg) return false
    if (e.phase === 'turn_flow') return (e.payload as Record<string, unknown>)?.action === 'start'
    return e.phase === 'battle_lifecycle'
  }),
)

const overlayShow = computed(() => {
  const end = store.evs.find((e) => e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end')
  return !!end && store.playback.t >= end.timestamp
})
const overlaySub = computed(() => {
  const end = store.evs.find((e) => e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end')
  if (!end || !store.archive) return ''
  const winner = store.archive.winner ? store.pname(store.archive.winner) : '未知'
  return `${winner} 获胜 · ${formatTime(end.timestamp)}`
})

function onSeekClick(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  store.seekTo(((e.clientX - rect.left) / rect.width) * store.duration, { keepPlay: true })
}

// ───────────── 特效（fx）─────────────

const actingId = ref<string | null>(null)

function floatNum(unitId: string, text: string, cls: string): void {
  const unit = document.querySelector<HTMLElement>(`.ht-arena .ht-unit[data-uid="${unitId}"] .ht-floats`)
  if (!unit) return
  const f = document.createElement('span')
  f.className = `ht-float-num ${cls}`
  f.style.left = 35 + Math.random() * 30 + '%'
  f.textContent = text
  unit.appendChild(f)
  setTimeout(() => f.remove(), 960)
}

function fx(ev: UnifiedEvent): void {
  const pl = (ev.payload ?? {}) as Record<string, unknown>
  if (ev.phase === 'action_execution') {
    const src = ev.sourceId
    if (src) {
      actingId.value = src
      setTimeout(() => {
        if (actingId.value === src) actingId.value = null
      }, 750)
    }
  } else if (ev.phase === 'damage_calculation') {
    const target = ev.targetId
    if (!target) return
    if (pl.dodge) {
      floatNum(target, '闪避', 'dodge')
    } else {
      floatNum(target, (pl.crit ? '暴击 ' : '−') + String(pl.result ?? 0), pl.crit ? 'crit' : '')
      if (pl.death) setTimeout(() => floatNum(target, '阵亡', 'dodge'), 260)
    }
  } else if (ev.phase === 'buff_lifecycle' && ev.targetId) {
    if (pl.resisted) floatNum(ev.targetId, '抵抗', 'resist')
    else if (pl.action === 'update') floatNum(ev.targetId, `${String(pl.buff)} ×${String(pl.stacks)}`, 'buffup')
  }
}

watch(
  () => store.fxEventId,
  (id) => {
    if (!id) return
    const ev = store.byId.get(id)
    if (ev) fx(ev)
  },
)
</script>
