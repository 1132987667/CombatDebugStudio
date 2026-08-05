<!--
 * 文件: DebugControlDialog.vue
 * 创建日期: 2026-03-13
 * 作者: CombatDebugStudio
 * 功能: 调试控制面板弹窗
 * 描述: 提供各种调试按钮，按模块分类；右缘停靠，透明遮罩不拦截战斗操作
 * 版本: 1.0.0
 -->

<template>
  <Dialog :model-value="modelValue" title="调试控制面板" width="30vw" height="calc(100vh - 24px)"
    :show-mask="false" placement="right" @update:model-value="onUpdate">
    <div v-for="module in debugModules" :key="module.name" class="debug-module">
      <div class="module-header">
        <span v-if="module.icon" class="module-icon">{{ module.icon }}</span>
        <span class="module-name">{{ module.name }}</span>
      </div>
      <div class="module-buttons">
        <Button v-for="btn in module.buttons" :key="btn.label" :variant="btn.variant ?? 'secondary'"
          @click="handleButtonClick(btn.action)" :title="btn.description">
          {{ btn.label }}
        </Button>
      </div>
      <div v-if="module.name === '动画调试'" class="impact-style-selector">
        <span class="selector-label">爆炸样式</span>
        <TacticalSelect v-model="debugStore.impactStyle" size="md" class="impact-style-select"
          :options="impactStyleOptions" placeholder="选择爆炸样式" />
      </div>
      <!-- 数据生成模块控件 -->
      <div v-if="module.name === '数据生成'" class="log-gen-control">
        <div class="log-gen-row flex items-center gap-2">
          <span class="log-gen-label">模式:</span>
          <TacticalSelect v-model="genMode" size="md" class="log-gen-select" :options="modeOptions" />
        </div>
        <div class="log-gen-row flex items-center gap-2">
          <span class="log-gen-label">格式:</span>
          <div class="log-gen-options">
            <Button v-for="opt in formatOptions" :key="opt.value"
              size="small" :active="genFormat === opt.value"
              @click="genFormat = opt.value">{{ opt.label }}</Button>
          </div>
        </div>
        <div class="log-gen-row flex items-center gap-2">
          <span class="log-gen-label">场次:</span>
          <NumericStepper v-model="genCount" :min="1" :max="50" :steps="[1, 10, 50]" />
        </div>
        <Button variant="energy"
          :disabled="battleStore.generationProgress.isGenerating"
          @click="battleStore.generateBattleData(genMode as '1v1' | '2v2' | 'random', genFormat, genCount)">
          {{ battleStore.generationProgress.isGenerating
            ? `生成中 ${battleStore.generationProgress.percent}%`
            : `生成数据（${genCount}场）` }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDebugStore } from '@/presentation/stores/debugStore'
import { useBattleStore } from '@/presentation/stores/battleStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import NumericStepper from '@/presentation/components/NumericStepper.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const debugStore = useDebugStore()
const battleStore = useBattleStore()

// ==================== 战斗数据生成 ====================
// NOTE: 战术下拉 v-model 值为 string | number | null，故放宽为 string；调用处按已知选项断言
const genMode = ref<string>('random')
const genFormat = ref<'txt' | 'html' | 'record'>('txt')
const genCount = ref(50)
const modeOptions = [
  { value: '1v1' as const, label: '1v1' },
  { value: '2v2' as const, label: '2v2' },
  { value: 'random' as const, label: '随机' },
]
const formatOptions = [
  { value: 'txt' as const, label: 'TXT' },
  { value: 'html' as const, label: 'HTML' },
  { value: 'record' as const, label: '记录' },
]
const impactStyles = [
  { label: '爆炸', value: 'explosion', desc: '径向火球扩散+火花' },
  { label: '斩击', value: 'slash', desc: '干净利落的一刀弧光' },
  { label: '冰裂', value: 'iceshatter', desc: '菱形冰晶碎裂散射' },
  { label: '冲击波', value: 'shockwave', desc: '环形冲击波扩散' },
  { label: '暗影', value: 'shadow', desc: '紫黑能量爆发' },
]
/** desc 作为下拉选项的 hint（面板与触发器均显示，替代原按钮组 hover title） */
const impactStyleOptions: TSelectOption[] = impactStyles.map((s) => ({
  value: s.value,
  label: s.label,
  hint: s.desc,
}))

interface DebugButton {
  label: string
  action: string
  description?: string
  /** Button 组件样式族；缺省 secondary */
  variant?: 'primary' | 'energy' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost'
}

