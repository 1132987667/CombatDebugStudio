<template>
  <Transition name="xy-map-fade">
    <div v-if="modelValue" ref="overlayRef" class="xy-map-dlg" role="dialog" aria-modal="true"
      aria-label="降妖路引 · 大地图" tabindex="-1" @click.self="close">
      <div class="xy-map-dlg__panel">
        <header class="xy-map-dlg__head">
          <div class="xy-map-dlg__head-text">
            <h2 class="xy-map-dlg__name">降妖路引</h2>
            <p class="xy-map-dlg__sub">四域十六关 · 以步丈量</p>
          </div>
          <div class="xy-map-dlg__head-right">
            <span class="xy-map-dlg__progress">
              已踏 <em>{{ unlockedCount }}</em> / {{ scenes.length }} 关
            </span>
            <button type="button" class="xy-map-dlg__close" aria-label="关闭大地图" @click="close">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
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
              <defs>
                <linearGradient id="xy-map-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="rgba(var(--rgb-black), 0.55)" />
                  <stop offset="0.5" stop-color="rgba(var(--rgb-black), 0.18)" />
                  <stop offset="1" stop-color="rgba(var(--rgb-black), 0.02)" />
                </linearGradient>
                <linearGradient id="xy-map-hill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="rgba(var(--rgb-white), 0.1)" />
                  <stop offset="1" stop-color="rgba(var(--rgb-white), 0.02)" />
                </linearGradient>
                <radialGradient id="xy-node-halo" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0" stop-color="currentColor" stop-opacity="0.5" />
                  <stop offset="1" stop-color="currentColor" stop-opacity="0" />
                </radialGradient>
              </defs>

              <rect width="100" height="108" fill="url(#xy-map-sky)" />

              <g class="xy-map-dlg__hills">
                <path d="M -4 92 C 10 74 26 76 40 88 C 54 98 70 90 82 96 C 92 100 98 98 104 100 L 104 112 L -4 112 Z" />
                <path d="M -4 100 C 14 86 30 90 46 100 C 60 108 78 100 92 106 C 98 108 102 107 104 108 L 104 112 L -4 112 Z" />
              </g>

              <g class="xy-map-dlg__decor">
                <path v-for="(d, i) in activeRegion.decors" :key="i" :d="d.d"
                  :class="`xy-map-dlg__decor--${d.kind}`" />
              </g>

              <path :d="activeRegion.route" class="xy-map-dlg__route" />

              <g v-for="s in regionScenes" :key="s.id" class="xy-map-dlg__node"
                :class="[`xy-node--${nodeTone(s.difficulty)}`, { selected: s.id === selectedId, locked: !s.unlocked }]"
                role="button" :tabindex="s.unlocked ? 0 : -1" :aria-label="`${s.name}${s.unlocked ? '' : '（未解锁）'}`"
                @click="selectNode(s)" @keydown.enter="selectNode(s)">
                <circle class="xy-node__halo" :cx="s.pos.x" :cy="s.pos.y" r="11" fill="url(#xy-node-halo)" />
                <circle class="xy-node__ring" :cx="s.pos.x" :cy="s.pos.y" r="7" />
                <circle class="xy-node__core" :cx="s.pos.x" :cy="s.pos.y" r="4.4" />
                <path v-if="!s.unlocked" class="xy-node__lock"
                  :d="`M ${s.pos.x - 2.4} ${s.pos.y - 1.2} a 2.4 2.4 0 0 1 4.8 0 M ${s.pos.x - 2.4} ${s.pos.y - 1.2} v 3.2 M ${s.pos.x + 2.4} ${s.pos.y - 1.2} v 3.2 M ${s.pos.x - 3.4} ${s.pos.y + 2} h 6.8 v 4.4 h -6.8 Z`" />
                <text :x="s.pos.x" :y="s.pos.y + 25" text-anchor="middle" class="xy-node__label">{{ s.name }}</text>
              </g>
            </svg>

            <span class="xy-map-dlg__stamp">{{ activeRegion.sub }}</span>
          </div>

          <aside class="xy-map-dlg__detail" aria-label="关卡详情">
            <template v-if="selected">
              <div class="xy-map-dlg__scroll">
                <span class="xy-map-dlg__scroll-top" aria-hidden="true"></span>
                <span class="xy-map-dlg__scroll-bottom" aria-hidden="true"></span>
              </div>

              <header class="xy-map-dlg__detail-head">
                <div class="xy-map-dlg__detail-title">
                  <h3 class="xy-map-dlg__detail-name">{{ selected.name }}</h3>
                  <span class="xy-map-dlg__stars" :aria-label="`关卡星级 ${selected.stars}/${selected.maxStars}`">
                    <svg v-for="i in selected.maxStars" :key="i" viewBox="0 0 24 24" class="xy-map-dlg__star"
                      :class="{ on: i <= selected.stars }" aria-hidden="true">
                      <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
                    </svg>
                  </span>
                </div>
                <p class="xy-map-dlg__detail-loc">{{ regionName(selected.regionId) }} · {{ selected.range }}</p>
              </header>

              <div class="xy-map-dlg__detail-meta">
                <span class="xy-map-dlg__difficulty" :class="`xy-map-dlg__difficulty--${nodeTone(selected.difficulty)}`">
                  <span class="xy-map-dlg__difficulty-dot" aria-hidden="true"></span>
                  {{ difficultyText(selected.difficulty) }}
                </span>
                <span v-if="!selected.unlocked" class="xy-map-dlg__lock-tag">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <rect x="5" y="10" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                  尚未解锁
                </span>
                <span v-else class="xy-map-dlg__done-tag">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  已解锁
                </span>
              </div>

              <section class="xy-map-dlg__section">
                <h4 class="xy-map-dlg__section-title">妖敌窥探</h4>
                <div class="xy-map-dlg__enemies" role="list" aria-label="本关敌人">
                  <div v-for="e in selected.enemies" :key="e.name" class="xy-map-dlg__enemy" role="listitem">
                    <span class="xy-map-dlg__enemy-name">{{ e.name }}</span>
                    <span class="xy-map-dlg__enemy-level">Lv.{{ e.level }}</span>
                  </div>
                </div>
              </section>

              <section class="xy-map-dlg__section">
                <h4 class="xy-map-dlg__section-title">关隘要略</h4>
                <p class="xy-map-dlg__desc">{{ selected.desc }}</p>
              </section>

              <footer class="xy-map-dlg__actions">
                <button type="button" class="xy-map-dlg__btn xy-map-dlg__btn--primary"
                  :class="{ locked: !selected.unlocked }" :disabled="!selected.unlocked" @click="enterBattle">
                  {{ selected.unlocked ? '起行讨伐' : '未解锁' }}
                </button>
                <button type="button" class="xy-map-dlg__btn xy-map-dlg__btn--ghost"
                  :disabled="!selected.unlocked || selected.stars === 0">
                  横扫
                </button>
              </footer>
            </template>

            <p v-else class="xy-map-dlg__empty">
              点选地图关隘
              <span>尽览妖情 · 择路而进</span>
            </p>
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
const unlockedCount = computed(() => props.scenes.filter(s => s.unlocked).length)

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

