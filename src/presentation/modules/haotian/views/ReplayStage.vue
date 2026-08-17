<template>
  <div class="ht-stage">
    <div class="ht-stage-hd">
      <span class="ht-chip ht-turn">{{ store.currentTurn ? '第 ' + store.currentTurn + ' 回合' : '待命' }}</span>
      <span class="ht-chip">{{ phaseChipLabel }}</span>
      <span class="ht-time-read">{{ store.timeRead }}</span>
      <span class="ht-stage-hd-fill"></span>
      <span class="ht-zoom" role="group" aria-label="时间轴刻度密度">
        <span class="ht-zoom-label">刻度</span>
        <button v-for="z in ZOOMS" :key="z.v" type="button" class="ht-zoom-btn" :class="{ on: zoom === z.v }"
          :title="z.t" :aria-pressed="zoom === z.v" @click="zoom = z.v">{{ z.l }}</button>
      </span>
      <span class="ht-proj-tag">回放 · 按时间播放</span>
    </div>

    <div v-if="!store.archive" class="ht-stage-empty">
      <div v-if="store.loadingArchive" class="ht-se-loading">
        <span class="ht-se-spinner" aria-hidden="true"></span>
        <span class="ht-se-hint">正在载入战斗数据…</span>
      </div>
      <template v-else>
        <div class="ht-se-hint">尚未加载战斗数据</div>
        <div class="ht-se-sub">选择一种数据来源开始分析</div>
        <div class="ht-empty-cards">
          <button type="button" class="ht-empty-card" @click="onLoadDemo">
            <span class="ht-ec-t">载入演示存档</span>
            <span class="ht-ec-d">无需准备，立即体验回放与调试</span>
          </button>
          <button type="button" class="ht-empty-card" @click="onLoadLatest">
            <span class="ht-ec-t">打开最近战斗记录</span>
            <span class="ht-ec-d">唤灵台「保存战斗记录」后自动存档于此</span>
          </button>
          <button type="button" class="ht-empty-card" @click="onAttachLive">
            <span class="ht-ec-t">接入实时战斗</span>
            <span class="ht-ec-d">先在唤灵台开战，过程实时流入此处</span>
          </button>
        </div>
      </template>
    </div>

    <div class="ht-arena" v-show="!!store.archive">
      <div v-for="(side, si) in sides" :key="si" class="ht-arena-side" :class="{ right: si === 1 }">
        <ParticipantCard v-for="p in side" :key="p.id" class="ht-unit" :data-uid="p.id"
          :ref="(el) => registerUnit(p.id, el)" :display-data="displayDataOf(p)"
          :is-active="actingId === p.id" :is-enemy="si === 1" />
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

      <div class="ht-seek" role="slider" aria-label="回放进度条" tabindex="0"
        :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="seekPct" :aria-valuetext="store.timeRead"
        @click="onSeekClick" @keydown="onSeekKeydown">
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
import type { ArchiveParticipant, ArchiveBuff, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import { useHaotianStore } from '../stores/haotianStore'

import BattleVisualEffects from '@/presentation/components/BattleVisualEffects.vue'
import ParticipantCard, { type ParticipantDisplayData } from '@/presentation/components/ParticipantCard.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import { useBattleAnimation } from '@/presentation/composables/useBattleAnimation'
import { getActionBudget, BATTLE_ANIMATION_TIMING } from '@/shared/constants/animation-timing'
import type { BuffRawItem } from '@/shared/types/buff-display'
import { resolveBuffMeta } from '@/shared/utils/buff-meta'
import { ActionResultType } from '@/domain/battle/type/types'

const speedOptions: TSelectOption[] = [0.5, 1, 2, 4].map((s) => ({ value: s, label: `${s}×` }))

const store = useHaotianStore()

// 空态主 CTA（首次进入即可完成的第一个动作）
const onLoadDemo = (): void => void store.loadDemo()
const onLoadLatest = (): void => void store.attachLatest()
const onAttachLive = (): void => void store.attachLive()

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

/**
 * ArchiveBuff → BuffRawItem：存档仅含 name/stacks/turns，
 * 正负与属性明细由 resolveBuffMeta 按名字反查 buffs.json 配置补全
 * （匹配失败时退化为纯名字展示，未记录进存档的脚本自定义 buff 亦可显示）。
 */
function toBuffRawItem(b: ArchiveBuff): BuffRawItem {
  const meta = resolveBuffMeta(b.name)
  return {
    id: b.name,
    buffId: b.name,
    name: b.name,
    currentStacks: b.stacks,
    remainingTurns: b.turns,
    isAura: false,
    isNegative: meta.isNegative,
    attributes: meta.attributes,
    description: meta.description,
  }
}

/** ArchiveParticipant + 模拟状态 → ParticipantDisplayData（回放舞台卡片数据源，与演武台同款 ParticipantCard） */
function displayDataOf(p: ArchiveParticipant): ParticipantDisplayData {
  const u = unitOf(p.id)
  return {
    id: p.id,
    name: p.name,
    maxHp: p.maxHp,
    hp: Math.max(0, u.hp),
    maxEnergy: p.maxEnergy,
    energy: Math.max(0, u.en),
    shield: 0,
    buffs: u.buffs.map(toBuffRawItem),
    isAlive: u.hp > 0,
    speed: store.playback.speed,
  }
}

const phaseChipLabel = computed(() => {
  const e = store.lastEvent
  return e ? meta(e).label : '—'
})

const tsPct = (ev: UnifiedEvent): number => (store.duration ? (ev.timestamp / store.duration) * 100 : 0)
const curPct = computed(() => (store.duration ? (store.playback.t / store.duration) * 100 : 0))
const seekPct = computed(() => Math.round(curPct.value))

// seek 刻度聚簇：默认只标 回合开始 与 战斗根事件（生命周期），避免千级事件刻度重叠
// 缩放级别放大时逐级加入更多事件类型
const ZOOMS: Array<{ v: number; l: string; t: string }> = [
  { v: 1, l: '粗', t: '只标回合开始与生命周期事件' },
  { v: 2, l: '中', t: '加入 Buff / 被动触发' },
  { v: 3, l: '细', t: '再加入伤害 / 治疗' },
  { v: 4, l: '全', t: '全部可见事件' },
]
const zoom = ref(1)

const seekMarks = computed(() =>
  store.evs.filter((e) => {
    if (meta(e).debugOnly && !store.showDbg) return false
    if (e.phase === 'turn_flow') return (e.payload as Record<string, unknown>)?.action === 'start'
    if (e.phase === 'battle_lifecycle') return true
    if (zoom.value < 2) return false
    if (e.phase === 'buff_lifecycle' || e.phase === 'buff_trigger' || e.phase === 'passive_trigger') return true
    if (zoom.value < 3) return false
    if (e.phase === 'damage_calculation' || e.phase === 'heal_calculation') return true
    if (zoom.value < 4) return false
    return e.phase === 'action_execution'
  }),
)

const overlayShow = computed(() => {
  const end = store.evs.find((e) => e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end')
  return !!end && store.playback.t >= end.timestamp
})
const overlaySub = computed(() => {
  const end = store.evs.find((e) => e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end')
  if (!end || !store.archive) return ''
  const winner = store.archive.winner ? store.winnerLabel(store.archive.winner) : '未知'
  return `${winner} 获胜 · ${formatTime(end.timestamp)}`
})

function onSeekClick(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  store.seekTo(((e.clientX - rect.left) / rect.width) * store.duration, { keepPlay: true })
}

function onSeekKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    store.stepEvent(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    store.stepEvent(1)
  } else if (e.key === 'Home') {
    e.preventDefault()
    store.seekTo(0)
  } else if (e.key === 'End') {
    e.preventDefault()
    store.seekTo(store.duration)
  }
}

// ───────────── 特效与卡片动画（与唤灵台演武台同款：ParticipantCard 状态动画 + BattleVisualEffects + GSAP 突进）─────────────

const actingId = ref<string | null>(null)
const vfRef = ref<InstanceType<typeof BattleVisualEffects> | null>(null)
const unitCards = new Map<string, InstanceType<typeof ParticipantCard>>()
const unitEls = new Map<string, HTMLElement>()
const { registerElement, unregisterElement, playAttackAnimation, playHitAnimation, playBuffAnimation, setBattleSpeed } =
  useBattleAnimation()

/** 注册单位卡片：cardRef 供 BattleVisualEffects 定位 + GSAP 动画（与唤灵台 BattleField 同模式） */
function registerUnit(id: string, card: InstanceType<typeof ParticipantCard> | null): void {
  if (card) {
    unitCards.set(id, card)
    const root = card.cardRef as HTMLElement | null
    if (root) {
      unitEls.set(id, root)
      vfRef.value?.registerCard(id, root)
      registerElement(id, root)
    }
  } else {
    unitCards.delete(id)
    unitEls.delete(id)
    vfRef.value?.unregisterCard(id)
    unregisterElement(id)
  }
}

// vfRef 就绪时补注册已渲染单位（解决渲染时序竞态）
watch(vfRef, (vf) => {
  if (!vf) return
  for (const [id, el] of unitEls) vf.registerCard(id, el)
}, { immediate: true })

// 倍速同步到 GSAP（与唤灵台 setBattleSpeed 同口径）
watch(() => store.playback.speed, (s) => setBattleSpeed(s), { immediate: true })

function sideOf(id: string): 'left' | 'right' {
  return sides.value[0].some((p) => p.id === id) ? 'left' : 'right'
}

function fx(ev: UnifiedEvent): void {
  const pl = (ev.payload ?? {}) as Record<string, unknown>
  const vf = vfRef.value
  const budget = getActionBudget(store.playback.speed)
  const cardOf = (id: string) => unitCards.get(id)
  if (ev.phase === 'action_execution') {
    const src = ev.sourceId
    if (src) {
      actingId.value = src
      setTimeout(() => {
        if (actingId.value === src) actingId.value = null
      }, 750)
      // casting 蓄力 + GSAP 突进 + 技能名/光弹飞行（演武台同款三件套）
      cardOf(src)?.triggerVisualState('casting', budget * BATTLE_ANIMATION_TIMING.PHASES.windup.end)
      void playAttackAnimation(src, sideOf(src), undefined, budget)
      if (vf && ev.targetId) {
        vf.playFlightSequence(src, ev.targetId, String(pl.skill ?? ev.summary), sideOf(src), 'fire', budget)
      }
    }
  } else if (ev.phase === 'damage_calculation') {
    const target = ev.targetId
    if (!target || !vf) return
    if (pl.dodge) {
      vf.showMissText(target, budget)
      void playHitAnimation(target, { hitEffect: ActionResultType.MISS })
    } else {
      cardOf(target)?.triggerVisualState('hurt', budget * 0.4)
      vf.showImpact(target, 'fire', budget)
      vf.showDamageNum(target, Number(pl.result ?? 0), !!pl.crit, budget)
      if (pl.crit) vf.showScreenShake()
    }
  } else if (ev.phase === 'heal_calculation') {
    const target = ev.targetId
    if (!target || !vf) return
    cardOf(target)?.triggerVisualState('healed', budget * 0.4)
    cardOf(target)?.flashHpBar(budget)
    vf.showHealAura(target, budget)
    vf.showHealNum(target, Number(pl.result ?? 0), budget)
  } else if (ev.phase === 'buff_lifecycle') {
    const target = ev.targetId
    if (!target || pl.action !== 'apply') return
    // 正负由 payload.buff / buffName 反查 buffs.json 配置；未命中默认正向
    const isNegative = resolveBuffMeta(String(pl.buff ?? pl.buffName ?? '')).isNegative === true
    cardOf(target)?.triggerVisualState('shielded', budget * BATTLE_ANIMATION_TIMING.PHASES.settle.start)
    void playBuffAnimation(target, !isNegative)
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
