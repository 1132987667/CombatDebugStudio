<template>
  <Transition name="xy-map-fade">
    <div v-if="modelValue" ref="overlayRef" class="xy-map-dlg" role="dialog" aria-modal="true"
      aria-label="降妖路引 · 大地图" tabindex="-1" @click.self="close">
      <div class="xy-map-dlg__panel">
        <header class="xy-map-dlg__head">
          <div class="xy-map-dlg__head-text">
            <h2 class="xy-map-dlg__name">降妖路引</h2>
            <p class="xy-map-dlg__sub">西游大地图 · 四域十六关</p>
          </div>
          <button type="button" class="xy-map-dlg__close" aria-label="关闭大地图" @click="close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="xy-map-dlg__tabs" role="tablist" aria-label="区域章节">
          <button v-for="r in regions" :key="r.id" type="button" role="tab" class="xy-map-dlg__tab xy-ink-hover"
            :class="{ active: r.id === activeRegionId }" :aria-selected="r.id === activeRegionId"
            @click="activeRegionId = r.id">
            <span class="xy-map-dlg__tab-name">{{ r.name }}</span>
            <span class="xy-map-dlg__tab-sub">{{ r.sub }}</span>
          </button>
        </div>

        <div class="xy-map-dlg__body">
          <div class="xy-map-dlg__map" :aria-label="`${activeRegion.name} · ${activeRegion.sub} 大地图`">
            <svg :viewBox="activeRegion.viewBox" class="xy-map-dlg__svg" aria-hidden="true"
              preserveAspectRatio="xMidYMid meet">
              <g class="xy-map-dlg__decor">
                <path v-for="(d, i) in activeRegion.decors" :key="i" :d="d.d"
                  :class="`xy-map-dlg__decor--${d.kind}`" />
              </g>
              <path :d="activeRegion.route" class="xy-map-dlg__route" />

              <g v-for="s in regionScenes" :key="s.id" class="xy-map-dlg__node"
                :class="{ selected: s.id === selectedId, locked: !s.unlocked }"
                role="button" :tabindex="s.unlocked ? 0 : -1" :aria-label="`${s.name}${s.unlocked ? '' : '（未解锁）'}`"
                @click="selectNode(s)" @keydown.enter="selectNode(s)">
                <circle :cx="s.pos.x" :cy="s.pos.y" r="7" />
                <path v-if="!s.unlocked" class="xy-map-dlg__lock" :d="`M ${s.pos.x - 2.5} ${s.pos.y - 1.5} a 2.5 2.5 0 0 1 5 0`" />
                <text :x="s.pos.x" :y="s.pos.y + 28" text-anchor="middle" class="xy-map-dlg__label">{{ s.name }}</text>
              </g>
            </svg>
            <span class="xy-map-dlg__region">{{ activeRegion.sub }}</span>
          </div>

          <aside class="xy-map-dlg__detail" aria-label="关卡详情">
            <template v-if="selected">
              <div class="xy-map-dlg__detail-top">
                <span class="xy-map-dlg__detail-name">{{ selected.name }}</span>
                <span class="xy-map-dlg__stars" :aria-label="`关卡星级 ${selected.stars}/${selected.maxStars}`">
                  <svg v-for="i in selected.maxStars" :key="i" viewBox="0 0 24 24" class="xy-map-dlg__star"
                    :class="{ on: i <= selected.stars }" aria-hidden="true">
                    <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
                  </svg>
                </span>
              </div>

              <div class="xy-map-dlg__detail-meta">
                <span class="xy-chip" :class="difficultyChip(selected.difficulty)">{{ difficultyText(selected.difficulty) }}</span>
                <span class="xy-map-dlg__detail-range">{{ selected.range }}</span>
              </div>

              <p class="xy-map-dlg__detail-desc">{{ selected.desc }}</p>

              <h3 class="xy-map-dlg__sec-title">妖敌窥探</h3>
              <div class="xy-map-dlg__enemies" role="list" aria-label="本关敌人">
                <span v-for="e in selected.enemies" :key="e.name" class="xy-enemy-tag" role="listitem">
                  {{ e.name }} <em>[{{ e.level }}]</em>
                </span>
              </div>

              <div class="xy-map-dlg__actions">
                <button type="button" class="xy-challenge-btn" :class="{ locked: !selected.unlocked }"
                  :disabled="!selected.unlocked" @click="enterBattle">
                  {{ selected.unlocked ? '进入战斗' : '未解锁' }}
                </button>
                <button type="button" class="xy-sweep-btn" :disabled="!selected.unlocked || selected.stars === 0">
                  扫荡
                </button>
              </div>
            </template>

            <p v-else class="xy-map-dlg__empty">点选地图关隘 · 尽览敌情</p>
          </aside>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { XiyouRegion, XiyouScene } from '../data/mock'