function regionName(regionId: string): string {
  return props.regions.find(r => r.id === regionId)?.name ?? ''
}

function difficultyText(d: XiyouScene['difficulty']): string {
  return { easy: '简单', normal: '普通', hard: '困难', hell: '极难' }[d]
}

function nodeTone(d: XiyouScene['difficulty']): string {
  return { easy: 'easy', normal: 'normal', hard: 'hard', hell: 'hell' }[d]
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
  background: rgba(var(--rgb-black), 0.76);
  backdrop-filter: blur(3px);
  outline: none;
}

.xy-map-dlg__panel {
  display: flex;
  flex-direction: column;
  width: min(1180px, 96vw);
  height: min(760px, 92vh);
  min-height: 0;
  background: var(--xy-paper);
  border: 1px solid var(--xy-ink-line);
  box-shadow: 0 28px 80px rgba(var(--rgb-black), 0.65);
  border-radius: 4px;
  overflow: hidden;
}

/* ── 头部 ── */
.xy-map-dlg__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-5);
  border-bottom: 2px solid var(--xy-ink-line);
  background: linear-gradient(180deg, var(--color-bg-tertiary), var(--xy-paper));
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
  letter-spacing: 8px;
  color: var(--xy-ink-1);
}

.xy-map-dlg__sub {
  margin: 0;
  font-size: var(--font-size-md);
  letter-spacing: 3px;
  color: var(--xy-ink-4);
}

