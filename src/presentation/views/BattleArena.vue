<template>
  <div class="battle-test-tool">
    <!-- 公共顶部栏：太初道枢 + 模块 Tab + 按模块收敛的操作按钮（9.3）
         NOTE: 进入演劫台游戏后隐藏，避免与游戏自身顶部栏（xy-topbar）叠加 -->
    <ModuleHeader v-show="!inYanjieGame" v-model:active-module="activeModule">
      <template #actions>
        <template v-if="activeModule === 'huanling'">
          <Button @click="huanlingRef?.openRulesDialog()">战斗规则</Button>
          <!-- NOTE: 调试控制操作活战场（battleStore/BattleField 动画），归属唤灵台而非分析模块 -->
          <Button @click="huanlingRef?.openDebugDialog()">调试面板</Button>
          <Button @click="huanlingRef?.openStatusDialog()">角色编辑</Button>
          <Button @click="huanlingRef?.openSceneDialog()">场景管理</Button>
          <Button @click="huanlingRef?.saveRecording()">保存战斗记录</Button>
        </template>
        <!-- NOTE: 封神榜数据管理已内聚到模块内（Fengshen.vue），顶部不再暴露弹窗入口 -->
      </template>
    </ModuleHeader>

    <!-- 唤灵台（默认模块）：v-show 保活，切 Tab 不销毁战场状态。三栏布局由 Huanling 内部 main-layout 持有 -->
    <div v-show="activeModule === 'huanling'" :id="modulePanelId('huanling')"
      role="tabpanel" :aria-labelledby="moduleTabId('huanling')">
      <Huanling ref="huanlingRef" />
    </div>

    <!-- 昊天镜：战斗分析（双工作台 · 回放 / 调试） -->
    <div v-show="activeModule === 'haotian'" class="module-layout module-layout--full" :id="modulePanelId('haotian')"
      role="tabpanel" :aria-labelledby="moduleTabId('haotian')">
      <HaotianMirror :active="activeModule === 'haotian'" />
    </div>

    <!-- 封神榜：数据后台管理 -->
    <div v-show="activeModule === 'fengshen'" class="module-layout module-layout--full" :id="modulePanelId('fengshen')"
      role="tabpanel" :aria-labelledby="moduleTabId('fengshen')">
      <Fengshen />
    </div>

    <!-- 演劫台：斗战西游（唯一项目）。进入即游戏全屏态，
         NOTE: 面板切换为全屏（隐藏 ModuleHeader 时去掉 60px 顶部预留） -->
    <div v-show="activeModule === 'yanjie'"
      class="module-layout module-layout--immersive"
      :id="modulePanelId('yanjie')" role="tabpanel" :aria-labelledby="moduleTabId('yanjie')">
      <Yanjie @back="activeModule = 'huanling'" />
    </div>

    <!-- 全局图鉴 -->
    <CompendiumDialog v-model="showCompendiumDialog" />

    <!-- 全局通知（各模块统一入口） -->
    <GlobalNotifications />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import ModuleHeader, { modulePanelId, moduleTabId, type ModuleId } from "@/presentation/components/ModuleHeader.vue";
import Fengshen from "@/presentation/modules/fengshen/Fengshen.vue";
import HaotianMirror from "@/presentation/modules/haotian/HaotianMirror.vue";
import { useHaotianStore } from "@/presentation/modules/haotian/stores/haotianStore";
import Huanling from "@/presentation/modules/huanling/Huanling.vue";
import Yanjie from "@/presentation/modules/yanjie/Yanjie.vue";
import { uiNavBus, OPEN_LINEUP_EVENT, OPEN_ANALYSIS_EVENT } from "@/presentation/uiEvents";

const showCompendiumDialog = ref(false);

// 当前激活模块（9.3：唤灵台为默认模块）
const activeModule = ref<ModuleId>('huanling');

// 唤灵台实例：顶部模块栏专属操作按钮经 ref 触发模块内对话框
interface HuanlingExposed {
  openRulesDialog: () => void
  openDebugDialog: () => void
  openStatusDialog: () => void
  openSceneDialog: () => void
  saveRecording: () => Promise<void>
}
const huanlingRef = ref<HuanlingExposed | null>(null);

// 演劫台进入即游戏态，无大厅/选择逻辑，无需 ref；back 事件由模板内联切回唤灵台
// NOTE: 进入演劫台 = 隐藏全局 ModuleHeader，面板沉浸全屏
const inYanjieGame = computed(() => activeModule.value === 'yanjie');

// 封神榜「在唤灵台打开阵容」：切到唤灵台 tab（阵容加载由 ParticipantPanel 订阅同一事件完成）
const onOpenLineupInHuanling = (): void => {
  activeModule.value = 'huanling';
};

// 唤灵台战报「去昊天镜分析」：切到昊天镜 tab + 按 battleId 加载该战斗记录
const onOpenAnalysisInHaotian = (battleId: string): void => {
  activeModule.value = 'haotian';
  void useHaotianStore().openBattleById(battleId);
};

onMounted(() => {
  uiNavBus.on(OPEN_LINEUP_EVENT, onOpenLineupInHuanling);
  uiNavBus.on(OPEN_ANALYSIS_EVENT, onOpenAnalysisInHaotian);
});
onUnmounted(() => {
  uiNavBus.off(OPEN_LINEUP_EVENT, onOpenLineupInHuanling);
  uiNavBus.off(OPEN_ANALYSIS_EVENT, onOpenAnalysisInHaotian);
});
</script>
