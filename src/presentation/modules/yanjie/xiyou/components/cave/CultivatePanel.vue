<template>
  <div class="xy-cult">
    <!-- 左：装备选择（选中一次，强化/升星/洗练三操作共用，切子页签不丢选中） -->
    <aside class="xy-cult-pick">
      <h5 class="xy-cave-sec">选择装备</h5>
      <!-- 全部装备（已穿戴 + 背包）按部位分组，卡片与装备页背包池同款 -->
      <GearPicker v-model="selectedId" />
    </aside>

    <!-- 右：养成操作区（子页签切换，选中装备共享） -->
    <div class="xy-cult-ops">
      <Tabs v-model="op" :tabs="OPS" class="xy-tabs--seal">
        <template #enhance>
          <EnhancePanel :instance-id="selectedId" />
        </template>
        <template #star>
          <StarPanel :instance-id="selectedId" />
        </template>
        <template #wash>
          <WashPanel :instance-id="selectedId" />
        </template>
      </Tabs>
      <p v-if="!selectedId" class="xy-cult-empty">先在左侧选择一件装备</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 装备养成面板：强化/升星/洗练三操作合并一处——选一次装备，三个操作区共享选中，
 *  免去在三个独立 tab 间反复切换与重选（玩家操作习惯，裁定 2026-10-06）。
 *  Tabs 为全局注册组件（main.ts），无需 import */
import { ref } from 'vue'
import GearPicker from './GearPicker.vue'
import EnhancePanel from './EnhancePanel.vue'
import StarPanel from './StarPanel.vue'
import WashPanel from './WashPanel.vue'

/** 选中装备实例 id（GearPicker 上报），传给三个操作区 */
const selectedId = ref<string | null>(null)

type CultivateOp = 'enhance' | 'star' | 'wash'

/** 养成子页签：强化 → 升星 → 洗练（与养成深度同序） */
const OPS: Array<{ id: CultivateOp; label: string }> = [
  { id: 'enhance', label: '强化' },
  { id: 'star', label: '升星' },
  { id: 'wash', label: '洗练' },
]

const op = ref<CultivateOp>('enhance')
</script>
