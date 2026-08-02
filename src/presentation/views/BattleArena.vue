<template>
  <div class="battle-test-tool">
    <!-- 加载指示器 -->
    <div v-if="battleStore.loading.isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ battleStore.loading.operation || '加载中...' }}</div>
      <div v-if="battleStore.loading.progress !== null" class="loading-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: battleStore.loading.progress + '%' }"></div>
        </div>
        <div class="progress-text">{{ battleStore.loading.progress }}%</div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="battleStore.error.hasError" class="error-toast" role="alert" @click="battleStore.clearError()">
      <span class="error-message">{{ battleStore.error.message }}</span>
      <button class="error-close" aria-label="关闭错误提示">&times;</button>
    </div>

    <div class="tool-header">
      <h1>回合制战斗系统测试工具 v1.0</h1>
      <div class="header-actions">
        <button class="btn-medium" @click="showDataSnapshotDialog = true">数据快照</button>
        <button class="btn-medium" @click="showRecordingDialog = true">战斗记录</button>
        <button class="btn-medium" @click="showDebugLogDialog = true">调试日志</button>
        <button class="btn-medium" @click="showDebugControlDialog = true">调试面板</button>
        <button class="btn-medium" @click="showCompendiumDialog = true">图鉴</button>
        <button class="btn-medium" @click="showRulesDialog = true">战斗规则</button>
        <button class="btn-medium" @click="showSceneDialog = true">场景管理</button>
        <button class="btn-medium" @click="showStatusDialog = true">角色编辑</button>
      </div>
    </div>

    <div class="main-layout">
      <!-- 左侧：参战角色配置 -->
      <ParticipantPanel />

      <!-- 中间：战斗战场和日志 -->
      <BattleField ref="battleFieldRef" :current-actor-id="battleStore.currentActorId"
        @select-character="selectCharacter" />

      <!-- 右侧：调试面板 -->
      <BattleDashboard />
    </div>

    <!-- 对话框组件 -->
    <BattleRulesDialog v-model="showRulesDialog" :rules="battleStore.rules" :speed="battleStore.battleSpeed"
      @update:rules="battleStore.updateRules" @update:speed="updateSpeed" @rule-change="handleRuleChange" />

    <SceneManagementDialog v-model="showSceneDialog" :scene-name="sceneName" :selected-scene="selectedScene"
      :saved-scenes="savedScenes" @update:scene-name="val => sceneName = val"
      @update:selected-scene="val => selectedScene = val" @save="handleSaveScene" @load="handleLoadScene"
      @delete="handleDeleteScene" />

    <CharacterEditor v-model="showStatusDialog" :characters="characterOptions"
      :selected-char-id="selectedCharacterId || ''" :current-attrs="currentAttrs"
      @update:selected-char-id="val => battleStore.selectCharacter(val)" @apply-buffs="handleApplyBuffs"
      @apply-attributes="handleApplyAttributes" @reset-character="handleResetCharacter" />

    <CompendiumDialog v-model="showCompendiumDialog" />

    <DataSnapshotDialog v-model="showDataSnapshotDialog" />

    <BattleRecordingDialog v-model="showRecordingDialog" />

    <DebugLogDialog v-model="showDebugLogDialog" :logs="debugLogs" :trace-roots="traceRoots" :trace-events="traceEvents" :actor-names="actorNames" @clear="clearDebugLogs" @refresh-trace="updateTraceRoots" />

    <DebugControlDialog v-model="showDebugControlDialog" @action="handleDebugAction" />

    <!-- 底部控制栏 -->
    <ControlBar :is-battle-active="battleStore.isBattleActive"
      :is-auto-playing="battleStore.autoPlayMode" :is-paused="battleStore.isPaused"
      :battle-speed="battleStore.battleSpeed" @start-battle="startBattle"
      @end-battle="endBattle" @reset-battle="requestResetBattle" @toggle-auto-play="toggleAutoPlay"
      @battle-speed-change="handleBattleSpeedChange" />

    <!-- 快捷键提示面板 -->
    <!-- <KeybindHintPanel ref="keybindHintPanelRef" /> -->

    <!-- 通知组件 -->
    <Notification ref="notification" />

    <!-- 重置战斗二次确认 -->
    <ConfirmDialog v-model="confirmResetBattle" title="重置战斗"
      message="确定要重置当前战斗吗？所有战斗进度将清空。"
      confirm-text="重置" danger @confirm="resetBattle" />
  </div>
