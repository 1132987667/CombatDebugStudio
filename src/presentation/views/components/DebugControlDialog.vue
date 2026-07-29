<!--
 * 文件: DebugControlDialog.vue
 * 创建日期: 2026-03-13
 * 作者: CombatDebugStudio
 * 功能: 调试控制面板弹窗
 * 描述: 提供各种调试按钮，按模块分类
 * 版本: 1.0.0
-->

<template>
  <Teleport to="body">
    <Transition name="dialog-slide">
      <div v-if="modelValue" class="debug-control-overlay" @click.self="handleClose">
        <div class="debug-control-dialog" :style="dialogStyle">
          <div class="dialog-header">
            <span class="dialog-title">调试控制面板</span>
            <button class="dialog-close" @click="handleClose">&times;</button>
          </div>
          <div class="dialog-content">
            <div v-for="module in debugModules" :key="module.name" class="debug-module">
              <div class="module-header">
                <span class="module-icon">{{ module.icon }}</span>
                <span class="module-name">{{ module.name }}</span>
              </div>
              <div class="module-buttons">
                <button v-for="btn in module.buttons" :key="btn.label" class="debug-btn" :class="btn.class"
                  @click="handleButtonClick(btn.action)" :title="btn.description">
                  {{ btn.label }}
                </button>
              </div>
              <!-- ponytail: 动画调试模块增加爆炸样式选择器 -->
              <div v-if="module.name === '动画调试'" class="impact-style-selector">
                <span class="selector-label">爆炸样式:</span>
                <div class="style-options">
                  <button v-for="opt in impactStyles" :key="opt.value"
                    class="style-btn" :class="{ active: debugStore.impactStyle === opt.value }"
                    @click="debugStore.setImpactStyle(opt.value)" :title="opt.desc">
                    {{ opt.label }}
                  </button>
                </div>
              </div>
              <!-- 数据生成模块控件 -->
              <div v-if="module.name === '数据生成'" class="log-gen-control">
                <div class="log-gen-row">
                  <span class="log-gen-label">模式:</span>
                  <div class="log-gen-options">
                    <button v-for="opt in modeOptions" :key="opt.value"
                      class="log-gen-opt-btn" :class="{ active: genMode === opt.value }"
                      @click="genMode = opt.value">{{ opt.label }}</button>
                  </div>
                </div>
                <div class="log-gen-row">
                  <span class="log-gen-label">格式:</span>
                  <div class="log-gen-options">
                    <button v-for="opt in formatOptions" :key="opt.value"
                      class="log-gen-opt-btn" :class="{ active: genFormat === opt.value }"
                      @click="genFormat = opt.value">{{ opt.label }}</button>
                  </div>
                </div>
                <button class="log-gen-btn"
                  :disabled="battleStore.generationProgress.isGenerating"
                  @click="battleStore.generateBattleData(genMode, genFormat)">
                  {{ battleStore.generationProgress.isGenerating
                    ? `生成中 ${battleStore.generationProgress.percent}%`
                    : '生成数据（50场）' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDebugStore } from '@/presentation/stores/debugStore'
import { useBattleStore } from '@/presentation/stores/battleStore'

const debugStore = useDebugStore()
const battleStore = useBattleStore()

// ==================== 战斗数据生成 ====================
const genMode = ref<'1v1' | '2v2' | 'random'>('random')
const genFormat = ref<'txt' | 'html'>('txt')
const modeOptions = [
  { value: '1v1' as const, label: '1v1' },
  { value: '2v2' as const, label: '2v2' },
  { value: 'random' as const, label: '随机' },
]
const formatOptions = [
  { value: 'txt' as const, label: 'TXT' },
  { value: 'html' as const, label: 'HTML' },
]
const impactStyles = [
  { label: '爆炸', value: 'explosion', desc: '径向火球扩散+火花' },
  { label: '斩击', value: 'slash', desc: '干净利落的一刀弧光' },
  { label: '冰裂', value: 'iceshatter', desc: '菱形冰晶碎裂散射' },
  { label: '冲击波', value: 'shockwave', desc: '环形冲击波扩散' },
  { label: '暗影', value: 'shadow', desc: '紫黑能量爆发' },
]

interface DebugButton {
  label: string
  action: string
  description?: string
  class?: string
}

interface DebugModule {
  name: string
  icon: string
  buttons: DebugButton[]
}

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'action', action: string): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false
})

const emit = defineEmits<Emits>()

const dialogStyle = computed(() => ({
  top: '12px',
  bottom: '12px',
  right: '12px',
  width: '30vw'
}))

