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
        <button type="button" class="fs-reload-btn" :disabled="store.loading" @click="askReload">从项目文件重载</button>
        <button type="button" class="fs-help-toggle" :class="{ on: helpOpen }" :aria-expanded="helpOpen"
          @click="helpOpen = !helpOpen">使用说明</button>
        <div v-if="helpOpen" class="fs-help-pop">
          <p>· 数据存于浏览器 IndexedDB，任何写操作（增/删/改/导入）都会递增全局数据版本。</p>
          <p>· 编辑保存后、未开战时，战斗引擎数据源自动重载，改动即时生效。</p>
          <p>· 复杂数组字段（技能步骤 / Buff 效果等）以 JSON 编辑，输入时实时校验语法。</p>
          <p>· 引用断裂可在「健康检查」页面一键定位到具体实体修复。</p>
        </div>
      </div>
    </aside>

    <!-- 主内容 -->
    <main class="fs-content">
      <ListView v-if="store.activeView === 'domain'" />
      <FormulasView v-else-if="store.activeView === 'formulas'" />
      <HealthView v-else-if="store.activeView === 'health'" />
      <LogsView v-else-if="store.activeView === 'logs'" />
      <PackagesView v-else-if="store.activeView === 'packages'" />
      <ExpGoldView v-else-if="store.activeView === 'expgold'" />
    </main>

    <ConfirmDialog v-model="confirmReload" title="从项目文件重载"
      message="将从 configs/ 项目文件重导全部数据，覆盖封神榜内手动修改的内容。确定继续？"
      confirm-text="重载" danger @confirm="doReload" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useFengshenStore, type FengshenView } from '@/presentation/modules/fengshen/stores/fengshenStore'
import type { FengshenTableName } from '@/domain/fengshen/types'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import ListView from '@/presentation/modules/fengshen/views/ListView.vue'
import FormulasView from '@/presentation/modules/fengshen/views/FormulasView.vue'
import HealthView from '@/presentation/modules/fengshen/views/HealthView.vue'
import LogsView from '@/presentation/modules/fengshen/views/LogsView.vue'
import PackagesView from '@/presentation/modules/fengshen/views/PackagesView.vue'
import ExpGoldView from '@/presentation/modules/fengshen/views/ExpGoldView.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'

/** 数据域按子领域分组（侧栏导航层次） */
const DOMAIN_GROUPS: Array<{ label: string; items: Array<{ table: FengshenTableName; label: string }> }> = [
  {
    label: '战斗核心',
    items: [
      { table: 'actors', label: '角色' },
      { table: 'enemies', label: '敌人' },
      { table: 'skills', label: '技能' },
      { table: 'buffs', label: '状态与 Buff' },
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
      { table: 'items', label: '物品' },
      { table: 'materials', label: '材料' },
      { table: 'equipment', label: '装备' },
      { table: 'gears', label: '装备详情' },
    ],
  },
  {
    label: '规则成长',
    items: [
      { table: 'elements', label: '阵营克制' },
      { table: 'growth', label: '成长曲线' },
      { table: 'affixes', label: '词缀' },
      { table: 'params', label: '战斗规则参数' },
    ],
  },
  {
    label: '演劫台',
    items: [
      { table: 'xiyou', label: '西游数据' },
    ],
  },
]

const SYSTEM_VIEWS: Array<{ view: FengshenView; label: string }> = [
  { view: 'formulas', label: '属性与公式' },
  { view: 'expgold', label: '经验与金钱管理' },
  { view: 'packages', label: '数据包管理' },
  { view: 'health', label: '健康检查' },
  { view: 'logs', label: '操作日志' },
]

const store = useFengshenStore()
const storageOk = ref(true)
const helpOpen = ref(false)
const confirmReload = ref(false)

function selectDomain(table: FengshenTableName): void {
  store.activeView = 'domain' as FengshenView
  store.setTable(table)
}

/** 从项目文件重导（覆盖语义）：先弹确认框 */
function askReload(): void {
  confirmReload.value = true
}

/** 确认后清空并重导全部封神榜表 */
async function doReload(): Promise<void> {
  await store.reloadFromProject()
}

onMounted(() => {
  void store.refreshVersion()
  void store.refreshList()
  void persistentStorage.isAvailable().then((ok) => (storageOk.value = ok))
})
</script>

<style lang="scss">
@use '@/presentation/modules/fengshen/styles/fengshen.scss';
</style>
