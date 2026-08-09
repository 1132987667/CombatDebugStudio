<!--
 * 文件: RecordManagerDialog.vue
 * 功能: 昊天镜战斗记录管理弹窗
 * 描述: 管理 IndexedDB 中已保存的战斗记录（查看 / 刷新 / 删除）。
 *       删除 = 底部勾选框「删除不弹确认」：勾选后点删除按钮直接删除；未勾选时点删除弹确认框。
 *       列表数据源为 haotianStore.recordings（UnifiedArchiveService.listRecordings）。
 *       命名约定：唤灵台保存时随机词牌名 + 序号（如「满江红001」）。
-->
<template>
  <Dialog :model-value="modelValue" title="战斗记录管理" width="620px" @update:model-value="onModelValue">
    <div class="rm-toolbar">
      <Button @click="refresh">刷新</Button>
      <span class="rm-total">共 {{ store.recordings.length }} 条记录</span>
    </div>

    <div v-if="store.recordings.length" class="rm-list">
      <div v-for="(r, i) in store.recordings" :key="r.saveKey" class="rm-row">
        <div class="rm-main">
          <div class="rm-name" :title="r.name">{{ i + 1 }}. {{ r.name }}</div>
          <div class="rm-meta">{{ r.battleId }} · {{ fmtTime(r.startTime) }} · {{ r.eventCount }} 事件</div>
        </div>
        <div class="rm-actions">
          <Button title="导出该记录为统一存档 JSON（可在昊天镜导入回放 / 调试）" @click="onExport(r)">导出</Button>
          <Button variant="danger" @click="onDelete(r)">删除</Button>
        </div>
      </div>
    </div>
    <div v-else class="rm-empty">暂无保存的战斗记录（唤灵台战斗结束后保存）</div>

    <label class="rm-foot-check" :title="'勾选后点删除直接删除，不再弹确认框'">
      <input type="checkbox" v-model="noConfirm" />
      <span>删除不弹确认，直接删除</span>
    </label>

    <ConfirmDialog v-model="confirmDelete" title="删除战斗记录"
      :message="`确定删除「${pending?.name ?? ''}」吗？该操作不可恢复。`" confirm-text="删除" danger @confirm="doDelete" />
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { UnifiedArchiveService, type RecordingMeta } from '@/application/service/UnifiedArchiveService'
import { useHaotianStore } from '../stores/haotianStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const store = useHaotianStore()
const notify = useNotificationStore()
/** 底部勾选框：勾选后点删除直接删除，不弹确认框 */
const noConfirm = ref(false)
const confirmDelete = ref(false)
const pending = ref<RecordingMeta | null>(null)

const archiveService = new UnifiedArchiveService()

const resolveBattleSystem = (): BattleSystem => container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())

const fmtTime = (t: number): string => (t ? new Date(t).toLocaleString() : '—')

async function refresh(): Promise<void> {
  await store.refreshRecordings(resolveBattleSystem())
}

/** 导出单条记录为统一存档 JSON（与昊天镜"导出存档"同格式，可在昊天镜导入回放 / 调试） */
async function onExport(r: RecordingMeta): Promise<void> {
  const arch = await archiveService.loadRecording(resolveBattleSystem(), r.saveKey)
  if (!arch) {
    notify.toast('导出失败：记录读取失败', 'error', 2600)
    return
  }
  const text = JSON.stringify(arch, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `battle_debug_${arch.battleId}_v${arch.version}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 500)
  notify.toast(`已导出「${r.name}」— 一份文件，回放与调试两种能力`, 'info', 2600)
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) void refresh()
  },
)

function onModelValue(v: boolean): void {
  emit('update:modelValue', v)
}

function onDelete(r: RecordingMeta): void {
  if (noConfirm.value) {
    void store.deleteRecording(resolveBattleSystem(), r.saveKey)
  } else {
    pending.value = r
    confirmDelete.value = true
  }
}

async function doDelete(): Promise<void> {
  if (!pending.value) return
  const key = pending.value.saveKey
  pending.value = null
  await store.deleteRecording(resolveBattleSystem(), key)
}
</script>

<style scoped lang="scss">
.rm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.rm-total {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}
.rm-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 50vh;
  overflow-y: auto;
}
.rm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-md);
}
.rm-foot-check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border-hairline);
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  cursor: pointer;
  user-select: none;
}
.rm-foot-check input[type="checkbox"] {
  accent-color: var(--color-danger);
  margin: 0;
}
.rm-main {
  min-width: 0;
}
.rm-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.rm-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-meta {
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}
.rm-empty {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-tertiary);
}
</style>
