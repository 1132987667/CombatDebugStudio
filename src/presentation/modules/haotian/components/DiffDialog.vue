<template>
  <Dialog :model-value="open" :title="'分支对比'"
    width="min(760px, 94vw)" content-class="dialog-content--flush" @update:model-value="onModelValue">
    <div class="ht-diff-toolbar">
      <Button @click="store.loadSampleBranch()">生成示例分支（阈值 → 0.30）</Button>
      <TacticalSelect v-model="branchKey" size="md" searchable placeholder="从战斗记录选分支…"
        :options="branchOptions" />
      <Button @click="branchInput?.click()">载入分支 JSON</Button>
      <Button @click="store.clearBranch()" :disabled="!store.branch">清除分支</Button>
      <span class="ht-diff-meta">
        <span class="ht-st-ok">相同</span> {{ store.diffStats.total - store.diffStats.changed }} ·
        <span class="ht-st-warn">差异</span> {{ store.diffStats.changed }}
      </span>
    </div>
    <div class="ht-diff-body">
      <div v-if="store.diffRows.length" class="ht-diff-cols">
        <div class="ht-diff-col">
          <div class="ht-diff-col-hd">修改前</div>
          <template v-for="row in store.diffRows" :key="'b' + row.eventId">
            <div v-if="row.side !== 'branch-only'" class="ht-diff-row" :class="{ changed: row.changed }">
              <span class="ht-diff-sum">{{ row.summary }}</span>
              <div v-for="(f, i) in row.fields" :key="'bf' + i" class="ht-diff-field">
                <span class="ht-diff-k">{{ f.key }}</span>
                <span class="ht-diff-v">{{ f.before }}</span>
              </div>
              <div v-if="row.side === 'base-only'" class="ht-diff-side">仅修改前</div>
            </div>
          </template>
        </div>
        <div class="ht-diff-col">
          <div class="ht-diff-col-hd">修改后</div>
          <template v-for="row in store.diffRows" :key="'a' + row.eventId">
            <div v-if="row.side !== 'base-only'" class="ht-diff-row" :class="{ changed: row.changed }">
              <span class="ht-diff-sum">{{ row.side === 'branch-only' ? row.summary : baseSummary(row) }}</span>
              <div v-for="(f, i) in row.fields" :key="'af' + i" class="ht-diff-field">
                <span class="ht-diff-k">{{ f.key }}</span>
                <span class="ht-diff-v">{{ f.after }}</span>
              </div>
              <div v-if="row.side === 'branch-only'" class="ht-diff-side">仅修改后</div>
            </div>
          </template>
        </div>
      </div>
      <div v-else class="ht-empty">
        尚未载入分支。点击「生成示例分支」改写随机判定阈值，或将另一份存档 JSON 载入对比。<br />
        示例：修改前 / 修改后两栏逐链路对齐 diff，差异集中在一处判定步骤。
      </div>
    </div>
    <template #footer>
      <Button variant="energy" @click="close">关闭</Button>
    </template>
    <input ref="branchInput" type="file" accept="application/json" hidden @change="onBranchFile" />
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { DiffRow } from '@/domain/battle/replay/unified/unified-diff'
import { useHaotianStore } from '../stores/haotianStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useHaotianStore()
const branchInput = ref<HTMLInputElement | null>(null)
const branchKey = ref('')

const branchOptions = computed<TSelectOption[]>(() => [
  { value: '', label: '从战斗记录选分支…' },
  ...store.recordings.map((r) => ({ value: r.saveKey, label: `${r.name} · ${r.eventCount} 事件` })),
])

const resolveBattleSystem = (): BattleSystem => container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())

watch(
  () => props.open,
  async (val) => {
    if (val) await store.refreshRecordings(resolveBattleSystem())
    else branchKey.value = ''
  },
)

watch(branchKey, async (key) => {
  if (!key) return
  await store.loadBranchRecording(resolveBattleSystem(), key)
})

const onModelValue = (val: boolean): void => emit('update:open', val)

const close = (): void => emit('update:open', false)

/** 修改后列复用 base 侧摘要（对齐行） */
function baseSummary(row: DiffRow): string {
  return row.summary
}

async function onBranchFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await store.loadBranchFromFile(file)
  input.value = ''
}
</script>