</template>

<script setup lang="ts">
import type { BattleService } from '@/application/facade/BattleFacade';
import { ATTRIBUTE_CODE, ModifierType } from "@/domain/attribute/types";
import { ParticipantSide } from "@/domain/battle/type/types.ts";
import type { BuffScriptLoader } from '@/domain/buff/BuffScriptLoader';
import { BuffSystem } from '@/domain/buff/BuffSystem';
import { TRACE_EVENT_ADDED } from '@/domain/battle/logs/TraceEventCollector';
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus';
import { DamageCategory } from '@/domain/skill/types';
import { battleLogManager } from '@/infrastructure/adapters/logging/BattleLogManager';
import { container } from '@/infrastructure/di/Container';
import CompendiumDialog from "@/presentation/components/CompendiumDialog.vue";
import Notification from "@/presentation/components/Notification.vue";
import ConfirmDialog from "@/presentation/components/ConfirmDialog.vue";
import { useBattleStore, SkillStepType } from '@/presentation/stores';
import type { LogEntry } from '@/shared/types/battle-log';
import { BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log';
import type { TraceEvent, TraceEventNode } from '@/shared/types/trace-event';
import { GameDataProcessor } from "@/shared/utils/GameDataProcessor";
import { computed, onMounted, onUnmounted, ref, shallowReactive, watch } from "vue";
import BattleDashboard from "./BattleDashboard.vue";
import BattleField from "./BattleField.vue";
import BattleRecordingDialog from "./components/BattleRecordingDialog.vue";
import BattleRulesDialog from "./components/BattleRulesDialog.vue";
import type { CharacterOption } from "./components/CharacterEditor.vue";
import CharacterEditor from "./components/CharacterEditor.vue";
import DataSnapshotDialog from "./components/DataSnapshotDialog.vue";
import DebugControlDialog from "./components/DebugControlDialog.vue";
import DebugLogDialog from "./components/DebugLogDialog.vue";
import SceneManagementDialog from "./components/SceneManagementDialog.vue";
import ControlBar from "./ControlBar.vue";
import ParticipantPanel from "./ParticipantPanel.vue";
// 通知组件引用
const notification = ref<InstanceType<typeof Notification> | null>(null);

// 使用Pinia状态管理
const battleStore = useBattleStore();

// BattleService 响应式实例
const battleService = shallowReactive(container.resolve<BattleService>('BattleService'));

const selectedScene = ref("");
const sceneName = ref("");
const showRulesDialog = ref(false);
const showSceneDialog = ref(false);
const showStatusDialog = ref(false);
const showCompendiumDialog = ref(false);
const showDataSnapshotDialog = ref(false);
const showDebugLogDialog = ref(false);
const showDebugControlDialog = ref(false);
const showRecordingDialog = ref(false);

// ponytail: 调试面板现在独立监听事件总线，无需 BattleArena 维护 phase 状态

const debugLogs = ref<LogEntry[]>([]);

// 树状调试日志数据
const traceRoots = ref<TraceEventNode[]>([]);

// 实时流调试日志数据（TraceEvent 全量）
const traceEvents = ref<TraceEvent[]>([]);

/** 实体 ID → 角色名 映射（调试日志显示名字而非内部 ID，来源：battleStore 投影快照） */
const actorNames = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  for (const [id, p] of battleStore.participants) {
    m[id] = p.name
  }
  return m
})

const CT = {
  common: {

  },
  status: {
    success: '胜利',
    fail: '失败',
    skip: '跳过回合',
    end: '强制结束',
    full_health: '满血',
    full_energy: '满能量',
    kill_selected: '击杀选中',
  }
}

