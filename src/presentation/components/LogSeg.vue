<template>
  <span v-if="seg.kind === 'entity'" class="chip" :class="seg.faction === 'ally' ? 'chip--ally' : 'chip--enemy'">
    {{ seg.text }}
  </span>
  <b v-else-if="seg.kind === 'damage'" class="num num--damage">{{ seg.text }}</b>
  <b v-else-if="seg.kind === 'heal'" class="num num--heal">{{ seg.text }}</b>
  <span v-else-if="seg.kind === 'hp-before'" class="hp-before">{{ seg.text }}</span>
  <span v-else-if="seg.kind === 'hp-after'" class="hp-after">{{ seg.text }}</span>
  <span v-else-if="seg.kind && ['buff', 'skill', 'passive'].includes(seg.kind)" class="chip"
    :class="['chip--' + seg.kind, { hoverable: !!seg.hover }]"
    @mouseenter="seg.hover ? $emit('hover', $event, seg.hover) : undefined" @mouseleave="$emit('leave')">{{ seg.text
    }}</span>
  <span v-else :class="seg.classStr">{{ seg.text }}</span>
</template>

<script setup lang="ts">
import type { LogSegment, LogSegmentHover } from '@/shared/types/battle-log'

defineProps<{
  seg: LogSegment
}>()

defineEmits<{
  hover: [event: MouseEvent, hover: LogSegmentHover]
  leave: []
}>()
</script>