const debugModules: DebugModule[] = [
  {
    name: '战斗控制',
    icon: '⚔️',
    buttons: [
      { label: '立即胜利', action: 'win_battle', description: '直接判定我方胜利', class: 'btn-success' },
      { label: '立即失败', action: 'lose_battle', description: '直接判定敌方胜利', class: 'btn-danger' },
      { label: '跳过回合', action: 'skip_turn', description: '跳过当前回合', class: 'btn-warning' },
      { label: '强制结束', action: 'end_battle', description: '强制结束当前战斗', class: 'btn-danger' }
    ]
  },
  {
    name: '角色状态',
    icon: '👤',
    buttons: [
      { label: '满血', action: 'full_health', description: '恢复所有角色气血', class: 'btn-success' },
      { label: '满能量', action: 'full_energy', description: '恢复所有角色能量', class: 'btn-info' },
      { label: '杀死选中', action: 'kill_selected', description: '将选中角色血量设为0', class: 'btn-danger' },
      { label: '满技能CD', action: 'max_skill_cd', description: '设置所有技能冷却', class: 'btn-warning' }
    ]
  },
  {
    name: '战斗事件',
    icon: '🎯',
    buttons: [
      { label: '触发暴击', action: 'force_crit', description: '下次攻击必定暴击', class: 'btn-info' },
      { label: '触发闪避', action: 'force_dodge', description: '下次攻击必定闪避', class: 'btn-info' },
      { label: '触发格挡', action: 'force_block', description: '下次攻击必定格挡', class: 'btn-info' },
      { label: '添加Buff', action: 'add_buff', description: '给选中角色添加Buff', class: 'btn-info' }
    ]
  },
  {
    name: '系统调试',
    icon: '🔧',
    buttons: [
      { label: '输出日志', action: 'dump_logs', description: '输出当前日志到控制台', class: 'btn-default' },
      { label: '导出状态', action: 'export_state', description: '导出战斗状态', class: 'btn-default' },
      { label: '导入状态', action: 'import_state', description: '导入战斗状态', class: 'btn-default' },
      { label: '重置战斗', action: 'reset_battle', description: '重置战斗数据', class: 'btn-warning' },
      { label: 'Buff热重载', action: 'reload_buffs', description: '重新加载所有Buff脚本', class: 'btn-info' },
    ]
  },
  {
    name: '日志调试',
    icon: '📝',
    buttons: [
      { label: '战斗日志', action: 'log_battle', description: '调用 addBattleLog', class: 'btn-info' },
      { label: '系统日志', action: 'log_system', description: '调用 addSystemLog', class: 'btn-info' },
      { label: '物品日志', action: 'log_item', description: '调用 addItemLog', class: 'btn-info' },
      { label: '行为日志', action: 'log_action', description: '调用 addActionLog', class: 'btn-info' },
      { label: '调试日志', action: 'log_debug', description: '调用 addDebugLog', class: 'btn-info' },
    ],
  },
  {
    name: '数据生成',
    icon: '📊',
    buttons: [],
  },
  {
    name: '动画调试',
    icon: '🎬',
    buttons: [
      { label: '测试伤害数字', action: 'test_damage_num', description: '在选中角色上显示伤害飘字', class: 'btn-info' },
      { label: '测试暴击数字', action: 'test_crit_num', description: '在选中角色上显示暴击飘字', class: 'btn-warning' },
      { label: '测试治疗数字', action: 'test_heal_num', description: '在选中角色上显示治疗飘字', class: 'btn-success' },
      { label: '测试技能飞行', action: 'test_skill_fly', description: '从首个友方飞向首个敌方显示技能名', class: 'btn-info' },
      { label: '清除所有动画', action: 'clear_animations', description: '停止所有动画并重置视觉状态', class: 'btn-danger' },
      { label: '输出动画状态', action: 'dump_animation', description: '输出当前动画状态到控制台', class: 'btn-default' },
    ],
  }
]

const handleClose = () => {
  emit('update:modelValue', false)
}

const handleButtonClick = (action: string) => {
  emit('action', action)
}
</script>

<style scoped>
.debug-control-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
}

.debug-control-dialog {
  position: absolute;
  max-height: calc(100vh - 24px);
  background: var(--color-overlay-panel);
  border: 1px solid var(--border-debug-color);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}

.debug-module {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background: rgba(255, 255, 255, 0.03);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-hairline);
}

.debug-module:last-child {
  margin-bottom: 0;
}

