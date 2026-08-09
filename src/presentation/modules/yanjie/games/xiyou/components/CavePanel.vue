<template>
  <div class="xy-panel-scroll">
    <div class="xy-panel-tabs" role="tablist" aria-label="洞府子系统">
      <button v-for="s in SUBS" :key="s.id" type="button" role="tab" class="xy-panel-tab"
        :class="{ active: sub === s.id }" :aria-selected="sub === s.id" @click="sub = s.id">
        {{ s.label }}
      </button>
    </div>

    <!-- 炼丹 -->
    <div v-if="sub === 'alchemy'">
      <p class="xy-panel-hint">炼丹术 Lv.4 · 成功率 84%</p>
      <div v-for="r in alchemyRecipes" :key="r.name" class="xy-row-card" :class="{ 'xy-row-card--low': r.count === 0 }">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ r.name }}</span>
          <span class="xy-chip xy-chip--jade">配方 Lv.{{ r.level }}</span>
          <span class="xy-row-side">已有 ×{{ r.count }}</span>
        </div>
        <p class="xy-row-desc">{{ r.materials }}</p>
        <p class="xy-row-desc xy-row-desc--key">{{ r.effect }}</p>
      </div>
    </div>

    <!-- 炼器 -->
    <div v-else-if="sub === 'forge'">
      <p class="xy-panel-hint">炼器术 Lv.2 · 锻造上限二阶</p>
      <div v-for="r in forgeRecipes" :key="r.name" class="xy-row-card" :class="{ 'xy-row-card--low': r.count === 0 }">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ r.name }}</span>
          <span class="xy-chip xy-chip--jade">器方 Lv.{{ r.level }}</span>
          <span class="xy-row-side">已有 ×{{ r.count }}</span>
        </div>
        <p class="xy-row-desc">{{ r.materials }}</p>
        <p class="xy-row-desc xy-row-desc--key">{{ r.effect }}</p>
      </div>
    </div>

    <!-- 闭关 -->
    <div v-else-if="sub === 'retreat'">
      <div v-for="r in retreats" :key="r.name" class="xy-row-card">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ r.name }}</span>
          <span class="xy-chip xy-chip--jade">{{ r.time }}</span>
        </div>
        <p class="xy-row-desc">{{ r.desc }}</p>
        <p class="xy-row-desc xy-row-desc--key">收益 {{ r.reward }}</p>
      </div>
    </div>

    <!-- 药园 -->
    <div v-else-if="sub === 'farm'">
      <div class="xy-farm-grid">
        <div v-for="(c, i) in crops" :key="i" class="xy-farm-cell" :class="{ ready: c.status === '已成熟', idle: c.status === '空置' }">
          <span class="xy-farm-name">{{ c.name }}</span>
          <span class="xy-farm-status">{{ c.status }}</span>
          <div class="xy-progress xy-progress--seal">
            <div class="xy-progress-fill" :style="{ width: c.growth * 100 + '%' }"></div>
          </div>
          <span class="xy-farm-reward">{{ c.reward }}</span>
          <span class="xy-farm-time">{{ c.time }}</span>
        </div>
      </div>
      <p class="xy-panel-hint">种植术 Lv.1 · 生长时间 -5%</p>
    </div>

    <!-- 百艺 -->
    <div v-else>
      <p class="xy-panel-hint">技艺共 {{ crafts.length }} 门，随使用与任务升级</p>
      <div v-for="c in crafts" :key="c.name" class="xy-row-card">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ c.name }}</span>
          <span class="xy-row-side">{{ c.level }}/{{ c.maxLevel }}</span>
        </div>
        <p class="xy-row-desc">{{ c.effect }}</p>
        <div class="xy-progress xy-progress--line">
          <div class="xy-progress-fill" :style="{ width: c.progress * 100 + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { alchemyRecipes, crafts, crops, forgeRecipes, retreats } from '../data/mock'

const sub = ref<'alchemy' | 'forge' | 'retreat' | 'farm' | 'craft'>('alchemy')

const SUBS = [
  { id: 'alchemy', label: '炼丹' },
  { id: 'forge', label: '炼器' },
  { id: 'retreat', label: '闭关' },
  { id: 'farm', label: '药园' },
  { id: 'craft', label: '百艺' },
] as const
</script>

<style scoped lang="scss">
.xy-panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-row-card--low {
  opacity: 0.55;
}

/* ── 药园 ── */
.xy-farm-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-farm-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;

  &.ready {
    border-color: var(--xy-jade);
    background: var(--xy-jade-soft);
  }

  &.idle {
    opacity: 0.45;
    background: var(--color-bg-secondary);
  }
}

.xy-farm-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-farm-status {
  font-size: var(--font-size-md);
  color: var(--xy-jade);
}

.xy-farm-reward {
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-farm-time {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}
</style>
