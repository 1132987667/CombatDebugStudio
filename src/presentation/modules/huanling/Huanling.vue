<template>
  <div class="huanling-module">
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
    <div v-if="battleStore.error.hasError" class="error-toast" role="alert">
      <span class="error-message">{{ battleStore.error.message }}</span>
      <button class="error-close" aria-label="关闭错误提示" @click="battleStore.clearError()">&times;</button>
    </div>

    <!-- 三栏主布局（panel-left / panel-center / panel-right 由 _layout.scss 的 main-layout grid 排布） -->
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

    <DebugControlDialog v-model="showDebugControlDialog" @action="handleDebugAction" />

    <!-- 底部控制栏（唤灵台专属） -->
    <ControlBar :is-battle-active="battleStore.isBattleActive" :is-auto-playing="battleStore.autoPlayMode"
      :is-paused="battleStore.isPaused" :battle-speed="battleStore.battleSpeed" @start-battle="startBattle"
      @end-battle="endBattle" @reset-battle="requestResetBattle" @toggle-pause="togglePause"
      @toggle-auto-play="toggleAutoPlay" @manual-turn="manualTurn"
      @battle-speed-change="handleBattleSpeedChange" />

    <!-- 重置战斗二次确认 -->
    <ConfirmDialog v-model="confirmResetBattle" title="重置战斗"
      message="确定要重置当前战斗吗？所有战斗进度将清空。"
      confirm-text="重置" danger @confirm="resetBattle" />
  </div>
</template>

