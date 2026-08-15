<template>
  <Transition name="xy-map-fade">
    <div v-if="modelValue" ref="overlayRef" class="xy-map-dlg" role="dialog" aria-modal="true"
      aria-label="降妖路引 · 关卡列表" tabindex="-1" @click.self="close">
      <div class="xy-map-dlg__panel">
        <header class="xy-map-dlg__head">
          <div class="xy-map-dlg__head-text">
            <h2 class="xy-map-dlg__name">降妖路引</h2>
            <p class="xy-map-dlg__sub">五域二十五关 · 择路而进</p>
          </div>
          <div class="xy-map-dlg__head-right">
            <span class="xy-map-dlg__progress">
              已踏 <em>{{ unlockedCount }}</em> / {{ scenes.length }} 关
            </span>
            <button type="button" class="xy-map-dlg__close" aria-label="关闭降妖路引" @click="close">
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
          <div class="xy-map-dlg__list" :aria-label="`${activeRegion.name} · ${activeRegion.sub} 关卡列表`">
            <button
              v-for="s in regionScenes"
              :key="s.id"
              type="button"
              class="xy-map-dlg__stage xy-ink-hover"
              :class="[`xy-map-dlg__stage--${nodeTone(s.difficulty)}`, { selected: s.id === selectedId, locked: !s.unlocked }]"
              role="button"
              :tabindex="s.unlocked ? 0 : -1"
              :aria-label="`${s.name}${s.unlocked ? '' : '（未解锁）'}`"
              @click="selectNode(s)"
              @keydown.enter="selectNode(s)"
            >
              <span class="xy-map-dlg__stage-head">
                <span class="xy-map-dlg__stage-name">{{ s.name }}</span>
                <span v-if="!s.unlocked" class="xy-map-dlg__stage-lock" aria-hidden="true">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <rect x="5" y="10" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                </span>
                <span v-else class="xy-map-dlg__stage-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>
              </span>
              <span class="xy-map-dlg__stage-range">Lv.{{ s.levelRange?.[0] }}-{{ s.levelRange?.[1] }}</span>
              <span class="xy-map-dlg__stage-meta">
                <span class="xy-map-dlg__difficulty" :class="`xy-map-dlg__difficulty--${nodeTone(s.difficulty)}`">
                  <span class="xy-map-dlg__difficulty-dot" aria-hidden="true"></span>
                  {{ difficultyText(s.difficulty) }}
                </span>
                <span class="xy-map-dlg__stars" :aria-label="`关卡星级 ${s.stars}/${s.maxStars}`">
                  <svg v-for="i in s.maxStars" :key="i" viewBox="0 0 24 24" class="xy-map-dlg__star"
                    :class="{ on: i <= s.stars }" aria-hidden="true">
                    <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
                  </svg>
                </span>
              </span>
            </button>
            <p v-if="regionScenes.length === 0" class="xy-map-dlg__list-empty">此域暂无关卡</p>
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
                <p class="xy-map-dlg__detail-loc">{{ regionName(selected.regionId) }} · Lv.{{ selected.levelRange?.[0] }}-{{ selected.levelRange?.[1] }}</p>
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
import type { XiyouRegion, XiyouScene } from '../types'

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
  return { easy: '简单', normal: '普通', hard: '困难' }[d]
}

function nodeTone(d: XiyouScene['difficulty']): string {
  return { easy: 'easy', normal: 'normal', hard: 'hard' }[d]
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
  width: min(1080px, 96vw);
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
  font-size: var(--font-size-md);
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

/* ── 关卡按钮列表（替代原 SVG 手绘地图） ── */
.xy-map-dlg__list {
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-4);
  border-right: 1px solid var(--xy-ink-line);
  background: linear-gradient(180deg, var(--color-bg-tertiary), var(--xy-paper));
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-3);
  align-content: start;
}

.xy-map-dlg__stage {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--xy-ink-line);
  border-radius: 3px;
  background: var(--xy-paper);
  text-align: left;
  font-family: var(--xy-font-body);
  cursor: pointer;
  color: var(--xy-ink-1);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);

  &:hover:not(.locked) {
    border-color: currentColor;
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--color-energy);
    outline-offset: 2px;
  }

  &.locked {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.selected {
    border-color: var(--xy-seal);
    border-width: 2px;
    background: var(--xy-seal-soft);
  }
}

.xy-map-dlg__stage--easy {
  color: var(--xy-jade);
}

.xy-map-dlg__stage--normal {
  color: var(--xy-ink-3);
}

.xy-map-dlg__stage--hard {
  color: var(--color-debuff);
}

.xy-map-dlg__stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.xy-map-dlg__stage-name {
  
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-map-dlg__stage-lock,
.xy-map-dlg__stage-check {
  display: inline-flex;
  flex-shrink: 0;

  svg {
    width: 14px;
    height: 14px;
  }
}

.xy-map-dlg__stage-lock {
  color: var(--xy-ink-4);
}

.xy-map-dlg__stage-check {
  color: var(--xy-jade);
}

.xy-map-dlg__stage-range {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-map-dlg__stage-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.xy-map-dlg__list-empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: var(--space-5);
  text-align: center;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
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
