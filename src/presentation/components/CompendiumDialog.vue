<!--
 * 文件: CompendiumDialog.vue
 * 创建日期: 2026-03-07
 * 作者: CombatDebugStudio
 * 功能: 图鉴系统弹窗组件
 * 描述: 提供敌人、buff/状态、物品的图鉴查看功能，支持平滑过渡动画
 * 版本: 1.0.0
-->

<template>
  <Teleport to="body">
    <Transition name="compendium-fade">
      <div v-if="modelValue" class="compendium-overlay" @click.self="close">
        <div class="compendium-container">
          <div class="compendium-header">
            <span class="compendium-title">图鉴</span>
            <button class="compendium-close" @click="close">×</button>
          </div>
          
          <div class="compendium-tabs">
            <button 
              v-for="tab in tabs" 
              :key="tab.value"
              class="compendium-tab"
              :class="{ active: activeTab === tab.value }"
              @click="activeTab = tab.value"
            >
              {{ tab.label }}
              <span class="tab-count">{{ getTabCount(tab.value) }}</span>
            </button>
          </div>

          <div class="compendium-body">
            <div class="compendium-list-panel">
              <div v-if="isListLoading" class="compendium-loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>
              <div v-else-if="currentList.length === 0" class="compendium-empty">
                <span>暂无数据</span>
              </div>
              <ul v-else class="compendium-list">
                <li
                  v-for="item in currentList"
                  :key="item.id"
                  class="compendium-list-item"
                  :class="{ selected: selectedId === item.id }"
                  @click="selectItem(item.id)"
                >
                  <span class="item-name">{{ getItemName(item) }}</span>
                  <span v-if="item.level" class="item-level">Lv.{{ item.level }}</span>
                  <span v-if="item.rarity" class="item-rarity" :class="'rarity-' + item.rarity">{{ getRarityText(item.rarity) }}</span>
                </li>
              </ul>
            </div>

            <div class="compendium-detail-panel">
              <div v-if="isDetailLoading" class="compendium-loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>
              <div v-else-if="!selectedData" class="compendium-empty">
                <span>请选择图鉴项查看详情</span>
              </div>
              <template v-else>
                <EnemyDetail v-if="activeTab === 'enemy'" :enemy="selectedData" />
                <BuffDetail v-else-if="activeTab === 'buff'" :buff="selectedData" />
                <ItemDetail v-else-if="activeTab === 'item'" :item="selectedData" />
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCompendium, type CompendiumTabType } from '@/presentation/composables/useCompendium'
import EnemyDetail from './EnemyDetail.vue'
import BuffDetail from './BuffDetail.vue'
import ItemDetail from './ItemDetail.vue'
import { rarityNames } from '@/shared/types/Item'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()

const {
  enemies,
  buffs,
  items,
  isLoading: isCompendiumLoading,
  getEnemyById,
  getBuffById,
  getItemById,
  enemyCount,
  buffCount,
  itemCount
} = useCompendium()

const tabs = [
  { label: '敌人', value: 'enemy' as CompendiumTabType },
  { label: 'Buff/状态', value: 'buff' as CompendiumTabType },
  { label: '物品', value: 'item' as CompendiumTabType }
]

const activeTab = ref<CompendiumTabType>('enemy')
const selectedId = ref<string>('')

const isListLoading = ref(false)
const isDetailLoading = ref(false)

const currentList = computed(() => {
  switch (activeTab.value) {
    case 'enemy':
      return enemies.value
    case 'buff':
      return buffs.value
    case 'item':
      return items.value
    default:
      return []
  }
})

const selectedData = computed(() => {
  if (!selectedId.value) return null
  switch (activeTab.value) {
    case 'enemy':
      return getEnemyById(selectedId.value)
    case 'buff':
      return getBuffById(selectedId.value)
    case 'item':
      return getItemById(selectedId.value)
    default:
      return null
  }
})

const getTabCount = (tab: string): number => {
  switch (tab) {
    case 'enemy':
      return enemyCount.value
    case 'buff':
      return buffCount.value
    case 'item':
      return itemCount.value
    default:
      return 0
  }
}

const getItemName = (item: any): string => {
  return item.name || '未知'
}

const getRarityText = (rarity: number): string => {
  return rarityNames[rarity] || '普通'
}

