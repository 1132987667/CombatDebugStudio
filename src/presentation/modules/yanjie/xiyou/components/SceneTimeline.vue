<template>
  <div class="xy-timeline">
    <header class="xy-timeline-head">
      <div class="xy-timeline-head-text">
        <h3 class="xy-timeline-title">降妖路引</h3>
        <p class="xy-timeline-sub">五域二十五关 · 择路而进</p>
      </div>
      <span class="xy-timeline-progress">
        已踏 <em>{{ unlockedCount }}</em>/{{ scenes.length }}
      </span>
    </header>

    <div class="xy-timeline-body">
      <template v-for="region in activeRegions" :key="region.id">
        <div class="xy-timeline-region-title">
          {{ region.name }} · Lv.{{ regionLevelText(region) }}
        </div>

        <div class="xy-timeline-path" :aria-label="`${region.name} 关卡路径`">
          <button
            v-for="(s, si) in regionScenes(region.id)"
            :key="s.id"
            type="button"
            class="xy-timeline-node"
            :class="{
              boss: isBoss(si),
              current: isCurrent(s),
              locked: !s.unlocked,
            }"
            :aria-pressed="isCurrent(s)"
            :aria-label="`${s.name}${isBoss(si) ? '（BOSS）' : ''}${s.unlocked ? '' : '（未解锁）'}`"
            @click="select(s)"
          >
            <span class="xy-timeline-node__marker" aria-hidden="true"></span>
            <span class="xy-timeline-node__content">
              <span class="xy-timeline-node__name">{{ s.name }}</span>
              <span class="xy-timeline-node__meta">
                {{ isBoss(si) ? 'BOSS' : `Lv.${s.levelRange?.[0] ?? ''}` }}
              </span>
            </span>
          </button>
        </div>
      </template>

      <p v-if="activeRegions.length === 0" class="xy-timeline-empty">此域暂无关卡</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { XiyouRegion, XiyouScene } from '../data/mock'

const props = defineProps<{
  regions: XiyouRegion[]
  scenes: XiyouScene[]
  current: XiyouScene | null
}>()

const emit = defineEmits<{ select: [scene: XiyouScene] }>()

/** 仅展示存在关卡的区域（region_final 暂无场景则不出现在路引） */
const activeRegions = computed(() => props.regions.filter(r => props.scenes.some(s => s.regionId === r.id)))

const unlockedCount = computed(() => props.scenes.filter(s => s.unlocked).length)

function regionScenes(regionId: string): XiyouScene[] {
  return props.scenes.filter(s => s.regionId === regionId)
}

function regionLevelText(r: XiyouRegion): string {
  return r.levelRange ? `${r.levelRange[0]}-${r.levelRange[1]}` : ''
}

function isBoss(index: number): boolean {
  return index === 4
}

function isCurrent(s: XiyouScene): boolean {
  return props.current?.id === s.id
}

function select(s: XiyouScene): void {
  if (!s.unlocked) {
    useNotificationStore().toast(`「${s.name}」尚未解锁，先通前置关隘`, 'warning')
    return
  }
  emit('select', s)
}
</script>

<style scoped lang="scss">
.xy-timeline {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.xy-timeline-head {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
}

.xy-timeline-head-text {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.xy-timeline-title {
  margin: 0;
  
  font-size: var(--font-size-lg);
  letter-spacing: 3px;
  color: var(--xy-ink-1);
  white-space: nowrap;
}

.xy-timeline-sub {
  margin: 0;
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  color: var(--xy-ink-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.xy-timeline-progress {
  flex-shrink: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
  white-space: nowrap;

  em {
    font-style: normal;
    color: var(--xy-seal);
    font-weight: var(--font-weight-semibold);
  }
}

.xy-timeline-body {
  padding: 0 var(--space-3) var(--space-2);
}

.xy-timeline-region-title {
  position: relative;
  margin: var(--space-3) 0 var(--space-2);
  padding-left: var(--space-2);
  
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  color: var(--xy-ink-2);

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 14px;
    background: var(--xy-seal);
  }
}

.xy-timeline-path {
  position: relative;
  padding-left: 20px;

  &::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(
      to bottom,
      var(--xy-ink-line),
      var(--xy-seal),
      var(--xy-ink-line)
    );
  }
}

.xy-timeline-node {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) 0;
  border: none;
  background: transparent;
  color: var(--xy-ink-1);
  font-family: var(--xy-font-body);
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
  transition: opacity var(--transition-fast);

  &:hover:not(.locked) .xy-timeline-node__content {
    background: var(--color-bg-hover);
  }

  &.locked {
    opacity: 0.45;
  }
}

.xy-timeline-node__marker {
  position: absolute;
  left: -17px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--xy-ink-4);
  background: var(--xy-paper);
  z-index: 1;
  flex-shrink: 0;
}

.xy-timeline-node.boss .xy-timeline-node__marker {
  width: 14px;
  height: 14px;
  left: -19px;
  border-radius: 2px;
  transform: rotate(45deg);
  border-color: var(--xy-seal);
}

.xy-timeline-node.current .xy-timeline-node__marker {
  background: var(--xy-seal);
  border-color: var(--xy-seal);
  box-shadow: 0 0 0 3px var(--xy-seal-soft);
}

.xy-timeline-node__content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-1) var(--space-2);
  border: 1px solid transparent;
  border-radius: 2px;
  transition: background var(--transition-fast);
}

.xy-timeline-node.current .xy-timeline-node__content {
  background: var(--xy-seal-soft);
  border-color: rgba(var(--rgb-brand-red), 0.25);
}

.xy-timeline-node__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xy-timeline-node.current .xy-timeline-node__name {
  color: var(--xy-seal);
  font-weight: var(--font-weight-semibold);
}

.xy-timeline-node__meta {
  flex-shrink: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-timeline-node.boss .xy-timeline-node__meta {
  color: var(--xy-gold);
}

.xy-timeline-empty {
  margin: var(--space-4) 0;
  text-align: center;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}
</style>
