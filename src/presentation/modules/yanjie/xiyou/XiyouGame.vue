<template>
  <div class="xy-game">
    <!-- 游戏专属顶部导航栏（系统主题色） -->
    <header class="xy-topbar">
      <div class="xy-topbar-brand">
        <h1 class="xy-topbar-title">斗战西游</h1>
        <span class="xy-topbar-sub">降妖路引 · 水墨回合制</span>
      </div>
      <!-- 调试入口（仅开发模式渲染，PRD §4.1） -->
      <div v-if="isDev" class="xy-topbar-debug">
        <button type="button" class="xy-topbar-debug-btn" :class="{ active: debugOpen }" @click="debugOpen = !debugOpen">
          <IconDebug class="xy-topbar-debug-icon" />
          <span>调试</span>
        </button>
      </div>
    </header>

    <!-- 调试控制面板（右缘停靠，仅开发模式） -->
    <DebugCavePanel v-if="isDev" v-model="debugOpen" />

    <!-- 主体四栏（行路态：角色行囊栏+战斗+宝阁+四象栏；功能态：全屏宝阁+四象栏） -->
    <div class="xy-body" :class="[`xy-side--${sidebarSide}`, isFeature ? 'xy-body--feature' : 'xy-body--journey']">
      <!-- 最左：角色行囊栏（角色属性 + 行囊，仅行路态显示） -->
      <BattleRoster v-show="!isFeature" @open-pack="activeCabinet = 'pack'" />
      <FourAspectBar v-model="activeCabinet" @open-map="mapOpen = true" @open-settings="settingsOpen = true" />

      <!-- 功能宝阁（行路态 290px / 功能态全屏） -->
      <TreasureCabinet :tab="activeCabinet" :current="currentScene" :regions="regions" :scenes="scenes"
        @select="onSceneSelect" @open-equip="activeCabinet = 'equip'" />

      <!-- 战斗禅台（仅行路态显示；gameLoaded 前不挂载，避免首屏用存档前初始属性初始化战斗） -->
      <BattleZen v-if="gameLoaded" v-show="!isFeature" :scene="currentScene" />
      <div v-else class="xy-battle-loading" aria-label="斗战西游加载中">斗战西游加载中…</div>
    </div>

    <!-- 降妖路引：弹窗大地图 -->
    <SceneMapDialog v-model="mapOpen" :regions="regions" :scenes="scenes" :current="currentScene"
      @select="currentScene = $event" />

    <!-- 设置：居中弹窗 -->
    <SettingsDialog v-model="settingsOpen" v-model:sidebar="sidebarSide" @back="emit('back')"
      @progress-changed="onProgressChanged" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type WatchStopHandle } from 'vue'
import IconDebug from '~icons/app/debug'
import BattleRoster from './components/BattleRoster.vue'
import BattleZen from './components/BattleZen.vue'
import DebugCavePanel from './components/DebugCavePanel.vue'
import FourAspectBar, { type GroupTab } from './components/FourAspectBar.vue'
import SceneMapDialog from './components/SceneMapDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import TreasureCabinet from './components/TreasureCabinet.vue'
import { regions, scenes, loadXiyouData, type XiyouScene } from './xiyouData'
import { saveManager } from './save-bridge'
import { usePackStore } from '@/presentation/stores/packStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

/** 调试面板仅在开发环境渲染（生产零开销，PRD §8.12） */
const isDev = import.meta.env.DEV

/** 调试面板开关（Ctrl+Shift+D 或顶部按钮切换；v-show 保活不销毁） */
const debugOpen = ref(false)

/** 当前选中的功能宝阁分组（battle=战斗禅台/行路态，其余功能 tab 切功能态） */
const activeCabinet = ref<GroupTab>('battle')

/** 降妖路引弹窗开关 */
const mapOpen = ref(false)

/** 设置弹窗开关 */
const settingsOpen = ref(false)

/** 功能面板页签位置（四象栏在左/右；设计稿 §8.2：默认左侧，设置中可切换右侧） */
const sidebarSide = ref<'left' | 'right'>('left')

/** 功能态：点击装备/洞府/收集等时，宝阁全屏、战斗区隐藏（battle/map 属行路态，战斗区常驻） */
const isFeature = computed(() => activeCabinet.value !== 'battle' && activeCabinet.value !== 'map')

/** 当前选中关卡（由降妖路引弹窗选择） */
const currentScene = ref<XiyouScene>(scenes.find(s => s.unlocked) ?? scenes[0])

/** 存档加载完成（战斗区等待其就绪后再挂载，保证首屏用恢复后的玩家属性） */
const gameLoaded = ref(false)

/** 侧边路引时间线点选关卡：切场景并回战斗 tab */
function onSceneSelect(scene: XiyouScene): void {
  currentScene.value = scene
  activeCabinet.value = 'battle'
}

/** 退出演劫台（由设置面板「退出演劫台」触发，父级切回唤灵台） */
const emit = defineEmits<{ back: [] }>()

// NOTE: 封神榜数据源接线（需求说明 §5.1 方案 B）——数据先以 configs 兜底渲染，
//       封神榜 IDB 有西游数据则加载后原地更新（reactive），并重选当前关卡。
//       存档加载在 loadXiyouData 之后（restore 依赖 scenes 解锁派生），随后启动自动存档。
let stopSceneWatch: WatchStopHandle | null = null
onMounted(async () => {
  await loadXiyouData()
  const loadResult = await saveManager.load()
  // 主档异常/损坏等降级路径的提示（PRD §7）
  if (loadResult.message) {
    useNotificationStore().toast(loadResult.message, loadResult.source === 'main' ? 'info' : 'warning')
  }
  const savedId = saveManager.getCurrentSceneId()
  const saved = savedId ? scenes.find(s => s.id === savedId) : undefined
  currentScene.value = saved ?? scenes.find(s => s.unlocked) ?? scenes[0]
  saveManager.setCurrentSceneId(currentScene.value.id)
  // NOTE: onMounted 内注册 watch——确保初始赋值不触发存档，仅后续切换（地图/时间线）触发
  stopSceneWatch = watch(() => currentScene.value.id, id => {
    saveManager.setCurrentSceneId(id)
    void saveManager.autoSave()
  })
  gameLoaded.value = true
  saveManager.startAutoSave()
})

/** 新游戏 / 导入存档后：回到当前解锁的第一关，关闭功能态 */
function onProgressChanged(): void {
  const first = scenes.find(s => s.unlocked) ?? scenes[0]
  currentScene.value = first
  saveManager.setCurrentSceneId(first.id)
  activeCabinet.value = 'battle'
}

// NOTE: 行囊运行时落盘（方案二 5.2「离开演劫台强制同步写入」）——flush 内部对未 init 状态空转；
//       离开演劫台（SPA 路由切换，非页面卸载）先存档再停定时器，保证最近进度落盘
onUnmounted(() => {
  stopSceneWatch?.()
  void saveManager.autoSave().finally(() => {
    void usePackStore().flush()
    saveManager.stopAutoSave()
  })
})
</script>

<style lang="scss">
@use './styles/xiyou.scss';
</style>