const selectItem = (id: string) => {
  isDetailLoading.value = true
  selectedId.value = id
  setTimeout(() => {
    isDetailLoading.value = false
  }, 100)
}

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

watch(() => props.modelValue, (val) => {
  if (val) {
    document.body.style.overflow = 'hidden'
    if (currentList.value.length > 0 && !selectedId.value) {
      selectItem(currentList.value[0].id)
    }
  } else {
    document.body.style.overflow = ''
  }
})

watch(activeTab, () => {
  selectedId.value = ''
  if (currentList.value.length > 0) {
    selectItem(currentList.value[0].id)
  }
})
</script>

<style scoped>
.compendium-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.compendium-container {
  width: 800px;
  max-width: 95vw;
  height: 500px;
  max-height: 85vh;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  box-shadow: 0 0 10px rgba(79, 195, 247, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.compendium-header {
  padding: var(--space-2) var(--space-4);
  background: linear-gradient(135deg, var(--color-bg-tertiary) 0%, var(--color-bg-primary) 100%);
  border-bottom: 1px solid var(--color-border-default);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.compendium-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-info);
  letter-spacing: 1px;
}

.compendium-close {
  background: none;
  border: 1px solid var(--color-info);
  font-size: var(--font-size-md);
  cursor: pointer;
  color: var(--color-info);
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
}

.compendium-close:hover {
  background: var(--color-info);
  color: var(--color-bg-primary);
}

.compendium-tabs {
  display: flex;
  padding: 0 var(--space-2);
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border-default);
  gap: var(--space-1);
}

.compendium-tab {
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: var(--transition-fast);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.compendium-tab:hover {
  color: var(--color-text-secondary);
  background: rgba(79, 195, 247, 0.1);
}

.compendium-tab.active {
  color: var(--color-info);
  border-bottom-color: var(--color-info);
  background: rgba(79, 195, 247, 0.1);
}

.tab-count {
  font-size: var(--font-size-xs);
  padding: 1px 5px;
  background: var(--color-border-default);
  border-radius: var(--radius-lg);
  color: var(--color-text-tertiary);
}

.compendium-tab.active .tab-count {
  background: rgba(79, 195, 247, 0.2);
  color: var(--color-info);
}

.compendium-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.compendium-list-panel {
  width: 200px;
  min-width: 160px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-default);
  overflow-y: auto;
}

.compendium-list {
  padding: var(--space-1);
}

.compendium-list-item {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition-fast);
  gap: var(--space-1);
  margin-bottom: var(--space-1);
  border: 1px solid transparent;
}

.compendium-list-item:hover {
  background: var(--color-border-strong);
}

.compendium-list-item.selected {
  background: rgba(79, 195, 247, 0.15);
  border-color: var(--color-info);
}

.item-name {
  flex: 1;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-level {
  font-size: var(--font-size-xs);
  color: var(--color-brand-red);
  padding: 1px 4px;
  background: rgba(233, 69, 96, 0.2);
  border-radius: var(--radius-sm);
}

.item-rarity {
  font-size: var(--font-size-xs);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
}

.item-rarity.rarity-1 {
  color: var(--color-text-tertiary);
  background: rgba(136, 136, 136, 0.15);
}

.item-rarity.rarity-2 {
  color: var(--color-info);
  background: rgba(96, 165, 250, 0.15);
}

.item-rarity.rarity-3 {
  color: var(--color-debuff);
  background: rgba(167, 139, 250, 0.15);
}

.item-rarity.rarity-4 {
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.15);
}

.compendium-detail-panel {
  flex: 1;
  padding: var(--space-3);
  overflow-y: auto;
  background: var(--color-bg-secondary);
}

.compendium-loading,
.compendium-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-disabled);
  gap: var(--space-2);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border-default);
  border-top-color: var(--color-info);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.compendium-fade-enter-active,
.compendium-fade-leave-active {
  transition: opacity var(--transition-fast) ease;
}

.compendium-fade-enter-active .compendium-container,
.compendium-fade-leave-active .compendium-container {
  transition: transform var(--transition-fast) ease, opacity var(--transition-fast) ease;
}

.compendium-fade-enter-from,
.compendium-fade-leave-to {
  opacity: 0;
}

.compendium-fade-enter-from .compendium-container,
.compendium-fade-leave-to .compendium-container {
  transform: scale(0.95);
  opacity: 0;
}

</style>
