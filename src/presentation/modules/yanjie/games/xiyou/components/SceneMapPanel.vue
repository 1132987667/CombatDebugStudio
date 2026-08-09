<template>
  <div class="xy-map-panel">
    <!-- 区域页签 -->
    <div class="xy-region-tabs" role="tablist" aria-label="区域章节">
      <button v-for="r in regions" :key="r.id" type="button" role="tab" class="xy-region-tab xy-ink-hover"
        :class="{ active: r.id === activeRegionId }" :aria-selected="r.id === activeRegionId"
        @click="activeRegionId = r.id">
        {{ r.name }}
      </button>
    </div>

    <!-- 大地图 -->
    <div class="xy-map" :aria-label="`${activeRegion.name} · ${activeRegion.sub} 大地图`">
      <svg :viewBox="activeRegion.viewBox" class="xy-map-svg" aria-hidden="true">
        <g class="xy-map-decor">
          <path v-for="(d, i) in activeRegion.decors" :key="i" :d="d.d" :class="`xy-map-decor--${d.kind}`" />
        </g>
        <path :d="activeRegion.route" class="xy-map-route" />

        <g v-for="s in regionScenes" :key="s.id" class="xy-map-node"
          :class="{ selected: s.id === current?.id, locked: !s.unlocked }"
          role="button" :tabindex="s.unlocked ? 0 : -1"
          @click="selectScene(s)" @keydown.enter="selectScene(s)">
          <circle :cx="s.pos.x" :cy="s.pos.y" r="6.5" />
          <path v-if="!s.unlocked" class="xy-map-lock" :d="`M ${s.pos.x - 2.5} ${s.pos.y - 1.5} a 2.5 2.5 0 0 1 5 0`" />
          <text :x="s.pos.x" :y="s.pos.y + 27" text-anchor="middle" class="xy-map-label">{{ s.name }}</text>
        </g>
      </svg>
      <span class="xy-map-region">{{ activeRegion.sub }}</span>
    </div>

    <!-- 选中关卡详情 -->
    <div v-if="current" class="xy-scene-detail">
      <div class="xy-scene-detail-top">
        <span class="xy-scene-detail-name">{{ current.name }}</span>
        <span class="xy-scene-stars" aria-label="关卡星级">
          <svg v-for="i in current.maxStars" :key="i" viewBox="0 0 24 24" class="xy-star" :class="{ on: i <= current.stars }" aria-hidden="true">
            <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
          </svg>
        </span>
      </div>
      <div class="xy-scene-detail-meta">
        <span class="xy-chip" :class="difficultyChip(current.difficulty)">{{ difficultyText(current.difficulty) }}</span>
        <span class="xy-scene-detail-range">{{ current.range }}</span>
      </div>
      <p class="xy-scene-detail-desc">{{ current.desc }}</p>
      <div class="xy-scene-detail-enemies" role="list" aria-label="本关敌人">
        <span v-for="e in current.enemies" :key="e.name" class="xy-enemy-tag" role="listitem">
          {{ e.name }} <em>[{{ e.level }}]</em>
        </span>
      </div>
      <div class="xy-scene-detail-actions">
        <button type="button" class="xy-challenge-btn" :class="{ locked: !current.unlocked }" :disabled="!current.unlocked">
          {{ current.unlocked ? '进入战斗' : '未解锁' }}
        </button>
        <button type="button" class="xy-sweep-btn" :disabled="!current.unlocked || current.stars === 0">扫荡</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { type XiyouRegion, type XiyouScene } from '../data/mock'

const props = defineProps<{
  regions: XiyouRegion[]
  scenes: XiyouScene[]
  current: XiyouScene | null
}>()

const emit = defineEmits<{ select: [scene: XiyouScene] }>()

/** 当前查看的区域 */
const activeRegionId = ref(props.current?.regionId ?? props.regions[0]?.id ?? '')

watch(
  () => props.current?.regionId,
  id => {
    if (id) activeRegionId.value = id
  },
)

const activeRegion = computed(() => props.regions.find(r => r.id === activeRegionId.value) ?? props.regions[0])

const regionScenes = computed(() => props.scenes.filter(s => s.regionId === activeRegionId.value))

function selectScene(s: XiyouScene): void {
  if (!s.unlocked) return
  emit('select', s)
}

function difficultyText(d: XiyouScene['difficulty']): string {
  return { easy: '简单', normal: '普通', hard: '困难', hell: '极难' }[d]
}