/** 从 BattleSystem.traceCollector 刷新树状日志 */
async function updateTraceRoots() {
  try {
    const { BATTLE_SYSTEM_TOKEN } = await import('@/domain/battle/entity/BattleInterfaces')
    const { BattleSystem } = await import('@/domain/battle/BattleSystem')
    const bs = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    if (bs?.traceCollector) {
      const collector = bs.traceCollector
      const allTurns = new Set<number>()
      for (const e of collector.getAll()) {
        // 无回合信息的事件（如 Buff 生命周期）落在 turn-0 桶，一并纳入展示
        allTurns.add(e.turn != null ? Number(e.turn) : 0)
      }
      const roots: TraceEventNode[] = []
      for (const turn of allTurns) {
        roots.push(...collector.getRootsByTurn(turn))
      }
      traceRoots.value = roots
      traceEvents.value = collector.getAll()
    }
  } catch {
    // 战斗系统未就绪时静默忽略
  }
}

/** 从 BattleSystem.traceCollector 刷新实时流事件（TRACE_EVENT_ADDED 广播时触发） */
async function refreshTraceEvents() {
  // 弹窗关闭时零成本跳过：订阅常驻，但只在调试面板可见时才全量刷新（避免战斗循环内每次 emit 都 O(n) 复制）
  if (!showDebugLogDialog.value) return
  try {
    const { BATTLE_SYSTEM_TOKEN } = await import('@/domain/battle/entity/BattleInterfaces')
    const { BattleSystem } = await import('@/domain/battle/BattleSystem')
    const bs = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    if (bs?.traceCollector) {
      traceEvents.value = bs.traceCollector.getAll()
    }
  } catch {
    // 战斗系统未就绪时静默忽略
  }
}

// 打开弹窗时刷新
watch(showDebugLogDialog, async (val) => {
  if (val) await updateTraceRoots()
})

const clearDebugLogs = () => {
  debugLogs.value = [];
  battleLogManager.clearLogs();
};

