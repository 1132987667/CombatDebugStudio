<template>
  <Dialog :model-value="modelValue" title="数据快照" width="560px" @update:model-value="$emit('update:modelValue', $event)">
    <div class="snapshot-body">
      <div class="snapshot-section">
        <div class="snapshot-section-title">导出 / 导入</div>
        <div class="snapshot-btn-group">
          <button class="snapshot-btn primary" @click="exportState">📋 导出当前状态 (JSON)</button>
          <button class="snapshot-btn" @click="importState">📂 导入状态数据</button>
        </div>
      </div>

      <div class="snapshot-section">
        <div class="snapshot-section-title">最近导出</div>
        <div class="snapshot-last-export">
          <span class="snapshot-time">{{ debugStore.lastExportTime || '无' }}</span>
        </div>
        <div class="snapshot-btn-group">
          <button class="snapshot-btn small" @click="viewExport">👁 查看导出</button>
          <button class="snapshot-btn small" @click="reloadExport">🔄 重载导出</button>
        </div>
      </div>

      <div class="snapshot-note">
        <span>导出的 JSON 数据已复制到剪贴板，可保存到文件或用于状态对比。</span>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import { container } from '@/infrastructure/di/Container'
import { useDebugStore } from '@/presentation/stores'
import type { BattleService } from '@/application/facade/BattleFacade'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

defineProps<{
  modelValue: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const battleService = container.resolve<BattleService>('BattleService')
const debugStore = useDebugStore()

const currentCharacter = computed(() => battleService.getSelectedCharacter())

const exportState = async () => {
  try {
    if (!currentCharacter.value) {
      alert('请先选择一个角色')
      return
    }

    const char = currentCharacter.value
    const currentTurn = battleService.getCurrentTurn()

    const attributeCodes = [
      'currentHealth', 'maxHealth', 'energy', 'maxEnergy',
      'attack', 'minAttack', 'maxAttack', 'defense', 'speed',
      'critRate', 'critDamage', 'damageReduction',
      'healthBonus', 'attackBonus', 'defenseBonus', 'speedBonus',
    ]

    const attributesDetail: Record<string, any> = {}
    for (const attrCode of attributeCodes) {
      const attrValue = char.getAttributeValue(attrCode)
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
    alert(`角色 "${char.name}" 的状态数据已复制到剪贴板`)
  } catch (error) {
    console.warn('导出状态失败:', error)
    alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

const importState = () => {
  try {
    const state = debugStore.importState()
    if (state) {
      console.log('导入状态成功:', state)
      alert('状态数据导入成功')
    }
  } catch (error) {
    console.warn('导入状态失败:', error)
    alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

const viewExport = () => {
  try {
    const state = debugStore.viewExport()
    if (state) {
      console.log('导出状态:', state)
      alert('查看控制台输出')
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
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: var(--radius-md);
  background: rgba(34, 211, 238, 0.08);
  color: var(--color-energy);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.snapshot-btn:hover {
  background: rgba(34, 211, 238, 0.15);
  border-color: var(--color-energy);
}
.snapshot-btn.primary {
  background: rgba(34, 211, 238, 0.15);
  border-color: var(--color-energy);
}
.snapshot-btn.small {
  padding: var(--space-1) var(--space-3);
}

.snapshot-last-export {
  color: rgba(255, 255, 255, 0.6);
  padding: var(--space-1) var(--space-2);
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-sm);
  font-family: monospace;
}

.snapshot-note {
  color: rgba(255, 255, 255, 0.35);
  padding: var(--space-2) var(--space-2);
  background: rgba(96, 165, 250, 0.06);
  border: 1px solid rgba(96, 165, 250, 0.15);
  border-radius: var(--radius-sm);
  line-height: var(--line-height-md);
}
</style>