<script setup lang="ts">
import type { BattleService } from '@/application/facade/BattleFacade';
import { GameDataApi } from '@/application/service/GameDataApi';
import { ATTRIBUTE_CODE, ModifierType } from "@/domain/attribute/types";
import type { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl';
import { ParticipantSide } from "@/domain/battle/type/types.ts";
import type { BuffScriptLoader } from '@/domain/buff/BuffScriptLoader';
import type { ActorData } from '@/domain/fengshen/types';
import { BuffSystem } from '@/domain/buff/BuffSystem';
import { DamageCategory } from '@/domain/skill/types';
import { battleLogManager } from '@/infrastructure/adapters/logging/BattleLogManager';
import { container } from '@/infrastructure/di/Container';
import type { BattleSystem } from '@/domain/battle/BattleSystem';
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces';
import ConfirmDialog from "@/presentation/components/ConfirmDialog.vue";
import { useBattleStore, SkillStepType } from '@/presentation/stores';
import { useNotificationStore } from '@/presentation/stores/notificationStore';
import { BATTLE_LOG_CATEGORIES, LogLevel } from '@/shared/types/battle-log';
import { GameDataProcessor } from "@/shared/utils/GameDataProcessor";
import { computed, onMounted, onUnmounted, ref, shallowReactive, watch } from "vue";
import BattleDashboard from "./views/BattleDashboard.vue";
import BattleField from "./views/BattleField.vue";
import BattleRulesDialog from "./components/BattleRulesDialog.vue";
import type { CharacterOption } from "./components/CharacterEditor.vue";
import CharacterEditor from "./components/CharacterEditor.vue";
import DebugControlDialog from "./components/DebugControlDialog.vue";
import SceneManagementDialog from "./components/SceneManagementDialog.vue";
import ControlBar from "./views/ControlBar.vue";
import ParticipantPanel from "./views/ParticipantPanel.vue";

// 全局通知（统一入口：各模块经 notificationStore.notify 调用）
const notification = useNotificationStore();

// 使用Pinia状态管理
const battleStore = useBattleStore();

// BattleService 响应式实例
const battleService = shallowReactive(container.resolve<BattleService>('BattleService'));

const selectedScene = ref("");
const sceneName = ref("");
const showRulesDialog = ref(false);
const showSceneDialog = ref(false);
const showStatusDialog = ref(false);
const showDebugControlDialog = ref(false);

// ponytail: 调试面板现在独立监听事件总线，无需 Huanling 维护 phase 状态

/** 从 BattleSystem.traceCollector 刷新树状日志 */
const handleDebugAction = async (action: string) => {
  switch (action) {
    case 'win_battle':
      await battleStore.endBattle(ParticipantSide.ALLY)
      battleLogManager.addSystemLog({ message: '调试: 立即胜利' })
      break
    case 'lose_battle':
      await battleStore.endBattle(ParticipantSide.ENEMY)
      battleLogManager.addSystemLog({ message: '调试: 立即失败' })
      break
    case 'end_battle':
      await battleStore.endBattle(getLeadingSide())
      battleLogManager.addSystemLog({ message: '调试: 强制结束战斗' })
      break
    case 'full_health':
      for (const p of getAllParticipants()) p.currentHealth = p.maxHealth
      battleStore.syncTeams()
      battleLogManager.addSystemLog({ message: '调试: 满血' })
      break
    case 'full_energy':
      for (const p of getAllParticipants()) p.currentEnergy = p.maxEnergy
      battleStore.syncTeams()
      battleLogManager.addSystemLog({ message: '调试: 满能量' })
      break
    case 'kill_selected': {
      const selectedId = battleStore.selectedCharacterId
      const target = selectedId ? getAllParticipants().find(p => p.id === selectedId) : undefined
      if (target) {
        target.currentHealth = 0
        battleStore.syncTeams()
        battleLogManager.addSystemLog({ message: `调试: 已杀死 [${selectedId}]` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 未选中角色' })
      }
      break
    }
    case 'dump_logs':
      // NOTE: 功能按钮「输出日志」——有意输出到开发者控制台，非调试残留
      console.log('Current logs:', battleLogManager.getAllLogs())
      battleLogManager.addSystemLog({
        message: ' 日志已输出到控制台',
      })
      break
    case 'export_state':
      await battleStore.exportState(battleStore.currentTurn)
      break
    case 'import_state':
      await battleStore.importState()
      break
    case 'reset_battle':
      await battleStore.resetBattle()
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
      const tId = battleStore.selectedCharacterId || battleStore.enemyTeam[0]?.id || battleStore.allyTeam[0]?.id
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
      // NOTE: 功能按钮「输出动画状态」——有意输出到开发者控制台，非调试残留
      console.log('[动画调试] animationState:', JSON.parse(JSON.stringify(battleStore.animationState)))
      console.log('[动画调试] battleSpeed:', battleStore.battleSpeed)
      console.log('[动画调试] getAnimationDuration:', battleStore.getAnimationDuration())
      console.log('[动画调试] isBattleActive:', battleStore.isBattleActive)
      battleLogManager.addSystemLog({ message: '动画状态已输出到控制台' })
      break
  }
};

const battleFieldRef = ref<InstanceType<typeof BattleField> | null>(null);

// ==================== 场景管理（localStorage 持久化） ====================
const SCENE_STORAGE_KEY = 'huanling.scenes.v1'
/** 场景名列表（UI 下拉展示；内容实体在 sceneStorage 中） */
const savedScenes = ref<string[]>([])
/** 场景内容：名称 → { 我方/敌方角色 id 快照 } */
const sceneStorage = ref<Record<string, { allyIds: string[]; enemyIds: string[] }>>({})

/** 从 localStorage 恢复场景列表 */
const loadScenes = () => {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY)
    sceneStorage.value = raw ? JSON.parse(raw) : {}
    savedScenes.value = Object.keys(sceneStorage.value)
  } catch {
    sceneStorage.value = {}
    savedScenes.value = []
  }
}

/** 场景列表写回 localStorage */
const persistScenes = () => {
  localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(sceneStorage.value))
}

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
  const defaults = { currentHealth: 0, currentEnergy: 0, attack: 0, defense: 0, speed: 0 }
  if (!char) return defaults
  return {
    currentHealth: battleStore.participants.get(char.id)?.currentHealth ?? 0,
    currentEnergy: battleStore.participants.get(char.id)?.currentEnergy ?? 0,
    attack: char.getAttrVal(ATTRIBUTE_CODE.attack)?.value ?? 0,
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
async function initBattle() {
  // NOTE: 默认阵容从封神榜预设阵容（lineups 表）读取——roles 中 roleId 匹配 actors 的归我方、
  //       匹配 enemies 的归敌方（与 ParticipantPanel.applyLineup 同判据），封神榜编辑阵容后默认阵容自动跟随。
  //       无可用阵容时回退：取前两个可用敌人各作我方/敌方演示单位。
  const gameDataApi = container.resolve<GameDataApi>('GameDataApi')
  let allyIds: string[] = []
  let enemyIds: string[] = []
  let actors: ActorData[] = []

  try {
    const [lineups, loadedActors] = await Promise.all([
      gameDataApi.listLineups(),
      gameDataApi.listByTable<ActorData>('actors', { limit: 1000 }),
    ])
    actors = loadedActors
    const seen = new Set<string>()
    for (const lineup of lineups) {
      const roles = [...lineup.roles].sort((a, b) => a.seatIndex - b.seatIndex)
      for (const role of roles) {
        if (seen.has(role.roleId)) continue
        seen.add(role.roleId)
        if (actors.some((a) => a.id === role.roleId)) {
          allyIds.push(role.roleId)
        } else if (GameDataProcessor.findEnemyById(role.roleId)) {
          enemyIds.push(role.roleId)
        }
      }
    }
  } catch {
    allyIds = []
    enemyIds = []
  }

  if (allyIds.length === 0 && enemyIds.length === 0) {
    const enemies = GameDataProcessor.getEnemiesData()
    const pool = enemies.length >= 2 ? enemies : []
    allyIds = pool[0] ? [pool[0].id] : []
    enemyIds = pool[1] ? [pool[1].id] : []
  }

  const allyTeamData: BattleParticipantImpl[] = []
  for (let i = 0; i < allyIds.length; i++) {
    const id = allyIds[i]
    const actor = actors.find((a) => a.id === id)
    if (actor) {
      allyTeamData.push(GameDataProcessor.actorToParticipant(actor, ParticipantSide.ALLY, i))
      continue
    }
    const enemy = GameDataProcessor.findEnemyById(id)
    if (enemy) allyTeamData.push(GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ALLY, i))
  }

  const enemyTeamData: BattleParticipantImpl[] = []
  for (let i = 0; i < enemyIds.length; i++) {
    const enemy = GameDataProcessor.findEnemyById(enemyIds[i])
    if (enemy) enemyTeamData.push(GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ENEMY, i))
  }

  // NOTE: 异步竞态防护——initBattle 在 onMounted 后 await 封神榜 IDB（lineups/actors）查询，
  //       若用户在此期间进入演劫台斗战西游（BattleZen 已 startBattle 激活战斗），
  //       此处晚到的默认阵容覆盖会顶掉斗战西游自己的队伍，故战斗已激活则跳过。
  if (battleService.getIsBattleActive()) {
    battleLogManager.addSystemLog({ message: '跳过默认阵容初始化：战斗已由其他模块接管' })
    return
  }

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
  // 恢复持久化场景列表
  loadScenes();
  // 初始化队伍数据
  void initBattle();
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
/** 保存场景：记录当前参战阵容（我方/敌方角色 id）为场景快照并持久化 */
const handleSaveScene = (sceneNameValue: string) => {
  const allyIds = battleService.getAllyTeam().map(p => p.id)
  const enemyIds = battleService.getEnemyTeam().map(p => p.id)
  sceneStorage.value[sceneNameValue] = { allyIds, enemyIds }
  persistScenes()
  savedScenes.value = Object.keys(sceneStorage.value)
  battleLogManager.addSystemLog({
    message: `保存场景: ${sceneNameValue}（我方${allyIds.length} / 敌方${enemyIds.length}）`,
  });
};