const props = defineProps<{
  modelValue: boolean
  regions: XiyouRegion[]
  scenes: XiyouScene[]
  current: XiyouScene | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [scene: XiyouScene]
}>()

const activeRegionId = ref(props.current?.regionId ?? props.regions[0]?.id ?? '')
const selectedId = ref(props.current?.id ?? '')

const activeRegion = computed(() => props.regions.find(r => r.id === activeRegionId.value) ?? props.regions[0])
const regionScenes = computed(() => props.scenes.filter(s => s.regionId === activeRegionId.value))
const selected = computed(() => props.scenes.find(s => s.id === selectedId.value) ?? null)

watch(
  () => props.current?.regionId,
  id => {
    if (id) activeRegionId.value = id
  },
)

watch(
  () => props.modelValue,
  open => {
    if (open) {
      selectedId.value = props.current?.id ?? ''
      nextTick(() => overlayRef.value?.focus())
    }
  },
)

function selectNode(s: XiyouScene): void {
  if (!s.unlocked) return
  selectedId.value = s.id
}

function enterBattle(): void {
  if (!selected.value?.unlocked) return
  emit('select', selected.value)
  close()
}

function close(): void {
  emit('update:modelValue', false)
}

function difficultyText(d: XiyouScene['difficulty']): string {
  return { easy: '简单', normal: '普通', hard: '困难', hell: '极难' }[d]
}

function difficultyChip(d: XiyouScene['difficulty']): string {
  return { easy: 'xy-chip--jade', normal: 'xy-chip--muted', hard: 'xy-chip--seal', hell: 'xy-chip--gold' }[d]
}

const overlayRef = ref<HTMLElement | null>(null)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.modelValue) close()
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped lang="scss">
.xy-map-dlg {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(var(--rgb-black), 0.72);
  backdrop-filter: blur(2px);
  outline: none;
}

.xy-map-dlg__panel {
  display: flex;
  flex-direction: column;
  width: min(1080px, 96vw);
  height: min(720px, 92vh);
  min-height: 0;
  background: var(--xy-paper);
  border: 1px solid var(--xy-ink-line);
  box-shadow: 0 24px 64px rgba(var(--rgb-black), 0.6);
  border-radius: 4px;
  overflow: hidden;
}

.xy-map-dlg__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-5);
  border-bottom: 2px solid var(--xy-ink-line);
}

.xy-map-dlg__head-text {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.xy-map-dlg__name {
  margin: 0;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 6px;
  color: var(--xy-ink-1);
}

.xy-map-dlg__sub {
  margin: 0;
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  color: var(--xy-ink-3);
}

.xy-map-dlg__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-2);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }
}

.xy-map-dlg__tabs {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-1);
  padding: var(--space-2) var(--space-5);
  border-bottom: 1px solid var(--xy-ink-line);
}

.xy-map-dlg__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-2);
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: var(--xy-font-body);

  &:hover {
    color: var(--xy-ink-1);
    border-color: var(--xy-ink-line);
  }

  &.active {
    color: var(--xy-seal);
    border-color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }
}

.xy-map-dlg__tab-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  letter-spacing: 2px;
}

.xy-map-dlg__tab-sub {
  font-size: var(--font-size-xxs);
  color: var(--xy-ink-4);
  letter-spacing: 1px;
}

.xy-map-dlg__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 0;
}

.xy-map-dlg__map {
  position: relative;
  min-width: 0;
  border-right: 1px solid var(--xy-ink-line);
  background: linear-gradient(180deg, var(--color-bg-tertiary), var(--xy-paper));
}

