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

    <!-- 演劫台：游戏模块（多游戏容器，斗战西游为首个落地游戏）
         NOTE: 进入游戏后面板切换为全屏（隐藏 ModuleHeader 时去掉 60px 顶部预留） -->
    <div v-show="activeModule === 'yanjie'"
      :class="['module-layout', inYanjieGame ? 'module-layout--immersive' : 'module-layout--full']"
      :id="modulePanelId('yanjie')" role="tabpanel" :aria-labelledby="moduleTabId('yanjie')">
      <Yanjie ref="yanjieRef" />
    </div>

    <!-- 全局图鉴 -->
    <CompendiumDialog v-model="showCompendiumDialog" />

    <!-- 全局通知（各模块统一入口） -->
    <GlobalNotifications />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "@/presentation/components/Button.vue";
import CompendiumDialog from "@/presentation/components/CompendiumDialog.vue";
import GlobalNotifications from "@/presentation/components/GlobalNotifications.vue";
import ModuleHeader, { modulePanelId, moduleTabId, type ModuleId } from "@/presentation/components/ModuleHeader.vue";
import Fengshen from "@/presentation/modules/fengshen/Fengshen.vue";
import HaotianMirror from "@/presentation/modules/haotian/HaotianMirror.vue";
import Huanling from "@/presentation/modules/huanling/Huanling.vue";
import Yanjie from "@/presentation/modules/yanjie/Yanjie.vue";

const showCompendiumDialog = ref(false);

// 当前激活模块（9.3：唤灵台为默认模块）
const activeModule = ref<ModuleId>('huanling');

// 唤灵台实例：顶部模块栏专属操作按钮经 ref 触发模块内对话框
interface HuanlingExposed {
  openRulesDialog: () => void
  openDebugDialog: () => void
  saveRecording: () => Promise<void>
}
const huanlingRef = ref<HuanlingExposed | null>(null);

// 演劫台实例：暴露进入游戏状态，用于隐藏全局 ModuleHeader + 面板全屏
interface YanjieExposed {
  entered: ''
  | 'xiyou'
}
const yanjieRef = ref<YanjieExposed | null>(null);

/** 是否处于演劫台游戏内（进入游戏 = 隐藏全局顶栏，面板切换全屏） */
const inYanjieGame = computed(() => activeModule.value === 'yanjie' && !!yanjieRef.value?.entered);
</script>