/** 加载场景：按阵容快照重建双方队伍（roleId 先按我方角色、再按敌人解析；失配角色打日志跳过，避免"少人"静默开战） */
const handleLoadScene = async (sceneNameValue: string) => {
  const scene = sceneStorage.value[sceneNameValue]
  if (!scene) {
    battleLogManager.addSystemLog({ message: `加载场景失败: ${sceneNameValue} 不存在` })
    return
  }
  // 先停掉可能进行中的战斗并清空当前编成
  if (battleStore.isBattleActive) await battleStore.endBattle(ParticipantSide.ALLY)
  battleStore.resetBattle()
  battleService.clearParticipants()
  // 我方角色（actors 表）解析失败只影响"我方角色"加载，不回退整个场景（敌人路径不依赖 actors）
  let actors: ActorData[] = []
  try {
    actors = await container.resolve<GameDataApi>('GameDataApi').listByTable<ActorData>('actors', { limit: 1000 })
  } catch {
    actors = []
  }
  let skipped = 0
  scene.allyIds.forEach((id, index) => {
    const roleId = GameDataProcessor.sourceRoleIdOf({ id })
    const entity = GameDataProcessor.resolveRoleToParticipant(roleId, ParticipantSide.ALLY, index, actors)
    if (entity) {
      battleService.addCharacterToTeam(entity, ParticipantSide.ALLY)
    } else {
      skipped++
      battleLogManager.addSystemLog({ message: `加载场景：角色未找到，已跳过: ${id}` })
    }
  })
  scene.enemyIds.forEach((id, index) => {
    const roleId = GameDataProcessor.sourceRoleIdOf({ id })
    const entity = GameDataProcessor.resolveRoleToParticipant(roleId, ParticipantSide.ENEMY, index, actors)
    if (entity) {
      battleService.addCharacterToTeam(entity, ParticipantSide.ENEMY)
    } else {
      skipped++
      battleLogManager.addSystemLog({ message: `加载场景：角色未找到，已跳过: ${id}` })
    }
  })
  battleStore.syncTeams()
  const firstAlly = battleService.getAllyTeam()[0]
  if (firstAlly) battleStore.selectCharacter(firstAlly.id)
  battleLogManager.addSystemLog({
    message: `加载场景: ${sceneNameValue}（我方${scene.allyIds.length} / 敌方${scene.enemyIds.length}）${skipped ? `，${skipped} 个角色未找到` : ''}`,
  });
};