.xy-map-dlg__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.xy-map-dlg__region {
  position: absolute;
  top: var(--space-2);
  right: var(--space-3);
  font-size: var(--font-size-xxs);
  letter-spacing: 3px;
  color: var(--xy-ink-4);
}

.xy-map-dlg__decor {
  fill: none;
  stroke-linejoin: round;

  &--mountain {
    stroke: rgba(var(--rgb-black), 0.35);
    stroke-width: 1.1;
    fill: rgba(var(--rgb-white), 0.04);
  }

  &--cloud {
    stroke: rgba(var(--rgb-white), 0.28);
    stroke-width: 0.9;
    fill: rgba(var(--rgb-white), 0.06);
  }

  &--water,
  &--wave {
    stroke: rgba(var(--rgb-skill-active), 0.35);
    stroke-width: 1;
  }

  &--fire {
    stroke: rgba(var(--rgb-warning), 0.5);
    stroke-width: 1;
  }

  &--tower {
    stroke: rgba(var(--rgb-black), 0.35);
    stroke-width: 1.1;
  }
}

.xy-map-dlg__route {
  fill: none;
  stroke: rgba(var(--rgb-white), 0.16);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-dasharray: 1.5 2.5;
}

.xy-map-dlg__node {
  cursor: pointer;
  transition: opacity var(--transition-fast);

  circle {
    fill: var(--xy-paper);
    stroke: var(--xy-ink-3);
    stroke-width: 1.6;
    transition: all var(--transition-fast);
  }

  .xy-map-dlg__label {
    font-size: 6.5px;
    fill: var(--xy-ink-2);
    font-family: var(--xy-font-body);
    letter-spacing: 0.3px;
    stroke: var(--xy-paper);
    stroke-width: 2.6px;
    paint-order: stroke;
  }

  .xy-map-dlg__lock {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }

  &:hover circle {
    fill: var(--xy-jade-soft);
    stroke: var(--xy-jade);
  }

  &:hover .xy-map-dlg__label {
    fill: var(--xy-jade);
  }

  &.locked {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.selected circle {
    fill: var(--xy-seal);
    stroke: var(--xy-seal);
  }

  &.selected .xy-map-dlg__label {
    fill: var(--xy-seal);
    font-weight: var(--font-weight-medium);
  }
}

.xy-map-dlg__detail {
  min-width: 0;
  padding: var(--space-4);
  overflow-y: auto;
  background: var(--xy-paper-light);
}

.xy-map-dlg__detail-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.xy-map-dlg__detail-name {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-map-dlg__stars {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

.xy-map-dlg__star {
  width: 13px;
  height: 13px;
  color: var(--xy-ink-4);
  opacity: 0.4;

  &.on {
    color: var(--xy-gold);
    opacity: 1;
  }
}

.xy-map-dlg__detail-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.xy-map-dlg__detail-range {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-map-dlg__detail-desc {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--xy-ink-3);
}

.xy-map-dlg__sec-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-map-dlg__enemies {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
}

.xy-map-dlg__actions {
  display: flex;
  gap: var(--space-2);
}

.xy-map-dlg__empty {
  margin: 0;
  padding: var(--space-6) 0;
  text-align: center;
  font-size: var(--font-size-md);
  letter-spacing: 3px;
  color: var(--xy-ink-4);
}

.xy-map-dlg__detail :deep(.xy-enemy-tag) {
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

.xy-map-dlg__detail :deep(.xy-challenge-btn),
.xy-map-dlg__detail :deep(.xy-sweep-btn) {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border-radius: 2px;
  cursor: pointer;
  font-family: var(--xy-font-body);
  font-size: var(--font-size-md);
  transition: all var(--transition-fast);
}

.xy-map-dlg__detail :deep(.xy-challenge-btn) {
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

.xy-map-dlg__detail :deep(.xy-sweep-btn) {
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  color: var(--xy-ink-2);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.xy-map-fade-enter-active {
  transition: opacity var(--transition-base);
}

.xy-map-fade-leave-active {
  transition: opacity var(--transition-fast);
}

.xy-map-fade-enter-from,
.xy-map-fade-leave-to {
  opacity: 0;
}
</style>
