<template>
  <div class="buff-text-bar" :class="{ 'is-expanded': expanded, 'is-empty': isEmpty }" ref="barRef"
    @click="handleClick">
    <!-- 空状态 -->
    <span v-if="isEmpty" class="bar-placeholder">无效果</span>

    <!-- 控制标签（不折叠） -->
    <template v-else>
      <BuffTextTag v-for="ctrl in displayControlLabels" :key="ctrl.instanceId" :text="ctrl.name" type="control"
        :turns-left="ctrl.remainingTurns" @hover.stop="onTagHover($event, ctrl)" @leave="onTagLeave" />

      <!-- 合并属性标签 -->
      <BuffTextTag v-for="attr in visibleAttrLabels" :key="attr.attribute" :text="formatAttrLine(attr)"
        :type="attr.totalPercent > 0 ? 'buff' : 'debuff'" @hover.stop="onAttrHover($event, attr)" @leave="onTagLeave" />

      <!-- 折叠指示器 -->
      <Transition name="badge-pop">
        <span v-if="collapsedCount > 0" class="bar-collapse-badge" title="点击展开全部状态">+{{ collapsedCount }}</span>
      </Transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import gsap from 'gsap'
import BuffTextTag from '@/presentation/components/BuffTextTag.vue'
import type { BuffTextItem, MergedAttributeLine } from '@/shared/types/buff-display'

const barRef = ref<HTMLElement | null>(null)
// ponytail: 保存 GSAP tween 引用，新动画开始时 kill 上一轮，防止 clearProps 叠加冲突
let currentTween: gsap.core.Tween | null = null

const props = withDefaults(defineProps<{
  /** 控制标签列表 */
  controlLabels: BuffTextItem[]
  /** 合并属性标签列表（已排序） */
  mergedLabels: MergedAttributeLine[]
  /** 可见的属性标签（受折叠阈值控制，由 useBuffDisplay 计算） */
  visibleAttrLabels: MergedAttributeLine[]
  /** 折叠后隐藏的标签数 */
  collapsedCount: number
  /** 是否展开状态 */
  expanded?: boolean
}>(), {
  expanded: false,
})

const emit = defineEmits<{
  /** 点击展开/收起 */
  toggle: []
  /** 悬停某个 Buff 标签 */
  hoverBuff: [item: BuffTextItem, event: MouseEvent]
  /** 悬停属性标签 */
  hoverAttr: [attr: MergedAttributeLine, event: MouseEvent]
  /** 离开标签 */
  leave: []
}>()

const isEmpty = computed(() =>
  props.controlLabels.length === 0 && props.mergedLabels.length === 0,
)

/** 控制标签：全部显示（不折叠） */
const displayControlLabels = computed(() => props.controlLabels)

/** 属性标签：由 useBuffDisplay 计算 visibleAttrLabels，直接消费 */
// ponytail: 折叠逻辑已集中到 useBuffDisplay 的 collapseThreshold 参数，两边共用同一阈值

// 标签变化时播放入场动画
watch(
  [() => props.controlLabels, () => props.visibleAttrLabels],
  async () => {
    if (props.controlLabels.length === 0 && props.visibleAttrLabels.length === 0) return
    // 清理上一轮动画，防止 clearProps 叠加冲突
    if (currentTween) currentTween.kill()
    await nextTick()
    const tags = barRef.value?.querySelectorAll('.buff-text-tag')
    if (!tags || tags.length === 0) return
    // ponytail: 动画作用于所有标签（含未变化的），在短间隔变化下足够流畅
    // 若需精准只动画新增标签，可加 data-anim-key 标记做增量检测
    currentTween = gsap.fromTo(
      tags,
      { opacity: 0, y: -3 },
      {
        opacity: 1, y: 0,
        duration: 0.2,
        stagger: { each: 0.025, from: 'start' },
        ease: 'power1.out',
        clearProps: 'opacity,y',
      },
    )
  },
  { deep: false },
)

function formatAttrLine(attr: MergedAttributeLine): string {
  const arrow = attr.totalPercent > 0 ? '↑' : '↓'
  const suffix = attr.isFlat ? '' : '%'
  return `${attr.attribute}${arrow}${Math.abs(attr.totalPercent)}${suffix}`
}

function handleClick() {
  if (!isEmpty.value) {
    emit('toggle')
  }
}

function onTagHover(event: MouseEvent, item: BuffTextItem) {
  emit('hoverBuff', item, event)
}

function onAttrHover(event: MouseEvent, attr: MergedAttributeLine) {
  emit('hoverAttr', attr, event)
}

function onTagLeave() {
  emit('leave')
}
</script>

<style scoped>
.buff-text-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  padding: 3px 6px;
  min-height: 24px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast) ease;
  user-select: none;
}

.buff-text-bar:hover {
  background: rgba(255, 255, 255, 0.04);
}

.buff-text-bar.is-expanded {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.buff-text-bar.is-empty {
  cursor: default;
}

.buff-text-bar.is-empty:hover {
  background: transparent;
}

.bar-placeholder {
  font-size: var(--font-size-xs);
  color: var(--color-text-disabled);
  font-style: italic;
}

.bar-collapse-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  font-size: var(--font-size-xs);
  color: var(--color-info);
  font-weight: var(--font-weight-bold);
  border-radius: var(--radius-sm);
  background: rgba(79, 195, 247, 0.1);
  border: 1px solid rgba(79, 195, 247, 0.25);
  transition: background var(--transition-fast) ease;
}

.bar-collapse-badge:hover {
  background: rgba(79, 195, 247, 0.2);
}

/* 折叠指示器弹出/收起动画 */
.badge-pop-enter-active {
  animation: badge-pop-in 0.2s ease-out;
}

.badge-pop-leave-active {
  animation: badge-pop-in 0.15s ease-in reverse;
}

@keyframes badge-pop-in {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
