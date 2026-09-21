<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #mates>
        <p class="xy-panel-hint">上阵伙伴上限 {{ MAX_ACTIVE_MATES }} · 主角 {{ playerStore.player.name }} Lv.{{ playerStore.player.level }}</p>
        <div class="xy-card-grid">
          <div v-for="(m, i) in mates" :key="m.name" class="xy-mate-card" :class="{ active: m.active, locked: !isUnlocked(i) }">
            <div class="xy-mate-head">
              <span class="xy-mate-name" :class="qualityClass(m.rarity)">{{ m.name }}</span>
              <span v-if="m.active" class="xy-chip xy-chip--gold">上阵</span>
            </div>
            <span class="xy-mate-role xy-chip xy-chip--jade">{{ m.role }}</span>
            <span class="xy-mate-level">Lv.{{ m.level }} · {{ qualityOf(m.rarity) }}</span>
            <div class="xy-mate-stars" aria-label="星级">
              <IconStar v-for="i in 5" :key="i" class="xy-star" :class="{ on: i <= m.stars }" />
            </div>
            <p class="xy-row-desc">{{ m.desc }}</p>
            <!-- NOTE: 上阵/下场拆成两个互斥按钮，目标状态在渲染期固定（!m.active 内联取反在连点/双击时
                 参数翻转，导致状态切回去——"点了没反应"） -->
            <button
              v-if="isUnlocked(i) && m.stats && m.level > 0 && m.active"
              type="button"
              class="xy-mate-toggle off"
              @click="setMateActive(m.name, false)"
            >下场</button>
            <button
              v-else-if="isUnlocked(i) && m.stats && m.level > 0"
              type="button"
              class="xy-mate-toggle"
              :disabled="activeMateCount >= MAX_ACTIVE_MATES"
              @click="setMateActive(m.name, true)"
            >上阵</button>
          </div>
        </div>
      </template>

      <template #pets>
        <p class="xy-panel-hint">灵宠伴战提供输出属性（常驻光环）· 伴战期间与角色同池获得经验（§18）</p>
        <p v-if="petRows.length === 0" class="xy-panel-hint">尚未获得灵宠——击败敌人有几率掉落个体（调试面板可发放）</p>
        <div v-for="row in petRows" :key="row.inst.uid" class="xy-row-card">
          <div class="xy-row-top">
            <span class="xy-row-name">{{ row.name }}</span>
            <span class="xy-chip xy-chip--jade">{{ qualityOf(row.inst.quality) }}</span>
            <span v-if="row.inst.active" class="xy-chip xy-chip--gold">伴战</span>
            <span class="xy-row-side">Lv.{{ row.inst.level }}/{{ PET_MAX_LEVEL }}</span>
          </div>
          <p class="xy-row-desc">{{ row.statsText }}</p>
          <p class="xy-row-desc xy-row-desc--key">
            资质 {{ row.inst.aptitude }}/{{ APTITUDE_CAP }} · 突破 {{ row.inst.breakthroughs }}/3
            <template v-if="row.inst.trait"> · {{ row.inst.trait }}</template>
          </p>
          <div class="xy-progress xy-progress--gold">
            <div class="xy-progress-fill" :style="{ width: expPercent(row.inst) + '%' }"></div>
          </div>
          <div class="xy-fabao-ops">
            <button type="button" class="xy-shop-buy" @click="toggleActive(row.inst)">
              {{ row.inst.active ? '歇战' : '伴战' }}
            </button>
            <button v-if="row.inst.level < PET_MAX_LEVEL" type="button" class="xy-shop-buy" @click="feed(row.inst)">
              经验丹(+500)
            </button>
            <button v-if="row.inst.aptitude < APTITUDE_CAP" type="button" class="xy-shop-buy" @click="raiseApt(row.inst)">
              资质丹(+2)
            </button>
            <button v-if="row.inst.breakthroughs < BREAKTHROUGH_STAGES.length" type="button" class="xy-shop-buy" @click="brk(row.inst)">
              突破
            </button>
          </div>
        </div>
      </template>

      
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import IconStar from '~icons/app/star'

