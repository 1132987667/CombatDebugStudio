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

    <!-- 炼器（灵炉核心背景） -->
    <div v-else-if="sub === 'forge'" class="xy-forge">
      <div class="xy-forge-bg" aria-hidden="true">
        <span class="xy-forge-bg__heat-rings"></span>
        <span class="xy-forge-bg__glow-bottom"></span>
        <span class="xy-forge-bg__core"></span>
        <span class="xy-forge-bg__sparks"></span>
        <span class="xy-forge-bg__vignette"></span>
      </div>

      <div class="xy-forge-head">
        <p class="xy-forge-hint">炼器术 Lv.2 · 锻造上限二阶</p>
        <div class="xy-forge-status">
          <span class="xy-chip xy-chip--gold">炉温 1840°</span>
          <span class="xy-chip xy-chip--jade">成功率 68%</span>
        </div>
      </div>
      <div v-for="r in forgeRecipes" :key="r.name" class="xy-row-card xy-forge-card"
        :class="{ 'xy-row-card--low': r.count === 0 }">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ r.name }}</span>
          <span class="xy-chip xy-chip--jade">器方 Lv.{{ r.level }}</span>
          <span class="xy-row-side">已有 ×{{ r.count }}</span>
        </div>
        <p class="xy-row-desc">{{ r.materials }}</p>
        <p class="xy-row-desc xy-row-desc--key">{{ r.effect }}</p>
      </div>
      <button type="button" class="xy-forge-btn xy-ink-hover">开始锻造</button>
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

/* ── 炼器 · 灵炉核心背景 ──
   NOTE: 移植自《深色游戏 UI 背景十案》NEW-02 灵炉核心（锻造）
   — 层：底 / 热辐射环 / 底部光晕 / 炉芯 / 上升火星 / 暗角 */
.xy-forge {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  box-sizing: border-box;
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 3px;
  overflow: hidden;
  --forge-c1: #1a0604;
  --forge-c2: #3a0d08;
  --forge-accent: #ff8a3a;
  --forge-accent2: #ffe4a0;
}

.xy-forge-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;

  > span {
    position: absolute;
    inset: 0;
  }
}

.xy-forge-bg__heat-rings {
  background: repeating-radial-gradient(
    circle at 50% 100%,
    transparent 0,
    transparent 18px,
    color-mix(in srgb, var(--forge-accent) 35%, transparent) 18px,
    transparent 20px
  );
  mix-blend-mode: screen;
  opacity: 0.35;
  -webkit-mask: radial-gradient(circle at 50% 100%, #000 0%, transparent 55%);
  mask: radial-gradient(circle at 50% 100%, #000 0%, transparent 55%);
  animation: xy-forge-heat 6s ease-in-out infinite;
}

.xy-forge-bg__glow-bottom {
  background: linear-gradient(
    0deg,
    color-mix(in srgb, var(--forge-accent) 25%, transparent) 0%,
    transparent 40%
  );
  mix-blend-mode: screen;
}

.xy-forge-bg__core {
  background: radial-gradient(
    circle 32% at 50% 92%,
    #fff 0%,
    var(--forge-accent2) 12%,
    var(--forge-accent) 28%,
    transparent 65%
  );
  mix-blend-mode: screen;
  animation: xy-forge-core 2.5s ease-in-out infinite;
}

.xy-forge-bg__sparks {
  background-image:
    radial-gradient(circle 1px at 15% 80%, var(--forge-accent2), transparent 60%),
    radial-gradient(circle 0.5px at 35% 60%, var(--forge-accent), transparent 60%),
    radial-gradient(circle 1px at 55% 75%, var(--forge-accent2), transparent 60%),
    radial-gradient(circle 0.5px at 75% 50%, var(--forge-accent), transparent 60%),
    radial-gradient(circle 1px at 85% 65%, var(--forge-accent2), transparent 60%),
    radial-gradient(circle 0.5px at 25% 40%, var(--forge-accent), transparent 60%),
    radial-gradient(circle 1px at 65% 30%, var(--forge-accent2), transparent 60%);
  background-size: 140px 140px;
  animation: xy-forge-spark 12s linear infinite;
  mix-blend-mode: screen;
  opacity: 0.7;
}

.xy-forge-bg__vignette {
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0%, transparent 12%, transparent 88%, rgba(0, 0, 0, 0.5) 100%),
    radial-gradient(ellipse 110% 90% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.4) 100%);
}

@keyframes xy-forge-heat {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1) translateY(0);
  }

  50% {
    opacity: 0.5;
    transform: scale(1.04) translateY(-6px);
  }
}

@keyframes xy-forge-core {
  0%,
  100% {
    opacity: 0.85;
    transform: scale(1);
  }

  18% {
    opacity: 1;
    transform: scale(1.03);
  }

  35% {
    opacity: 0.75;
    transform: scale(0.98);
  }

  60% {
    opacity: 0.95;
    transform: scale(1.02);
  }
}

@keyframes xy-forge-spark {
  0% {
    transform: translateY(0);
    opacity: 0.7;
  }

  100% {
    transform: translateY(-140px);
    opacity: 0.3;
  }
}

.xy-forge-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-forge-hint {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-forge-status {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}

.xy-forge-card {
  position: relative;
  z-index: 1;
  background: rgba(var(--rgb-black), 0.42);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-color: rgba(var(--rgb-warning), 0.28);

  .xy-row-name {
    color: var(--forge-accent2);
  }

  .xy-row-desc--key {
    color: var(--forge-accent);
  }
}

.xy-forge-btn {
  position: relative;
  z-index: 1;
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-4);
  align-self: center;
  border: 1px solid var(--forge-accent);
  border-radius: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--forge-accent) 45%, transparent), rgba(var(--rgb-black), 0.4));
  color: var(--forge-accent2);
  cursor: pointer;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-md);
  letter-spacing: 3px;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--forge-accent);
    color: var(--forge-c1);
  }
}
</style>