.module-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border-hairline);
}

.module-icon {
  font-size: var(--font-size-md);
}

.module-name {
  color: rgba(255, 255, 255, 0.9);
  font-weight: var(--font-weight-medium);
}

.module-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
}

.debug-btn {
  padding: var(--space-2) var(--space-3);
  border: 1px solid rgba(var(--rgb-white), var(--alpha-wash-strong));
  border-radius: var(--radius-sm);
  background: rgba(var(--rgb-white), var(--alpha-tint));
  color: rgba(var(--rgb-white), 0.8);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.debug-btn:hover {
  background: rgba(var(--rgb-energy), var(--alpha-wash-strong));
  border-color: var(--border-debug-color-light);
  color: var(--color-text-primary);
}

.debug-btn.btn-success {
  border-color: rgba(var(--rgb-success), var(--alpha-glow));
  color: var(--color-success);
}

.debug-btn.btn-success:hover {
  background: rgba(var(--rgb-success), var(--alpha-wash-strong));
  border-color: var(--color-success);
}

.debug-btn.btn-danger {
  border-color: rgba(var(--rgb-danger), var(--alpha-glow));
  color: var(--color-danger);
}

.debug-btn.btn-danger:hover {
  background: rgba(var(--rgb-danger), var(--alpha-wash-strong));
  border-color: var(--color-danger);
}

.debug-btn.btn-warning {
  border-color: rgba(var(--rgb-warning), var(--alpha-glow));
  color: var(--color-warning);
}

.debug-btn.btn-warning:hover {
  background: rgba(var(--rgb-warning), var(--alpha-wash-strong));
  border-color: var(--color-warning);
}

.debug-btn.btn-info {
  border-color: rgba(var(--rgb-info), var(--alpha-glow));
  color: var(--color-info);
}

.debug-btn.btn-info:hover {
  background: rgba(var(--rgb-info), var(--alpha-wash-strong));
  border-color: var(--color-info);
}

.debug-btn.btn-default {
  border-color: rgba(var(--rgb-white), var(--alpha-border));
}

.dialog-slide-enter-active,
.dialog-slide-leave-active {
  transition: opacity var(--transition-fast) ease;
}

.dialog-slide-enter-from,
.dialog-slide-leave-to {
  opacity: 0;
}

.dialog-slide-enter-active .debug-control-dialog {
  animation: slideIn 0.2s ease;
}

.dialog-slide-leave-active .debug-control-dialog {
  animation: slideOut 0.2s ease;
}

/* 爆炸样式选择器 */
.impact-style-selector {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.selector-label {
  display: block;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: var(--space-1);
}

.style-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.style-btn {
  padding: var(--space-1) var(--space-2);
  border: 1px solid rgba(var(--rgb-white), var(--alpha-wash-strong));
  border-radius: var(--radius-sm);
  background: rgba(var(--rgb-white), var(--alpha-tint));
  color: rgba(var(--rgb-white), 0.7);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.style-btn:hover {
  background: var(--border-debug-color-dark);
  border-color: rgba(var(--rgb-energy), 0.4);
  color: var(--color-text-primary);
}

.style-btn.active {
  background: rgba(var(--rgb-energy), var(--alpha-border));
  border-color: var(--color-energy);
  color: var(--color-energy);
}

/* ====== 日志生成控件 ====== */
.log-gen-control {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.log-gen-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.log-gen-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-md);
  min-width: 40px;
  flex-shrink: 0;
}

.log-gen-options {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.log-gen-opt-btn {
  padding: 2px 10px;
  border: 1px solid rgba(var(--rgb-white), var(--alpha-wash-strong));
  border-radius: var(--radius-sm);
  background: rgba(var(--rgb-white), var(--alpha-tint));
  color: rgba(var(--rgb-white), 0.7);
  font-size: var(--font-size-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.log-gen-opt-btn:hover {
  background: var(--border-debug-color-dark);
  border-color: rgba(var(--rgb-energy), 0.4);
  color: var(--color-text-primary);
}

.log-gen-opt-btn.active {
  background: rgba(var(--rgb-energy), var(--alpha-border));
  border-color: var(--color-energy);
  color: var(--color-energy);
}

.log-gen-btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-energy);
  border-radius: var(--radius-sm);
  background: var(--border-debug-color-dark);
  color: var(--color-energy);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-weight: var(--font-weight-medium);
  align-self: flex-start;
}

.log-gen-btn:hover {
  background: var(--border-debug-color);
  box-shadow: 0 0 8px var(--border-debug-color);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
