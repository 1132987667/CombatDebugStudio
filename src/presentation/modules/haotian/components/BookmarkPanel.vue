<template>
  <Dialog :model-value="open" title="书签" width="min(380px, 92vw)"
    placement="right" content-class="dialog-content--flush" @update:model-value="onModelValue">
    <div class="ht-bm-body">
      <div v-if="store.bookmarkedEvents.length" class="ht-bm-list">
        <div v-for="ev in store.bookmarkedEvents" :key="ev.id" class="ht-bm-row"
          :class="{ on: ev.id === store.selectedId }">
          <span class="ht-bm-time">{{ formatTime(ev.timestamp) }}</span>
          <button type="button" class="ht-bm-goto" :title="`${ev.summary}（点击定位）`"
            @click="store.focusEvent(ev.id, { seek: true, fx: true })">
            {{ ev.summary }}
          </button>
          <button type="button" class="ht-bm-del" title="移除书签" aria-label="移除书签" @click="store.removeBookmark(ev.id)">×</button>
        </div>
      </div>
      <div v-else class="ht-bm-empty">
        <div>暂无书签</div>
        <div class="ht-bm-empty-sub">在事件流 / 行动卡片上点击书签图标（或右键）添加</div>
      </div>
    </div>
    <template #footer>
      <Button variant="ghost" :disabled="!store.bookmarkCount" title="移除全部书签" @click="store.clearBookmarks()">清空全部</Button>
      <Button variant="energy" @click="close">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import { useHaotianStore } from '../stores/haotianStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useHaotianStore()

const onModelValue = (val: boolean): void => emit('update:open', val)
const close = (): void => emit('update:open', false)
</script>
