<template>
  <div class="xy-realm-panel">
    <section class="xy-realm-current">
      <div class="xy-realm-head">
        <span class="xy-realm-name">{{ currentRealm.name }} · {{ currentRealm.desc }}</span>
        <span class="xy-chip xy-chip--gold">当前境界</span>
      </div>
      <p class="xy-realm-bonus">{{ currentRealm.bonus }}</p>
      <div class="xy-progress xy-progress--gold">
        <div class="xy-progress-fill" :style="{ width: currentRealm.progress * 100 + '%' }"></div>
      </div>
      <p class="xy-realm-next">
        下一重：<strong>{{ nextRealm?.name ?? '已臻化境' }}</strong>
        <span v-if="nextRealm">（需 Lv.{{ nextRealm.levelReq ?? '?' }} + {{ nextRealm.materialName ?? '?' }}×{{ nextRealm.materialCount ?? '?' }}）</span>
      </p>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">境界谱系<span class="xy-sec-count">已通 {{ reachedCount }}/{{ realms.length }}</span></h4>
      <div class="xy-realm-list">
        <div class="xy-realm-row" v-for="r in realms" :key="r.name"
          :class="{ 'is-current': isCurrent(r), 'is-locked': !r.unlocked }">
          <div class="xy-realm-main">
            <span class="xy-realm-title">{{ r.name }}</span>
            <span class="xy-chip" :class="realmStateChip(r)">{{ realmStateText(r) }}</span>
          </div>
          <p class="xy-realm-req" v-if="!r.unlocked">{{ realmReqText(r) }}</p>
          <p class="xy-realm-unlock" v-else>{{ r.bonus }}</p>
        </div>
      </div>
    </section>

    <div class="xy-realm-actions" v-if="canBreakthrough">
      <button type="button" class="xy-btn xy-btn--primary" @click="handleBreakthrough">突破至{{ nextRealm?.name }}</button>
      <span class="xy-realm-cost">消耗：{{ nextRealm?.materialName }}×{{ nextRealm?.materialCount }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { realms } from '../../data/mock'
import type { XiyouRealm } from '../../data/mock'
import { usePlayerStore } from '@/presentation/stores/playerStore'

const notification = useNotificationStore()
const playerStore = usePlayerStore()

const currentRealm = computed(() => realms.find((r) => r.level > 0) ?? realms.find((r) => r.unlocked) ?? realms[0])

const nextRealm = computed<XiyouRealm | null>(() => {
  const idx = realms.findIndex((r) => r.level > 0)
  return idx >= 0 && idx < realms.length - 1 ? realms[idx + 1] : null
})

const reachedCount = computed(() => realms.filter((r) => r.unlocked).length)

const canBreakthrough = computed(() => {
  const n = nextRealm.value
  return !!n && playerStore.player.level >= (n.levelReq ?? Infinity)
})

function isCurrent(r: XiyouRealm): boolean {
  return r.level > 0
}

function realmStateText(r: XiyouRealm): string {
  if (r.level > 0) return '当前'
  return r.unlocked ? '已通达' : '未开启'
}

function realmStateChip(r: XiyouRealm): string {
  if (r.level > 0) return 'xy-chip--gold'
  return r.unlocked ? 'xy-chip--jade' : 'xy-chip--muted'
}

function realmReqText(r: XiyouRealm): string {
  if (r.levelReq === undefined) return r.desc
  return `需 Lv.${r.levelReq} + ${r.materialName}×${r.materialCount}`
}

function handleBreakthrough() {
  const n = nextRealm.value
  const cur = currentRealm.value
  if (!n || !cur) return
  if (!confirm(`确认突破至${n.name}？消耗${n.materialName}×${n.materialCount}`)) return
  cur.level = 0
  cur.progress = 0
  n.unlocked = true
  n.level = 1
  n.progress = 0
  notification.toast(`突破「${n.name}」成功（展示态 · 待接入战斗属性）`)
}
</script>

<style scoped lang="scss">
.xy-realm-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.xy-realm-current {
  padding: var(--space-4);
  border: 1px solid rgba(var(--rgb-warning), var(--alpha-border));
  border-radius: 2px;
  background: var(--xy-gold-soft);
}

.xy-realm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.xy-realm-name {
  
  font-size: var(--font-size-xl);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-realm-bonus {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-realm-next {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);

  strong {
    color: var(--xy-ink-1);
  }
}

.xy-section {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-sec-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-sec-count {
  margin-left: auto;
  font-weight: var(--font-weight-regular);
  color: var(--xy-ink-4);
}

.xy-realm-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-realm-row {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;

  &.is-current {
    border-color: var(--xy-gold);
    background: var(--xy-gold-soft);
  }

  &.is-locked {
    opacity: 0.6;
  }
}

.xy-realm-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.xy-realm-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-realm-req,
.xy-realm-unlock {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-realm-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--xy-seal);
  border-radius: 2px;
  background: var(--xy-seal-soft);
}

.xy-realm-cost {
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: 2px;
  font-size: var(--font-size-md);
  font-family: inherit;
  letter-spacing: 2px;
  cursor: pointer;
}

.xy-btn--primary {
  border: 1px solid var(--xy-seal);
  background: var(--xy-seal);
  color: #fff;
}
</style>