.xy-map-dlg__head-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.xy-map-dlg__progress {
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  color: var(--xy-ink-3);

  em {
    font-style: normal;
    color: var(--xy-gold);
  }
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

/* ── 区域页签 ── */
.xy-map-dlg__tabs {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  padding: var(--space-2) var(--space-5);
  border-bottom: 1px solid var(--xy-ink-line);
}

.xy-map-dlg__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-bottom-width: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--color-bg-secondary);
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: var(--xy-font-body);
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast);

  &:hover {
    color: var(--xy-ink-1);
    border-color: var(--xy-ink-line);
  }

  &.active {
    color: var(--xy-seal);
    border-color: var(--xy-seal);
    border-bottom-color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }
}

.xy-map-dlg__tab-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  letter-spacing: 4px;
}

.xy-map-dlg__tab-sub {
  font-size: var(--font-size-xxs);
  color: var(--xy-ink-4);
  letter-spacing: 1px;
}

/* ── 主体 ── */
.xy-map-dlg__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
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

.xy-map-dlg__stamp {
  position: absolute;
  bottom: var(--space-4);
  left: var(--space-4);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border: 1px solid rgba(var(--rgb-brand-red), 0.4);
  border-radius: 2px;
  background: rgba(var(--rgb-brand-red), 0.08);
  color: var(--xy-seal);
  font-family: var(--xy-font-title);
  font-size: var(--font-size-md);
  letter-spacing: 3px;
}

/* ── SVG 地形 ── */
.xy-map-dlg__hills {
  fill: url(#xy-map-hill);
  stroke: none;

  path:last-child {
    fill: rgba(var(--rgb-black), 0.06);
  }
}

.xy-map-dlg__decor {
  fill: none;
  stroke-linejoin: round;

  &--mountain {
    stroke: rgba(var(--rgb-black), 0.4);
    stroke-width: 1.2;
    fill: rgba(var(--rgb-white), 0.05);
  }

  &--cloud {
    stroke: rgba(var(--rgb-white), 0.32);
    stroke-width: 0.9;
    fill: rgba(var(--rgb-white), 0.08);
  }

  &--water,
  &--wave {
    stroke: rgba(var(--rgb-skill-active), 0.45);
    stroke-width: 1.1;
  }

  &--fire {
    stroke: rgba(var(--rgb-warning), 0.6);
    stroke-width: 1.2;
  }

  &--tower {
    stroke: rgba(var(--rgb-black), 0.4);
    stroke-width: 1.2;
  }
}

.xy-map-dlg__route {
  fill: none;
  stroke: rgba(var(--rgb-white), 0.22);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-dasharray: 2.5 3;
  opacity: 0.85;
}

/* ── 关卡节点 ── */
.xy-node--easy {
  color: var(--xy-jade);
}

.xy-node--normal {
  color: var(--xy-ink-3);
}

.xy-node--hard {
  color: var(--color-debuff);
}

.xy-node--hell {
  color: var(--xy-gold);
}

.xy-map-dlg__node {
  cursor: pointer;
  transition: opacity var(--transition-fast);

  .xy-node__halo {
    opacity: 0;
    transition: opacity var(--transition-base);
  }

  .xy-node__ring {
    fill: rgba(var(--rgb-black), 0.45);
    stroke: currentColor;
    stroke-width: 1.7;
    transition:
      fill var(--transition-fast),
      stroke-width var(--transition-fast);
  }

  .xy-node__core {
    fill: var(--xy-paper);
    transition: fill var(--transition-fast);
  }

  .xy-node__label {
    font-size: 6.4px;
    fill: var(--xy-ink-2);
    font-family: var(--xy-font-body);
    letter-spacing: 0.4px;
    stroke: var(--xy-paper);
    stroke-width: 2.6px;
    paint-order: stroke;
    transition: fill var(--transition-fast);
  }

  .xy-node__lock {
    fill: none;
    stroke: var(--xy-ink-4);
    stroke-width: 1.1;
    stroke-linejoin: round;
  }

  &:hover {
    .xy-node__ring {
      fill: currentColor;
      stroke-width: 2.2;
    }

    .xy-node__core {
      fill: var(--xy-paper);
    }

    .xy-node__label {
      fill: currentColor;
    }
  }

  &.selected {
    .xy-node__halo {
      opacity: 1;
    }

    .xy-node__ring {
      fill: var(--xy-seal);
      stroke: var(--xy-seal);
      stroke-width: 2.4;
    }

    .xy-node__core {
      fill: #fff;
    }

    .xy-node__label {
      fill: var(--xy-seal);
      font-weight: var(--font-weight-medium);
    }
  }

  &.locked {
    cursor: not-allowed;
    opacity: 0.55;

    .xy-node__halo {
      display: none;
    }

    &:hover {
      opacity: 0.55;
    }
  }
}

/* ── 右侧画卷详情 ── */
.xy-map-dlg__detail {
  position: relative;
  min-width: 0;
  padding: var(--space-5) var(--space-4);
  overflow-y: auto;
  background: var(--xy-paper-light);
}

.xy-map-dlg__scroll {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--space-2);
  width: 6px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  span {
    width: 100%;
    height: 46px;
    border: 1px solid var(--xy-ink-line);
    border-radius: 3px;
    background: var(--color-bg-secondary);
  }
}

