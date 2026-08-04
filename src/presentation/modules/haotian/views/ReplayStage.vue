<template>
  <div class="ht-stage">
    <div class="ht-stage-hd">
      <span class="ht-time-read">{{ store.timeRead }}</span>
      <span class="ht-chip ht-turn">{{ store.currentTurn ? '第 ' + store.currentTurn + ' 回合' : '待命' }}</span>
      <span class="ht-chip">{{ phaseChipLabel }}</span>
      <span class="ht-proj-tag">回放 · <b>按时间播放</b></span>
    </div>

    <div class="ht-arena">
      <div v-for="(side, si) in sides" :key="si" class="ht-arena-side" :class="{ right: si === 1 }">
        <div v-for="p in side" :key="p.id" class="ht-unit" :data-uid="p.id" :ref="(el) => registerUnit(p.id, el)"
          :class="{ dead: hpOf(p) <= 0, acting: actingId === p.id }">
          <div class="ht-u-top">
            <span class="ht-u-name">{{ p.name }}</span>
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
        </div>
      </div>
      <div class="ht-arena-mid"><span class="ht-vs">VS</span></div>
      <div class="ht-overlay" :class="{ show: overlayShow }">
        <div class="big">胜利</div>
        <div class="sub">{{ overlaySub }}</div>
      </div>
    </div>

    <div class="ht-transport">
      <Button class="ht-tbtn" title="回到开头" @click="store.seekTo(0)">回到开头</Button>
      <Button class="ht-tbtn" title="上一事件 (←)" @click="store.stepEvent(-1)">上一事件</Button>
      <Button variant="energy" class="ht-tbtn" title="播放/暂停 (空格)" @click="store.togglePlay()">
        {{ store.playback.playing ? '暂停' : '播放' }}
      </Button>
      <Button class="ht-tbtn" title="下一事件 (→)" @click="store.stepEvent(1)">下一事件</Button>
      <Button class="ht-tbtn" title="到结尾" @click="store.seekTo(store.duration)">到结尾</Button>

      <TacticalSelect v-model="speedModel" size="md" class="ht-speed-select"
        :options="speedOptions" placeholder="速度" />

      <div class="ht-seek" @click="onSeekClick">
        <div class="ht-seek-track"></div>
        <span v-for="ev in seekMarks" :key="ev.id" class="ht-tick" :class="'ht-' + meta(ev).tick"
          :style="{ left: tsPct(ev) + '%' }" :title="`${formatTime(ev.timestamp)} · ${ev.summary}`"
          @click.stop="store.focusEvent(ev.id, { seek: true, fx: true })"></span>
        <span class="ht-cur" :style="{ left: curPct + '%' }"></span>
      </div>

      <Button class="ht-tbtn" :active="store.playback.follow" title="播放时跟随事件流 (F)"
        @click="store.playback.follow = !store.playback.follow">跟随</Button>
    </div>

    <!-- 战斗视觉特效层（复用唤灵台同款 BattleVisualEffects，视口坐标定位） -->
    <BattleVisualEffects ref="vfRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ArchiveParticipant, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import { useHaotianStore } from '../stores/haotianStore'
import BattleVisualEffects from '@/presentation/components/BattleVisualEffects.vue'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import { getActionBudget } from '@/shared/constants/animation-timing'

const speedOptions: TSelectOption[] = [0.5, 1, 2, 4].map((s) => ({ value: s, label: `${s}×` }))

const store = useHaotianStore()

/** 播放速度 v-model 适配：TacticalSelect 值为 string | number | null，仅接收 number */
const speedModel = computed({
  get: () => store.playback.speed,
  set: (v: string | number | null) => {
    if (typeof v === 'number') store.playback.speed = v
  },
})

const meta = (ev: UnifiedEvent) => PHASE_META[ev.phase]

const participants = computed<ArchiveParticipant[]>(() => store.archive?.initialState.participants ?? [])
/** 按阵营分左右：存档标注了 side 则 ally 左 / enemy 右；老档无 side 字段 → fallback 按人数均分 */
const sides = computed<ArchiveParticipant[][]>(() => {
  const list = participants.value
  if (list.length > 0 && list.every((p) => p.side)) {
    return [
      list.filter((p) => p.side === 'ally'),
      list.filter((p) => p.side === 'enemy'),
    ]
  }
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
  return e ? meta(e).label : '—'
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
  const winner = store.archive.winner ? store.pnameSide(store.archive.winner) : '未知'
  return `${winner} 获胜 · ${formatTime(end.timestamp)}`
})

function onSeekClick(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  store.seekTo(((e.clientX - rect.left) / rect.width) * store.duration, { keepPlay: true })
}

// ───────────── 特效（fx · 复用唤灵台 BattleVisualEffects）─────────────

const actingId = ref<string | null>(null)
const vfRef = ref<InstanceType<typeof BattleVisualEffects> | null>(null)
const unitEls = new Map<string, HTMLElement>()

/** 注册单位 DOM 供 BattleVisualEffects 定位（坐标按视口计算，与唤灵台 BattleField 同模式） */
function registerUnit(id: string, el: HTMLElement | null): void {
  if (el) {
    unitEls.set(id, el)
    vfRef.value?.registerCard(id, el)
  } else {
    unitEls.delete(id)
    vfRef.value?.unregisterCard(id)
  }
}

// vfRef 就绪时补注册已渲染单位（解决渲染时序竞态）
watch(vfRef, (vf) => {
  if (!vf) return
  for (const [id, el] of unitEls) vf.registerCard(id, el)
}, { immediate: true })

function sideOf(id: string): 'left' | 'right' {
  return sides.value[0].some((p) => p.id === id) ? 'left' : 'right'
}

function fx(ev: UnifiedEvent): void {
  const pl = (ev.payload ?? {}) as Record<string, unknown>
  const vf = vfRef.value
  const budget = getActionBudget(1)
  if (ev.phase === 'action_execution') {
    const src = ev.sourceId
    if (src) {
      actingId.value = src
      setTimeout(() => {
        if (actingId.value === src) actingId.value = null
      }, 750)
      // 技能名 + 光弹飞行（唤灵台同款特效，替代自造浮字）
      if (vf && ev.targetId) {
        vf.playFlightSequence(src, ev.targetId, String(pl.skill ?? ev.summary), sideOf(src), 'fire', budget)
      }
    }
  } else if (ev.phase === 'damage_calculation') {
    const target = ev.targetId
    if (!target || !vf) return
    if (pl.dodge) {
      vf.showMissText(target, budget)
    } else {
      vf.showImpact(target, 'fire', budget)
      vf.showDamageNum(target, Number(pl.result ?? 0), !!pl.crit, budget)
      if (pl.crit) vf.showScreenShake()
    }
  } else if (ev.phase === 'heal_calculation') {
    const target = ev.targetId
    if (!target || !vf) return
    vf.showHealAura(target, budget)
    vf.showHealNum(target, Number(pl.result ?? 0), budget)
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