function difficultyChip(d: XiyouScene['difficulty']): string {
  return { easy: 'xy-chip--jade', normal: 'xy-chip--muted', hard: 'xy-chip--seal', hell: 'xy-chip--gold' }[d]
}
</script>

<style scoped lang="scss">
.xy-map-panel {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}

/* ── 区域页签 ── */
.xy-region-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-1);
  padding: 2px;
  margin-bottom: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.xy-region-tab {
  padding: var(--space-1) 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: var(--xy-font-body);
  font-size: var(--font-size-md);
  white-space: nowrap;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);

  &:hover {
    color: var(--xy-ink-1);
  }

  &.active {
    background: var(--xy-seal-soft);
    color: var(--xy-seal);
    font-weight: var(--font-weight-medium);
  }
}

/* ── 大地图 ── */
.xy-map {
  position: relative;
  border: 1px solid var(--xy-ink-line);
  background: linear-gradient(180deg, var(--color-bg-tertiary), var(--xy-paper));
  border-radius: 2px;
  margin-bottom: var(--space-3);
}

.xy-map-svg {
  display: block;
  width: 100%;
  height: auto;
}

.xy-map-decor {
  fill: none;
  stroke-linejoin: round;

  .xy-map-decor--mountain {
    stroke: rgba(var(--rgb-black), 0.35);
    stroke-width: 1.1;
    fill: rgba(var(--rgb-white), 0.04);
  }

  .xy-map-decor--cloud {
    stroke: rgba(var(--rgb-white), 0.28);
    stroke-width: 0.9;
    fill: rgba(var(--rgb-white), 0.06);
  }

  .xy-map-decor--water {
    stroke: rgba(var(--rgb-skill-active), 0.35);
    stroke-width: 1;
    fill: none;
  }

  .xy-map-decor--fire {
    stroke: rgba(var(--rgb-warning), 0.5);
    stroke-width: 1;
    fill: none;
  }

  .xy-map-decor--tower {
    stroke: rgba(var(--rgb-black), 0.35);
    stroke-width: 1.1;
  }

  .xy-map-decor--wave {
    stroke: rgba(var(--rgb-skill-active), 0.3);
    stroke-width: 1;
  }
}

.xy-map-route {
  fill: none;
  stroke: rgba(var(--rgb-white), 0.16);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-dasharray: 1.5 2.5;
}

.xy-map-node {
  cursor: pointer;

  circle {
    fill: var(--xy-paper);
    stroke: var(--xy-ink-3);
    stroke-width: 1.6;
    transition: all var(--transition-fast);
  }

  .xy-map-label {
    font-size: 6.5px;
    fill: var(--xy-ink-2);
    font-family: var(--xy-font-body);
    letter-spacing: 0.3px;
    stroke: var(--xy-paper);
    stroke-width: 2.4px;
    paint-order: stroke;
  }

  .xy-map-lock {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }

  &.locked {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.selected circle {
    fill: var(--xy-seal);
    stroke: var(--xy-seal);
  }

  &.selected .xy-map-label {
    fill: var(--xy-seal);
  }
}

.xy-map-region {
  position: absolute;
  top: var(--space-1);
  right: var(--space-2);
  font-size: var(--font-size-xxs);
  letter-spacing: 2px;
  color: var(--xy-ink-4);
}

/* ── 关卡详情 ── */
.xy-scene-detail {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
}

.xy-scene-detail-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.xy-scene-detail-name {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-scene-stars {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

.xy-star {
  width: 12px;
  height: 12px;
  color: var(--xy-ink-4);
  opacity: 0.4;

  &.on {
    color: var(--xy-gold);
    opacity: 1;
  }
}

.xy-scene-detail-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.xy-scene-detail-range {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-scene-detail-desc {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--xy-ink-3);
}

.xy-scene-detail-enemies {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.xy-enemy-tag {
  padding: 1px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);

  em {
    font-style: normal;
    color: var(--xy-seal);
  }
}

.xy-scene-detail-actions {
  display: flex;
  gap: var(--space-2);
}

.xy-challenge-btn,
.xy-sweep-btn {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border-radius: 2px;
  cursor: pointer;
  font-family: var(--xy-font-body);
  font-size: var(--font-size-md);
  transition: all var(--transition-fast);
}

.xy-challenge-btn {
  border: 1px solid var(--xy-seal);
  background: var(--xy-seal);
  color: #fff;

  &.locked {
    border-color: var(--xy-ink-line);
    background: var(--color-bg-secondary);
    color: var(--xy-ink-4);
    cursor: not-allowed;
  }
}

.xy-sweep-btn {
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  color: var(--xy-ink-2);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