import type { TabItem } from '@/presentation/components'
import { mates } from '../xiyouData'
import { MAX_ACTIVE_MATES } from '../battle'
import { saveManager } from '../save-bridge'
import { qualityOf } from '../quality'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import {
  APTITUDE_CAP,
  BREAKTHROUGH_STAGES,
  PET_MAX_LEVEL,
  breakthrough as petBreakthrough,
  feedExpPill,
  individualById,
  petExpNeed,
  petMountState,
  petMountStats,
  raiseAptitude,
  setPetMountActive,
  type PetMountInstance,
} from '../petMount'
import { PLAYER_BASE_ATTR_LABELS } from '@/domain/fengshen/player-config'

const playerStore = usePlayerStore()
const notification = useNotificationStore()

const sub = ref<'mates' | 'pets'>('mates')

const SUBS: TabItem[] = [
  { id: 'mates', label: '伙伴' },
  { id: 'pets', label: '灵宠' },
]

/** 伙伴解锁状态：前 4 位已解锁，余下待剧情推进（展示用；直接读 reactive mates 保证上阵切换即时响应） */
const UNLOCKED_MATES = 4
const isUnlocked = (i: number): boolean => i < UNLOCKED_MATES

const activeMateCount = computed(() => mates.filter((m) => m.active).length)

/**
 * 设置伙伴上阵状态（幂等：按钮显示什么就做什么——快速双击/连点不会翻转回原位）
 * NOTE: 此前为 toggle 取反语义，双击 = 翻转两次 = 视觉上"点了没反应"
 */
function setMateActive(name: string, active: boolean): void {
  const m = mates.find((x) => x.name === name)
  if (!m || m.active === active) return
  if (active && activeMateCount.value >= MAX_ACTIVE_MATES) {
    notification.toast(`上阵伙伴最多 ${MAX_ACTIVE_MATES} 名`, 'warning')
    return
  }
  m.active = active
  saveManager.autoSave()
  notification.toast(active ? `${m.name} 已上阵` : `${m.name} 已下场`, 'success')
}

/** 灵宠个体行（petMountState 权威；持有列表 + 养成操作） */
interface PetRow {
  inst: PetMountInstance
  name: string
  statsText: string
}

const petRows = computed<PetRow[]>(() =>
  petMountState.pets.map((inst) => ({
    inst,
    name: individualById(inst.individualId)?.name ?? inst.individualId,
    statsText: petMountStats(inst)
      .map((s) => `${PLAYER_BASE_ATTR_LABELS[s.attr as keyof typeof PLAYER_BASE_ATTR_LABELS] ?? s.attr} +${s.value}`)
      .join(' · '),
  })),
)

function expPercent(inst: PetMountInstance): number {
  if (inst.level >= PET_MAX_LEVEL) return 100
  return Math.min(100, (inst.exp / petExpNeed(inst.level)) * 100)
}

function toggleActive(inst: PetMountInstance): void {
  setPetMountActive('pet', inst.uid)
}

function feed(inst: PetMountInstance): void {
  const err = feedExpPill('pet', inst.uid)
  if (err) notification.toast(err, 'warning')
}

function raiseApt(inst: PetMountInstance): void {
  const err = raiseAptitude('pet', inst.uid)
  if (err) notification.toast(err, 'warning')
}

function brk(inst: PetMountInstance): void {
  const err = petBreakthrough('pet', inst.uid)
  if (err) notification.toast(err, 'warning')
}
</script>

<style scoped lang="scss">
.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 伙伴 ── */
.xy-mate-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;

  &.active {
    border-color: var(--xy-gold);
    background: var(--xy-gold-soft);
  }

  &.locked {
    opacity: 0.55;
  }
}

.xy-mate-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.xy-mate-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-mate-level {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-mate-stars {
  display: flex;
  gap: 2px;
}

.xy-mate-toggle {
  align-self: flex-start;
  margin-top: var(--space-1);
  padding: 2px var(--space-3);
  border: 1px solid var(--xy-gold);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-gold);
  font-family: inherit;
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  cursor: pointer;

  &:hover:not(:disabled) { background: var(--xy-gold-soft); }
  &.off { border-color: var(--xy-ink-line); color: var(--xy-ink-3); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.xy-star {
  width: 12px;
  height: 12px;
  color: var(--xy-ink-4);
  opacity: 0.5;

  &.on {
    color: var(--xy-gold);
    opacity: 1;
  }
}

.xy-row-card.activated {
  border-color: rgba(var(--rgb-warning), var(--alpha-border));
  background: var(--xy-gold-soft);
}
</style>