interface DebugModule {
  name: string
  /** 可选模块图标（禁 emoji，需用 SVG 时在此提供） */
  icon?: string
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

const debugModules: DebugModule[] = [
  {
    name: '战斗控制',
    buttons: [
      { label: '立即胜利', action: 'win_battle', description: '直接判定我方胜利', variant: 'success' },
      { label: '立即失败', action: 'lose_battle', description: '直接判定敌方胜利', variant: 'danger' },
      { label: '跳过回合', action: 'skip_turn', description: '跳过当前回合', variant: 'warning' },
      { label: '强制结束', action: 'end_battle', description: '强制结束当前战斗', variant: 'danger' }
    ]
  },
  {
    name: '角色状态',
    buttons: [
      { label: '满血', action: 'full_health', description: '恢复所有角色气血', variant: 'success' },
      { label: '满能量', action: 'full_energy', description: '恢复所有角色能量', variant: 'secondary' },
      { label: '杀死选中', action: 'kill_selected', description: '将选中角色血量设为0', variant: 'danger' },
      { label: '满技能CD', action: 'max_skill_cd', description: '设置所有技能冷却', variant: 'warning' }
    ]
  },
  {
    name: '战斗事件',
    buttons: [
      { label: '触发暴击', action: 'force_crit', description: '下次攻击必定暴击', variant: 'secondary' },
      { label: '触发闪避', action: 'force_dodge', description: '下次攻击必定闪避', variant: 'secondary' },
      { label: '触发格挡', action: 'force_block', description: '下次攻击必定格挡', variant: 'secondary' },
      { label: '添加Buff', action: 'add_buff', description: '给选中角色添加Buff', variant: 'secondary' }
    ]
  },
  {
    name: '系统调试',
    buttons: [
      { label: '输出日志', action: 'dump_logs', description: '输出当前日志到控制台', variant: 'secondary' },
      { label: '导出状态', action: 'export_state', description: '导出战斗状态', variant: 'secondary' },
      { label: '导入状态', action: 'import_state', description: '导入战斗状态', variant: 'secondary' },
      { label: '重置战斗', action: 'reset_battle', description: '重置战斗数据', variant: 'warning' },
      { label: 'Buff热重载', action: 'reload_buffs', description: '重新加载所有Buff脚本', variant: 'secondary' },
    ]
  },
  {
    name: '日志调试',
    buttons: [
      { label: '战斗日志', action: 'log_battle', description: '调用 addBattleLog', variant: 'secondary' },
      { label: '系统日志', action: 'log_system', description: '调用 addSystemLog', variant: 'secondary' },
      { label: '物品日志', action: 'log_item', description: '调用 addItemLog', variant: 'secondary' },
      { label: '行为日志', action: 'log_action', description: '调用 addActionLog', variant: 'secondary' },
      { label: '调试日志', action: 'log_debug', description: '调用 addDebugLog', variant: 'secondary' },
    ],
  },
  {
    name: '数据生成',
    buttons: [],
  },
  {
    name: '动画调试',
    buttons: [
      { label: '测试伤害数字', action: 'test_damage_num', description: '在选中角色上显示伤害飘字', variant: 'secondary' },
      { label: '测试暴击数字', action: 'test_crit_num', description: '在选中角色上显示暴击飘字', variant: 'warning' },
      { label: '测试治疗数字', action: 'test_heal_num', description: '在选中角色上显示治疗飘字', variant: 'success' },
      { label: '测试技能飞行', action: 'test_skill_fly', description: '从首个友方飞向首个敌方显示技能名', variant: 'secondary' },
      { label: '清除所有动画', action: 'clear_animations', description: '停止所有动画并重置视觉状态', variant: 'danger' },
      { label: '输出动画状态', action: 'dump_animation', description: '输出当前动画状态到控制台', variant: 'secondary' },
    ],
  }
]

const onUpdate = (value: boolean) => {
  emit('update:modelValue', value)
}

const handleButtonClick = (action: string) => {
  emit('action', action)
}
</script>

<style scoped>
.debug-module {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background: rgba(var(--rgb-white), var(--alpha-tint));
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
  color: rgba(var(--rgb-white), 0.9);
  font-weight: var(--font-weight-medium);
}

.module-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
}

/* 爆炸样式选择器 */
.impact-style-selector {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid rgba(var(--rgb-white), var(--alpha-tint));
}

.impact-style-select {
  flex: 1;
  min-width: 0;
}

.selector-label {
  color: rgba(var(--rgb-white), 0.6);
  flex-shrink: 0;
}

/* ====== 日志生成控件 ====== */
.log-gen-control {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}


.log-gen-label {
  color: rgba(var(--rgb-white), 0.6);
  font-size: var(--font-size-md);
  min-width: 40px;
  flex-shrink: 0;
}

.log-gen-select {
  flex: 1;
  min-width: 0;
}

/* 格式行仍为按钮组（3 项，保持按钮形态） */
.log-gen-options {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}
</style>
