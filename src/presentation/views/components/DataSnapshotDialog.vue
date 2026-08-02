<template>
  <Dialog :model-value="modelValue" title="数据快照" width="560px" @update:model-value="$emit('update:modelValue', $event)">
    <div class="snapshot-body">
      <div class="snapshot-section">
        <div class="snapshot-section-title">导出 / 导入</div>
        <div class="snapshot-btn-group">
          <button class="snapshot-btn primary" @click="exportState">导出当前状态 (JSON)</button>
          <button class="snapshot-btn" @click="importState">导入状态数据</button>
        </div>
      </div>

      <div class="snapshot-section">
        <div class="snapshot-section-title">最近导出</div>
        <div class="snapshot-last-export">
          <span class="snapshot-time">{{ debugStore.lastExportTime || '无' }}</span>
        </div>
        <div class="snapshot-btn-group">
          <button class="snapshot-btn small" @click="viewExport">查看导出</button>
          <button class="snapshot-btn small" @click="reloadExport">重载导出</button>
        </div>
      </div>

      <div class="snapshot-note">
        <span>导出的 JSON 数据已复制到剪贴板，可保存到文件或用于状态对比。</span>
      </div>
    </div>
  </Dialog>

  <!-- 通知（替换原生 alert） -->
  <Notification ref="notification" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import Notification from '@/presentation/components/Notification.vue'
import { container } from '@/infrastructure/di/Container'
import { useBattleStore, useDebugStore } from '@/presentation/stores'
import type { BattleService } from '@/application/facade/BattleFacade'
import { ATTRIBUTE_CODE, AttributeMetaMap } from '@/domain/attribute/types'

defineProps<{
  modelValue: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const battleService = container.resolve<BattleService>('BattleService')
const debugStore = useDebugStore()

const battleStore = useBattleStore()

// 通知实例（替换原生 alert，走统一通知组件）
const notification = ref<InstanceType<typeof Notification> | null>(null)

const currentCharacter = computed(() => {
  const id = battleStore.selectedCharacterId
  if (!id) return null
  return [...battleStore.allyTeam, ...battleStore.enemyTeam].find(p => p.id === id) || null
})

const exportState = async () => {
  try {
    if (!currentCharacter.value) {
      notification.value?.addNotification("提示", "请先选择一个角色", "warning")
      return
    }

    const char = currentCharacter.value
    const currentTurn = battleService.getCurrentTurn()

    const attributeCodes = Object.entries(AttributeMetaMap)
      .filter(([, meta]) => !meta.isRuntimeState)
      .map(([code]) => code)

    const attributesDetail: Record<string, any> = {}
    for (const attrCode of attributeCodes) {
      const attrValue = char.getAttrVal(attrCode)
      if (attrValue) {
        attributesDetail[attrCode] = {
          finalValue: attrValue.value,
          baseValue: attrValue.base,
          isPercentage: attrValue.isPercentage,
          modifiers: attrValue.modifiers.map(mod => ({
            source: mod.sourceKey,
            sourceType: mod.sourceType,
            value: mod.value,
            type: mod.type,
            description: mod.description,
          })),
          breakdown: attrValue.breakdown ? {
            base: attrValue.breakdown.base,
            additive: attrValue.breakdown.additive,
            percentMultiplier: attrValue.breakdown.percentMultiplier,
            independentMultiplier: attrValue.breakdown.independentMultiplier,
            finalMultiplier: attrValue.breakdown.finalMultiplier,
          } : null,
        }
      }
    }

    const exportData = {
      exportTime: new Date().toISOString(),
      currentTurn,
      character: {
        id: char.id,
        name: char.name,
        level: char.level,
        type: char.type,
        team: char.team,
        enabled: char.enabled,
        buffs: char.getBuffInstanceIds(),
        skills: char.skills,
        statusEffects: char.statusEffects,
        attributes: attributesDetail,
      },
    }

    await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
    debugStore.lastExportTime = new Date().toLocaleString()
    notification.value?.addNotification("导出成功", `角色 "${char.name}" 的状态数据已复制到剪贴板`, "success")
  } catch (error) {
    console.warn('导出状态失败:', error)
    notification.value?.addNotification("导出失败", error instanceof Error ? error.message : '未知错误', "error")
  }
}

const importState = () => {
  try {
    const state = debugStore.importState()
    if (state) {
      console.log('导入状态成功:', state)
      notification.value?.addNotification("导入成功", "状态数据导入成功", "success")
    }
  } catch (error) {
    console.warn('导入状态失败:', error)
    notification.value?.addNotification("导入失败", error instanceof Error ? error.message : '未知错误', "error")
  }
}

const viewExport = () => {
  try {
    const state = debugStore.viewExport()
    if (state) {
      console.log('导出状态:', state)
      notification.value?.addNotification("提示", "查看控制台输出", "info")
    }
  } catch (error) {
    console.warn('查看导出状态失败:', error)
  }
}

const reloadExport = () => {
  try {
    const state = debugStore.reloadExport()
    if (state) {
      console.log('重载状态成功:', state)
      alert('状态数据重载成功')
    }
  } catch (error) {
    console.warn('重载状态失败:', error)
  }
}
</script>

<style scoped>
.snapshot-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.snapshot-section-title {
  font-weight: var(--font-weight-semibold);
  color: var(--color-info);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.snapshot-btn-group {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.snapshot-btn {
  padding: var(--space-2) var(--space-4);
  border: 2px solid var(--border-debug-color);
  border-radius: var(--radius-md);
  background: rgba(var(--rgb-energy), var(--alpha-tint));
  color: var(--color-energy);
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
  outline: 1px solid rgba(var(--rgb-black), 0.8);
  outline-offset: -3px;
}

.snapshot-btn:hover {
  background: var(--border-debug-color-dark);
  outline-color: rgba(var(--rgb-black), 0.5);
  border-color: var(--color-energy);
}

.snapshot-btn.primary {
  background: var(--border-debug-color-dark);
  border-color: var(--color-energy);
}

.snapshot-btn.small {
  padding: var(--space-1) var(--space-3);
}

.snapshot-last-export {
  color: rgba(var(--rgb-white), 0.6);
  padding: var(--space-1) var(--space-2);
  background: rgba(var(--rgb-black), var(--alpha-wash-strong));
  border-radius: var(--radius-sm);
  font-family: monospace;
}

.snapshot-note {
  color: rgba(var(--rgb-white), 0.35);
  padding: var(--space-2) var(--space-2);
  background: var(--border-common-color-dark);
  border: 1px solid var(--border-common-color-dark);
  border-radius: var(--radius-sm);
  line-height: var(--line-height-md);
}
</style>