const handleDebugAction = async (action: string) => {
  console.log('Debug action:', action)
  switch (action) {
    case 'win_battle':
      battleLogManager.addSystemLog({
        message: '调试: 立即胜利',
      })
      break
    case 'lose_battle':
      battleLogManager.addSystemLog({
        message: '调试: 立即失败',
      })
      break
    case 'skip_turn':
      battleLogManager.addSystemLog({
        message: '调试: 跳过回合',
      })
      break
    case 'end_battle':
      battleLogManager.addSystemLog({
        message: '调试: 强制结束战斗',
      })
      break
    case 'full_health':
      battleLogManager.addSystemLog({
        message: '调试: 满血',
      })
      break
    case 'full_energy':
      battleLogManager.addSystemLog({
        message: '调试: 满能量',
      })
      break
    case 'kill_selected':
      battleLogManager.addSystemLog({
        message: '调试: 杀死选中',
      })
      break
    case 'max_skill_cd':
      battleLogManager.addSystemLog({
        message: '调试: 满技能CD',
      })
      break
    case 'force_crit':
      battleLogManager.addSystemLog({
        message: '调试: 触发暴击',
      })
      break
    case 'force_dodge':
      battleLogManager.addSystemLog({
        message: '调试: 触发闪避',
      })
      break
    case 'force_block':
      battleLogManager.addSystemLog({
        message: '调试: 触发格挡',
      })
      break
    case 'add_buff':
      battleLogManager.addSystemLog({
        message: '调试: 添加Buff',
      })
      break
    case 'dump_logs':
      console.log('Current logs:', battleLogManager.getAllLogs())
      battleLogManager.addSystemLog({
        message: ' 日志已输出到控制台',
      })
      break
    case 'export_state':
      battleLogManager.addSystemLog({
        message: '调试: 导出状态',
      })
      break
    case 'import_state':
      battleLogManager.addSystemLog({
        message: '调试: 导入状态',
      })
      break
    case 'reset_battle':
      battleLogManager.addSystemLog({
        message: '调试: 重置战斗',
      })
      break
    case 'reload_buffs': {
      const loader = container.resolve<BuffScriptLoader>('BuffScriptLoader')
      await loader.reloadScripts()
      battleLogManager.addSystemLog({
        message: 'Buff 脚本已热重载',
      })
      break
    }
    case 'log_battle':
      battleLogManager.addBattleLog({
        turn: 1,
        message: '[调试] 测试战斗日志',
        segments: [{ text: '[调试] 测试战斗日志', classStr: 'log-info' }],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'sub' },
      })
      break
    case 'log_system':
      battleLogManager.addSystemLog({
        message: '[调试] 测试系统日志',
      })
      break
    case 'log_item':
      battleLogManager.addGainItemLog([])
      break
    case 'log_action':
      battleLogManager.addActionLog({ source: '调试角色', action: '普通攻击', message: '[调试] 测试行为日志' })
      break
    case 'log_debug':
      battleLogManager.updateFilters({ debug: true })
      battleLogManager.addDebugLog('[调试] 测试调试日志')
      break

    // ========== 动画调试 ==========
    case 'test_damage_num': {
      const tId = battleStore.selectedCharacterId || battleStore.enemyTeam[0]?.id || battleStore.allyTeam[0]?.id
      if (tId) {
        battleStore.setAnimationState(SkillStepType.DAMAGE, { targetId: tId, damage: 999, damageCategory: DamageCategory.PHYSICAL, isCritical: false, isHeal: false })
        battleLogManager.addSystemLog({ message: `调试: 在 [${tId}] 上测试伤害数字 999` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有可用的角色' })
      }
      break
    }
    case 'test_crit_num': {
      const tId = battleStore.selectedCharacterId || battleStore.enemyTeam[0]?.id || battleStore.allyTeam[0]?.id
      if (tId) {
        battleStore.setAnimationState(SkillStepType.DAMAGE, { targetId: tId, damage: 1999, damageCategory: DamageCategory.PHYSICAL, isCritical: true, isHeal: false })
        battleLogManager.addSystemLog({ message: `调试: 在 [${tId}] 上测试暴击数字 1999` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有可用的角色' })
      }
      break
    }
    case 'test_heal_num': {
      const tId = battleStore.selectedCharacterId || battleStore.allyTeam[0]?.id || battleStore.enemyTeam[0]?.id
      if (tId) {
        battleStore.setAnimationState(SkillStepType.DAMAGE, { targetId: tId, damage: 500, damageCategory: 'heal', isCritical: false, isHeal: true })
        battleLogManager.addSystemLog({ message: `调试: 在 [${tId}] 上测试治疗数字 500` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有可用的角色' })
      }
      break
    }
    case 'test_skill_fly': {
      const source = battleStore.allyTeam[0]
      const target = battleStore.enemyTeam[0]
      if (source && target) {
        battleStore.setAnimationState('skill', { sourceId: source.id, targetId: target.id, skillName: '测试技能·裂空斩', effectType: 'attack', damageCategory: DamageCategory.PHYSICAL })
        battleLogManager.addSystemLog({ message: `调试: 测试技能飞行 [${source.name}] → [${target.name}]` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有足够的角色' })
      }
      break
    }
    case 'clear_animations':
      battleFieldRef.value?.cleanupAnimations()
      battleStore.setAnimationState(SkillStepType.DAMAGE, null)
      battleStore.setAnimationState(SkillStepType.MISS, null)
      battleStore.setAnimationState(SkillStepType.BUFF, null)
      battleStore.setAnimationState('skill', null)
      battleLogManager.addSystemLog({ message: '调试: 清除所有动画效果' })
      break
    case 'dump_animation':
      console.log('[动画调试] animationState:', JSON.parse(JSON.stringify(battleStore.animationState)))
      console.log('[动画调试] battleSpeed:', battleStore.battleSpeed)
      console.log('[动画调试] getAnimationDuration:', battleStore.getAnimationDuration())
      console.log('[动画调试] isBattleActive:', battleStore.isBattleActive)
      battleLogManager.addSystemLog({ message: '动画状态已输出到控制台' })
      break
  }
};

const battleFieldRef = ref<InstanceType<typeof BattleField> | null>(null);
const savedScenes = ref<string[]>([]);

// ==================== 为角色编辑弹窗提供数据 ====================

/** 所有参战角色列表（用于弹窗内下拉选择） */
const characterOptions = computed<CharacterOption[]>(() => {
  const ally = battleStore.allyTeam.map(e => ({
    id: e.id,
    name: e.name,
    side: 'ally' as const,
  }))
  const enemy = battleStore.enemyTeam.map(e => ({
    id: e.id,
    name: e.name,
    side: 'enemy' as const,
  }))
  return [...ally, ...enemy]
})

/** 当前选中角色的 5 个核心属性值（用于属性调整 Tab 的显示，通过 getAttrVal 获取以保证类型正确） */
const currentAttrs = computed(() => {
  const char = selectedCharacter.value
  const defaults = { currentHealth: 0, currentEnergy: 0, minAttack: 0, defense: 0, speed: 0 }
  if (!char) return defaults
  return {
    currentHealth: battleStore.participants.get(char.id)?.currentHealth ?? 0,
    currentEnergy: battleStore.participants.get(char.id)?.currentEnergy ?? 0,
    minAttack: char.getAttrVal(ATTRIBUTE_CODE.minAttack)?.value ?? 0,
    defense: char.getAttrVal(ATTRIBUTE_CODE.defense)?.value ?? 0,
    speed: char.getAttrVal(ATTRIBUTE_CODE.speed)?.value ?? 0,
  }
})

// 计算属性
const selectedCharacterId = computed(() => {
  return battleStore.selectedCharacterId || null
});

const selectedCharacter = computed(() => {
  const id = battleStore.selectedCharacterId
  if (!id) return null
  const all = [...battleStore.allyTeam, ...battleStore.enemyTeam]
  return all.find(p => p.id === id) || null
});

const currentTurn = computed(() => {
  return battleStore.currentTurn || 1
});

const allyTeam = computed(() => {
  return battleStore.allyTeam
});

const enemyTeam = computed(() => {
  return battleStore.enemyTeam
});

// 初始化战斗
function initBattle() {
  // ponytail: 默认测试阵容 — 覆盖伤害/治疗/护盾/buff/debuff 的典型组合
  const allyIds = ["guardian_fire"]; // "enemy_005", "boss_003", "boss_001", "enemy_004", 
  const allyList = GameDataProcessor.findEnemiesByIds(allyIds);
  const enemyIds = ["guardian_gold"]; // "enemy_008", "boss_002", "enemy_007", "enemy_003", 
  const enemyList = GameDataProcessor.findEnemiesByIds(enemyIds);
  console.log('allyList', allyList)
  console.log('enemyList', enemyList)

  const allyTeamData = allyList.map((ally, index) => GameDataProcessor.enemyToParticipant(ally, ParticipantSide.ALLY, index));
  const enemyTeamData = enemyList.map((enemy, index) => GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ENEMY, index));
  console.log('allyTeamData', allyTeamData)
  console.log('enemyTeamData', enemyTeamData)
  // 使用BattleService初始化队伍数据
  battleService.initializeTeams(allyTeamData, enemyTeamData);

  const firstAlly = battleService.getAllyTeam()[0];
  if (firstAlly) {
    battleStore.selectCharacter(firstAlly.id);
  }
}

// 初始化战斗系统和快捷键
onMounted(() => {
  // 初始化战斗管理器
  battleStore.initializeBattleService(battleService);
  battleService.loadSkillConfigs();
  // 初始化队伍数据
  initBattle();
  // 监听 battleLogManager 的调试日志 — 通过 addListener 订阅而非 setInterval 轮询
  debugLogListener = () => {
    debugLogs.value = battleLogManager.getDebugLogs();
  };
  battleLogManager.addListener(debugLogListener);
  debugLogs.value = battleLogManager.getDebugLogs();
  // 订阅结构化追踪事件（TRACE_EVENT_ADDED）— 实时流视图随战斗进行自动追加
  traceEventBus = container.resolve<BuffSystem>('BuffSystem').getEventBus();
  traceEventBus.on(TRACE_EVENT_ADDED, refreshTraceEvents);
});

// 监听战斗活跃状态变化
watch(
  () => battleStore.getIsBattleActive,
  (isActive) => {
    if (!isActive) {
      // 清理所有角色的动画状态
      battleService.resetCharacterStates();

      // 清理BattleField中的动画效果
      if (battleFieldRef.value) {
        battleFieldRef.value.cleanupAnimations();
      }
    }
  }
);

// 每场战斗开始时重建 TRACE_EVENT_ADDED 订阅
// resetBattle() 会 clear() 共享触发总线（兜底清理触发器监听器），TRACE_EVENT_ADDED 订阅被一并清除；
// 以 currentBattleId 变化为重建信号（每次新战斗必变；isActive 可能保持 true 不变，如战斗中清空队伍后重开）。
// off 对未注册 handler 是 no-op，幂等安全，保证始终恰好 1 个订阅。
watch(
  () => battleStore.currentBattleId,
  () => {
    if (traceEventBus) {
      traceEventBus.off(TRACE_EVENT_ADDED, refreshTraceEvents);
      traceEventBus.on(TRACE_EVENT_ADDED, refreshTraceEvents);
    }
  }
);


// 战斗规则组件事件处理
const updateSpeed = (speed: number) => {
  battleStore.setBattleSpeed(speed);
};

const handleRuleChange = (key: string, value: boolean) => {
  battleLogManager.addSystemLog({
    message: `战斗规则已更新: ${key} = ${value}`,
  });
};

// 场景管理组件事件处理
const handleSaveScene = (sceneNameValue: string) => {
  savedScenes.value.push(sceneNameValue);
  battleLogManager.addSystemLog({
    message: `保存场景: ${sceneNameValue}`,
  });
};

const handleLoadScene = (sceneNameValue: string) => {
  battleLogManager.addSystemLog({
    message: `加载场景: ${sceneNameValue}`,
  });
};

const handleDeleteScene = (sceneNameValue: string) => {
  const index = savedScenes.value.indexOf(sceneNameValue);
  if (index > -1) {
    savedScenes.value.splice(index, 1);
    battleLogManager.addSystemLog({
      message: `删除场景: ${sceneNameValue}`,
    });
  }
};

// ==================== 角色编辑事件处理 ====================

/** 注入 Buff：调用 BuffSystem.addBuff() 并强制 UI 刷新 */
const handleApplyBuffs = (payload: { charId: string; buffs: { buffId: string; duration: number }[] }) => {
  const buffSystem = container.resolve<BuffSystem>('BuffSystem')
  const currentTurn = battleService.getCurrentTurn() ?? 1
  for (const b of payload.buffs) {
    buffSystem.addBuff(payload.charId, b.buffId, { duration: b.duration }, currentTurn)
  }
  // 强制同步队伍数据 → 创建新的 shallowReactive proxy → 触发 ParticipantCard 重新渲染
  battleStore.syncTeams()
  battleLogManager.addActionLog({
    source: '系统', action: '注入 Buff', target: payload.charId,
    message: `${payload.buffs.length}个 Buff 已注入到 [${payload.charId}]`,
  })
}

/** 改写属性：调用实体 setter */
const handleApplyAttributes = (payload: { charId: string; attributes: Record<string, number> }) => {
  const allParticipants = [
    ...(battleService.getAllyTeam() || []),
    ...(battleService.getEnemyTeam() || []),
  ]
  const entity = allParticipants.find(e => e.id === payload.charId)
  if (!entity) {
    console.warn('[属性调整] 未找到实体:', payload.charId)
    return
  }

  // 运行时状态属性（气血/能量）走直接 setter，不经过 ModifierStack
  if (payload.attributes.currentHealth !== undefined) {
    entity.currentHealth = payload.attributes.currentHealth
  }
  if (payload.attributes.currentEnergy !== undefined) {
    entity.currentEnergy = payload.attributes.currentEnergy
  }

  // 计算属性通过 ModifierStack 添加命名修饰符（符合现有体系，在属性追溯浮层中可见）
  const buffSystem = container.resolve<BuffSystem>('BuffSystem')
  const stack = buffSystem.getModifierStack(payload.charId)
  const calcKeys = Object.keys(payload.attributes).filter(
    k => k !== 'currentHealth' && k !== 'currentEnergy'
  )

  for (const key of calcKeys) {
    const targetValue = payload.attributes[key]
    const sourceKey = `injection_${key}`

    // 移除该属性之前的注入修饰符
    stack.removeModifier(sourceKey)

    // 以 base 为基准计算差值，添加 ADDITIVE 修饰符
    // 最终值 = base + injectionDelta + 其他修饰符
    const currentBase = entity.getAttributeBase(key as ATTRIBUTE_CODE)
    const delta = targetValue - currentBase
    if (delta !== 0) {
      stack.addModifier(sourceKey, key as ATTRIBUTE_CODE, delta, ModifierType.ADDITIVE)
    }
  }

  // 触发实体重新同步修饰符并重算属性
  entity.recalcAll()

  // 强制 UI 刷新
  battleStore.syncTeams()
  const attrs = Object.keys(payload.attributes).join(', ')
  battleLogManager.addActionLog({
    source: '系统', action: '改写属性', target: payload.charId,
    message: `属性已更新: ${attrs}`,
  })
}

/** 重置角色状态 */
const handleResetCharacter = (payload: { charId: string; mode: 'buffs' | 'hp_energy' | 'all' }) => {
  const allParticipants = [
    ...(battleService.getAllyTeam() || []),
    ...(battleService.getEnemyTeam() || []),
  ]
  const entity = allParticipants.find(e => e.id === payload.charId)
  if (!entity) return

  const mode = payload.mode
  if (mode === 'buffs' || mode === 'all') {
    // 通过 BuffSystem 清除所有 Buff
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    buffSystem.clearAllBuffs(payload.charId)
    // 同时清除属性注入修饰符
    const stack = buffSystem.getModifierStack(payload.charId)
    for (const key of ['minAttack', 'defense', 'speed']) {
      stack.removeModifier(`injection_${key}`)
    }
    entity.recalcAll()
  }
  if (mode === 'hp_energy' || mode === 'all') {
    const snap = battleStore.participants.get(entity.id)
    entity.currentHealth = snap?.maxHealth ?? entity.maxHealth
    entity.currentEnergy = snap?.maxEnergy ?? entity.maxEnergy
  }

  // 强制 UI 刷新
  battleStore.syncTeams()

  const modeName = { buffs: '清除所有 Buff', hp_energy: '满血满能量', all: '完全重置' }[mode]
  battleLogManager.addActionLog({
    source: '系统', action: '重置角色', target: payload.charId,
    message: modeName,
  })
}


// 开始战斗
const startBattle = async () => {
  // 获取启用的角色和敌人的详细信息
  const enabledAllyTeam = allyTeam.value.filter((c) => c.enabled);
  const enabledEnemyTeam = enemyTeam.value.filter((e) => e.enabled);

  if (enabledAllyTeam.length === 0) {
    notification.value?.addNotification("提示", "敌我双方各至少选择一个角色参战", "warning");
    return;
  }
  if (enabledEnemyTeam.length === 0) {
    notification.value?.addNotification("提示", "敌我双方各至少选择一个角色参战", "warning");
    return;
  }

  try {
    const result = await battleStore.startBattle();

    if (result) {
      // ponytail: 开始战斗后同步预设的战斗速度
      battleStore.setBattleSpeed(battleStore.battleSpeed)
      notification.value?.addNotification("成功", "战斗已开始", "success");
    } else {
      notification.value?.addNotification("错误", "开始战斗失败", "error");
    }
  } catch (error) {
    console.error("开始战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `开始战斗时出错: ${errorMsg}`,
    });
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

const endBattle = async () => {
  try {
    const result = await battleStore.endBattle(ParticipantSide.ALLY);

    if (result) {
      notification.value?.addNotification("成功", "战斗已结束", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.error.message || "结束战斗失败", "error");
    }
  } catch (error) {
    console.error("结束战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `结束战斗时出错: ${errorMsg}`,
    });
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 重置战斗（先二次确认，防误触丢进度）
const confirmResetBattle = ref(false);
const requestResetBattle = () => {
  confirmResetBattle.value = true;
};

// 重置战斗
const resetBattle = async () => {
  try {
    const result = await battleStore.resetBattle();

    if (result) {
      notification.value?.addNotification("成功", "战斗已重置", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.error.message || "重置战斗失败", "error");
    }
  } catch (error) {
    console.error("重置战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `重置战斗时出错: ${errorMsg}`,
    });
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};



// 切换自动战斗状态
const toggleAutoPlay = async () => {
  try {
    const result = await battleStore.toggleAutoPlay();
    if (result) {
      notification.value?.addNotification("成功", battleStore.autoPlayMode ? "已开始自动战斗" : "已停止自动战斗", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.error.message || "切换自动战斗状态失败", "error");
    }
  } catch (error) {
    console.error("切换自动战斗状态失败:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `切换自动战斗状态失败: ${errorMsg}`,
    });
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 处理战斗速度变化
const handleBattleSpeedChange = (speed: number) => {
  battleStore.setBattleSpeed(speed);
};

// 选择角色
const selectCharacter = (characterId: string) => {
  battleStore.selectCharacter(characterId);
};

let debugLogListener: (() => void) | null = null
let traceEventBus: IDomainEventBus | null = null

onUnmounted(() => {
  battleStore.destroy();
  if (debugLogListener) {
    battleLogManager.removeListener(debugLogListener);
    debugLogListener = null;
  }
  if (traceEventBus) {
    traceEventBus.off(TRACE_EVENT_ADDED, refreshTraceEvents);
    traceEventBus = null;
  }
});
</script>

<style lang="scss">
// 加载指示器样式
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-overlay);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: var(--z-overlay);

  .loading-spinner {
    width: 60px;
    height: 60px;
    border: 4px solid rgba(var(--rgb-white), var(--alpha-border));
    border-radius: 50%;
    border-top-color: var(--color-energy);
    animation: spin 1s ease-in-out infinite;
    margin-bottom: var(--space-5);
  }

  .loading-text {
    color: var(--color-text-primary);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-5);
  }

  .loading-progress {
    width: 300px;
    margin-top: var(--space-5);

    .progress-bar {
      width: 100%;
      height: 8px;
      background-color: rgba(var(--rgb-white), var(--alpha-wash-strong));
      border-radius: var(--radius-sm);
      overflow: hidden;
      margin-bottom: var(--space-2);

      .progress-fill {
        height: 100%;
        background-color: var(--color-energy);
        border-radius: var(--radius-sm);
        transition: width 0.3s ease;
      }
    }

    .progress-text {
      color: var(--color-text-primary);
      font-size: var(--font-size-md);
      text-align: center;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
}

// 错误提示样式
.error-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: rgba(var(--rgb-live), 0.9);
  color: var(--color-text-primary);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(var(--rgb-black), 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 999;
  cursor: pointer;
  transition: var(--transition-base);
  backdrop-filter: blur(2px);

  &:hover {
    background-color: rgba(var(--rgb-live), 1);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(var(--rgb-black), 0.2);
  }

  .error-message {
    flex: 1;
    margin-right: var(--space-3);
    font-size: var(--font-size-md);
    line-height: var(--line-height-sm);
  }

  .error-close {
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    padding: 0 var(--space-1);
    background: none;
    border: none;
    line-height: 1;

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>