.xy-map-dlg__detail-head {
  margin-bottom: var(--space-3);
  padding-left: var(--space-3);
}

.xy-map-dlg__detail-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.xy-map-dlg__detail-name {
  margin: 0;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-xxl);
  letter-spacing: 3px;
  color: var(--xy-ink-1);
}

.xy-map-dlg__stars {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

.xy-map-dlg__star {
  width: 14px;
  height: 14px;
  color: var(--xy-ink-4);
  opacity: 0.4;

  &.on {
    color: var(--xy-gold);
    opacity: 1;
  }
}

.xy-map-dlg__detail-loc {
  margin: 0;
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  color: var(--xy-ink-3);
}

.xy-map-dlg__detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding-left: var(--space-3);
}

.xy-map-dlg__difficulty {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border: 1px solid currentColor;
  border-radius: 2px;
  font-size: var(--font-size-md);
  white-space: nowrap;

  &--easy {
    color: var(--xy-jade);
  }

  &--normal {
    color: var(--xy-ink-3);
  }

  &--hard {
    color: var(--color-debuff);
  }

  &--hell {
    color: var(--xy-gold);
  }
}

.xy-map-dlg__difficulty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.xy-map-dlg__lock-tag,
.xy-map-dlg__done-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-md);
  white-space: nowrap;

  svg {
    width: 12px;
    height: 12px;
  }
}

.xy-map-dlg__lock-tag {
  color: var(--xy-ink-4);
}

.xy-map-dlg__done-tag {
  color: var(--xy-jade);
}

.xy-map-dlg__section {
  margin-bottom: var(--space-4);
  padding-left: var(--space-3);
}

.xy-map-dlg__section-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 2px;
  color: var(--xy-ink-2);
}

.xy-map-dlg__enemies {
  display: grid;
  gap: var(--space-1);
}

.xy-map-dlg__enemy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);

  &-name {
    font-size: var(--font-size-md);
    color: var(--xy-ink-1);
  }

  &-level {
    font-size: var(--font-size-md);
    color: var(--xy-seal);
  }
}

.xy-map-dlg__desc {
  margin: 0;
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--xy-ink-3);
}

.xy-map-dlg__actions {
  display: flex;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--xy-ink-line);
}

.xy-map-dlg__btn {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border-radius: 2px;
  cursor: pointer;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-md);
  letter-spacing: 3px;
  transition: all var(--transition-fast);

  &--primary {
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

  &--ghost {
    border: 1px solid var(--xy-ink-line);
    background: var(--xy-paper);
    color: var(--xy-ink-2);

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.xy-map-dlg__empty {
  margin: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 4px;
  color: var(--xy-ink-4);

  span {
    font-family: var(--xy-font-body);
    font-size: var(--font-size-md);
    letter-spacing: 2px;
    color: var(--xy-ink-4);
    opacity: 0.8;
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
