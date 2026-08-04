<template>
  <div class="fs-layout">
    <!-- 左侧导航 -->
    <aside class="fs-sidebar">
      <nav class="fs-side-groups" aria-label="封神榜数据导航">
        <div v-for="group in DOMAIN_GROUPS" :key="group.label" class="fs-side-group">
          <div class="fs-side-title">{{ group.label }}</div>
          <button v-for="d in group.items" :key="d.table" type="button" class="fs-side-item"
            :class="{ active: store.activeView === 'domain' && store.currentTable === d.table }"
            @click="selectDomain(d.table)">
            {{ d.label }}
          </button>
        </div>
        <div class="fs-side-group">
          <div class="fs-side-title">系统功能</div>
          <button v-for="s in SYSTEM_VIEWS" :key="s.view" type="button" class="fs-side-item"
            :class="{ active: store.activeView === s.view }" @click="store.setView(s.view)">
            {{ s.label }}
          </button>
        </div>
      </nav>
      <div class="fs-side-footer">
        <div class="fs-storage-stat">
          <span class="fs-dot" aria-hidden="true"></span>
          IndexedDB {{ storageOk ? '已连接' : '降级 configs' }}
        </div>
        <div class="fs-storage-stat">数据版本 v{{ store.dataVersion }}</div>
      </div>
    </aside>

    <!-- 主内容 -->
    <main class="fs-content">
      <ListView v-if="store.activeView === 'domain' || store.activeView === 'rules'" />
      <FormulasView v-else-if="store.activeView === 'formulas'" />
      <HealthView v-else-if="store.activeView === 'health'" />
      <LogsView v-else-if="store.activeView === 'logs'" />
      <PackagesView v-else-if="store.activeView === 'packages'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useFengshenStore, type FengshenView } from '@/presentation/modules/fengshen/stores/fengshenStore'
import type { FengshenTableName } from '@/domain/fengshen/types'
import ListView from '@/presentation/modules/fengshen/views/ListView.vue'
import FormulasView from '@/presentation/modules/fengshen/views/FormulasView.vue'
import HealthView from '@/presentation/modules/fengshen/views/HealthView.vue'
import LogsView from '@/presentation/modules/fengshen/views/LogsView.vue'
import PackagesView from '@/presentation/modules/fengshen/views/PackagesView.vue'

/** 数据域按子领域分组（侧栏导航层次） */
const DOMAIN_GROUPS: Array<{ label: string; items: Array<{ table: FengshenTableName; label: string }> }> = [
  {
    label: '战斗核心',
    items: [
      { table: 'actors', label: '角色' },
      { table: 'skills', label: '技能' },
      { table: 'buffs', label: '状态与 Buff' },
      { table: 'enemies', label: '敌人' },
    ],
  },
  {
    label: '世界编组',
    items: [
      { table: 'scenes', label: '场景' },
      { table: 'formations', label: '阵型' },
      { table: 'lineups', label: '预设阵容' },
    ],
  },
  {
    label: '物品经济',
    items: [
      { table: 'materials', label: '材料' },
      { table: 'equipment', label: '装备' },
      { table: 'drops', label: '掉落组' },
    ],
  },
  {
    label: '规则成长',
    items: [
      { table: 'elements', label: '阵营克制' },
      { table: 'growth', label: '成长曲线' },
    ],
  },
]

const SYSTEM_VIEWS: Array<{ view: FengshenView; label: string }> = [
  { view: 'formulas', label: '属性与公式' },
  { view: 'rules', label: '战斗规则参数' },
  { view: 'packages', label: '数据包管理' },
  { view: 'health', label: '健康检查' },
  { view: 'logs', label: '操作日志' },
]

const store = useFengshenStore()
const storageOk = ref(true)

function selectDomain(table: FengshenTableName): void {
  store.activeView = 'domain' as FengshenView
  store.setTable(table)
}

onMounted(() => {
  void store.refreshVersion()
  void store.refreshList()
})
</script>

<style lang="scss">
@use './styles/fengshen.scss';
</style>