const handleDeleteScene = (sceneNameValue: string) => {
  delete sceneStorage.value[sceneNameValue]
  persistScenes()
  savedScenes.value = Object.keys(sceneStorage.value)
  battleLogManager.addSystemLog({
    message: `删除场景: ${sceneNameValue}`,
  });
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
  notification.notify('成功', `${payload.buffs.length} 个状态已注入 ${payload.charId}`, 'success')
}

/** 改写属性：调用实体 setter */
const handleApplyAttributes = (payload: { charId: string; attributes: Record<string, number> }) => {
  const allParticipants = [
    ...(battleService.getAllyTeam() || []),
    ...(battleService.getEnemyTeam() || []),
  ]
  const entity = allParticipants.find(e => e.id === payload.charId)
  if (!entity) {
    battleLogManager.addDebugLog(`属性调整: 未找到实体 [${payload.charId}]`, { level: LogLevel.WARN })
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
  notification.notify('成功', `属性已更新: ${attrs}`, 'success')
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
    for (const key of ['attack', 'defense', 'speed']) {
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
  notification.notify('成功', `${payload.charId} ${modeName}`, 'success')
}


// 开始战斗
const startBattle = async () => {
  // 获取启用的角色和敌人的详细信息
  const enabledAllyTeam = allyTeam.value.filter((c) => c.enabled);
  const enabledEnemyTeam = enemyTeam.value.filter((e) => e.enabled);

  if (enabledAllyTeam.length === 0) {
    notification.notify("提示", "敌我双方各至少选择一个角色参战", "warning");
    return;
  }
  if (enabledEnemyTeam.length === 0) {
    notification.notify("提示", "敌我双方各至少选择一个角色参战", "warning");
    return;
  }

  try {
    const result = await battleStore.startBattle();

    if (result) {
      // ponytail: 开始战斗后同步预设的战斗速度
      battleStore.setBattleSpeed(battleStore.battleSpeed)
      notification.notify("成功", "战斗已开始", "success");
    } else {
      notification.notify("错误", "开始战斗失败", "error");
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addDebugLog(`开始战斗时出错: ${errorMsg}`, { level: LogLevel.ERROR });
    battleLogManager.addSystemLog({
      message: `开始战斗时出错: ${errorMsg}`,
    });
    notification.notify("错误", errorMsg, "error");
  }
};

const endBattle = async () => {
  try {
    const result = await battleStore.endBattle(ParticipantSide.ALLY);

    if (result) {
      // P1: 战斗结束自动持久化录制，供昊天镜「战斗记录」调用
      const battleId = battleStore.currentBattleId;
      let saved = false;
      let savedName: string | undefined;
      if (battleId) {
        try {
          const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString());
          const saveKey = await battleSystem.saveBattleRecording(battleId);
          saved = !!saveKey;
          if (saveKey) savedName = battleSystem.getBattleRecording(battleId)?.name;
        } catch {
          saved = false;
        }
      }
      notification.notify(
        "成功",
        saved
          ? savedName
            ? `战斗已结束，记录「${savedName}」已保存，可在昊天镜回放`
            : "战斗已结束，记录已保存，可在昊天镜回放"
          : "战斗已结束",
        "success",
      );
    } else {
      notification.notify("错误", battleStore.error.message || "结束战斗失败", "error");
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addDebugLog(`结束战斗时出错: ${errorMsg}`, { level: LogLevel.ERROR });
    battleLogManager.addSystemLog({
      message: `结束战斗时出错: ${errorMsg}`,
    });
    notification.notify("错误", errorMsg, "error");
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
      notification.notify("成功", "战斗已重置", "success");
    } else {
      notification.notify("错误", battleStore.error.message || "重置战斗失败", "error");
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addDebugLog(`重置战斗时出错: ${errorMsg}`, { level: LogLevel.ERROR });
    battleLogManager.addSystemLog({
      message: `重置战斗时出错: ${errorMsg}`,
    });
    notification.notify("错误", errorMsg, "error");
  }
};



// 切换自动战斗状态
const toggleAutoPlay = async () => {
  try {
    const result = await battleStore.toggleAutoPlay();
    if (result) {
      notification.notify("成功", battleStore.autoPlayMode ? "已开始自动战斗" : "已停止自动战斗", "success");
    } else {
      notification.notify("错误", battleStore.error.message || "切换自动战斗状态失败", "error");
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addDebugLog(`切换自动战斗状态失败: ${errorMsg}`, { level: LogLevel.ERROR });
    battleLogManager.addSystemLog({
      message: `切换自动战斗状态失败: ${errorMsg}`,
    });
    notification.notify("错误", errorMsg, "error");
  }
};

// 处理战斗速度变化
const handleBattleSpeedChange = (speed: number) => {
  battleStore.setBattleSpeed(speed);
};

// 暂停 / 继续战斗
const togglePause = () => {
  battleStore.togglePause();
};

// 手动单回合：在手动模式（战斗已暂停）下推进一个回合
const manualTurn = async () => {
  await battleStore.processSingleTurn();
};

// 全部参战实体（含未启用占位，供调试动作遍历）
const getAllParticipants = () => [
  ...(battleService.getAllyTeam() ?? []),
  ...(battleService.getEnemyTeam() ?? []),
];

/** 按剩余生命比例判定当前优势方（调试"强制结束"的结算方） */
const getLeadingSide = () => {
  const all = getAllParticipants()
  const ratio = (list: typeof all) =>
    list.reduce((sum, p) => sum + p.currentHealth / Math.max(1, p.maxHealth), 0)
  const allyRatio = ratio(all.filter(p => p.team === ParticipantSide.ALLY && p.isAlive()))
  const enemyRatio = ratio(all.filter(p => p.team === ParticipantSide.ENEMY && p.isAlive()))
  return allyRatio >= enemyRatio ? ParticipantSide.ALLY : ParticipantSide.ENEMY
};

/** 将当前战斗录制持久化到 IndexedDB，供昊天镜「最新战斗录制」源调用 */
const saveRecording = async () => {
  const battleId = battleStore.currentBattleId;
  if (!battleId) {
    notification.notify("提示", "当前没有进行中的战斗", "warning");
    return;
  }
  try {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString());
    const saveKey = await battleSystem.saveBattleRecording(battleId);
    if (saveKey) {
      const savedName = battleSystem.getBattleRecording(battleId)?.name;
      battleLogManager.addSystemLog({ message: `战斗记录已保存: ${savedName ?? battleId}` });
      notification.notify(
        "成功",
        savedName ? `战斗记录已保存「${savedName}」，可在昊天镜回放` : "战斗记录已保存到本地，可在昊天镜回放",
        "success",
      );
    } else {
      notification.notify("错误", "保存失败：未找到该战斗的录制数据", "error");
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    notification.notify("错误", `保存失败: ${errorMsg}`, "error");
  }
};

// 选择角色
const selectCharacter = (characterId: string) => {
  battleStore.selectCharacter(characterId);
};

// NOTE: 顶部模块栏唤灵台专属操作（战斗规则/调试面板/角色编辑/场景管理/保存战斗记录）经此暴露给容器层 ModuleHeader actions slot
defineExpose({
  openRulesDialog: () => { showRulesDialog.value = true },
  openDebugDialog: () => { showDebugControlDialog.value = true },
  openStatusDialog: () => { showStatusDialog.value = true },
  openSceneDialog: () => { showSceneDialog.value = true },
  saveRecording,
})

onUnmounted(() => {
  battleStore.destroy();
});
</script>

<style scoped lang="scss">
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
