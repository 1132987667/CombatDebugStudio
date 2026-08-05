<template>
  <span v-if="seg.kind === 'entity'" class="chip" :class="entityFaction(seg) === 'ally' ? 'chip--ally' : 'chip--enemy'">
    {{ entityDisplayText(seg) }}
  </span>
  <b v-else-if="seg.kind === 'damage'" class="num num--damage">{{ seg.text }}</b>
  <b v-else-if="seg.kind === 'heal'" class="num num--heal">{{ seg.text }}</b>
  <span v-else-if="seg.kind === 'hp-before'" class="hp-before">{{ seg.text }}</span>
  <span v-else-if="seg.kind === 'hp-after'" class="hp-after">{{ seg.text }}</span>
  <span v-else-if="seg.kind && ['buff', 'skill', 'passive'].includes(seg.kind)" class="chip"
    :class="[seg.kind === 'skill' && seg.classStr === 'log-ultimate' ? 'chip--ultimate' : 'chip--' + seg.kind, { hoverable: !!seg.hover }]"
    @mouseenter="seg.hover ? $emit('hover', $event, seg.hover) : undefined" @mouseleave="$emit('leave')">{{ seg.text
    }}</span>
  <span v-else :class="seg.classStr">{{ seg.text }}</span>
</template>

<script setup lang="ts">
import {
  entityDisplayText,
  entityFaction,
  type LogSegment,
  type LogSegmentHover,
} from '@/shared/types/battle-log'

defineProps<{
  seg: LogSegment
}>()

defineEmits<{
  hover: [event: MouseEvent, hover: LogSegmentHover]
  leave: []
}>()
</script>
