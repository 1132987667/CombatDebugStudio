<template>
  <div class="debug-panel panel-right">
    <div class="section f1">
      <div class="section-header">
        <span>属性监控</span>
        <span class="selected-info">(当前选中: {{ selectedCharName }})</span>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">基础属性</div>
        <div class="monitor-grid">
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '最大生命值', ATTRIBUTE_CODE.maxHealth, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">气血:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.currentHealth)?.value || 0
            }}/{{
                currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxHealth)?.value || 0 }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '能量', ATTRIBUTE_CODE.currentEnergy, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">能量:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.currentEnergy)?.value || 0
            }}/{{
                currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxEnergy)?.value || 200 }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttackTooltip($event)" @mousemove="updateTooltipPosition"
            @mouseleave="hideAttrTooltip">
            <span class="monitor-label">攻击:</span>
            <span class="monitor-value">{{ attackRange.min }}-{{ attackRange.max }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '防御力', ATTRIBUTE_CODE.defense, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">防御:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defense)?.value || 0
            }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '速度', ATTRIBUTE_CODE.speed, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">速度:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speed)?.value || 0
            }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '暴击率', ATTRIBUTE_CODE.critRate, '百分比', 10)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">暴击率:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critRate)?.value || 10
            }}%</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '暴击伤害', ATTRIBUTE_CODE.critDamage, '百分比', 125)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">暴击伤害:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critDamage)?.value || 125
            }}%</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '免伤率', ATTRIBUTE_CODE.damageReduction, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">免伤率:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.damageReduction)?.value ||
              0 }}%</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '命中率', ATTRIBUTE_CODE.hit, '百分比', 100)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">命中率:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.hit)?.value || 100
            }}%</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '闪避率', ATTRIBUTE_CODE.dodge, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">闪避率:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.dodge)?.value || 0
            }}%</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">属性加成</div>
        <div class="monitor-grid">
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '生命值加成', ATTRIBUTE_CODE.healthBonus, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">气血加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.healthBonus)?.value ||
                0) }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '攻击力加成', ATTRIBUTE_CODE.attackBonus, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">攻击加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.attackBonus)?.value ||
                0) }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '防御力加成', ATTRIBUTE_CODE.defenseBonus, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">防御加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defenseBonus)?.value ||
                0) }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltipSimple($event, '速度加成', ATTRIBUTE_CODE.speedBonus, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">速度加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speedBonus)?.value ||
                0) }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">技能信息</div>
        <div class="skills-display">
          <div v-if="!currentCharacter?.skills" class="no-skills">
            暂未配置技能
          </div>
          <div v-else class="skills-list">
            <div class="skill-category"
              v-if="currentCharacter.skills.passive && currentCharacter.skills.passive.length > 0">
              <div class="skill-category-title">被动技能</div>
              <div class="skill-items">
                <div class="skill-item passive" v-for="(skill, index) in currentCharacter.skills.passive" :key="index"
                  @mouseenter="showSkillTooltip($event, skill)" @mousemove="updateTooltipPosition"
                  @mouseleave="hideSkillTooltip">
                  {{ skill.name || '未知技能' }}
                </div>
              </div>
            </div>
            <div class="skill-category"
              v-if="currentCharacter.skills.small && currentCharacter.skills.small.length > 0">
              <div class="skill-category-title">小技能</div>
              <div class="skill-items">
                <div class="skill-item small" v-for="(skill, index) in currentCharacter.skills.small" :key="index"
                  @mouseenter="showSkillTooltip($event, skill)" @mousemove="updateTooltipPosition"
                  @mouseleave="hideSkillTooltip">
                  {{ skill.name || '未知技能' }}
                </div>
              </div>
            </div>
            <div class="skill-category"
              v-if="currentCharacter.skills.ultimate && currentCharacter.skills.ultimate.length > 0">
              <div class="skill-category-title">终极技能</div>
              <div class="skill-items">
                <div class="skill-item ultimate" v-for="(skill, index) in currentCharacter.skills.ultimate" :key="index"
                  @mouseenter="showSkillTooltip($event, skill)" @mousemove="updateTooltipPosition"
                  @mouseleave="hideSkillTooltip">
                  {{ skill.name || '未知技能' }}
                </div>
              </div>
            </div>
            <div
              v-if="(!currentCharacter.skills.passive || currentCharacter.skills.passive.length === 0) && (!currentCharacter.skills.small || currentCharacter.skills.small.length === 0) && (!currentCharacter.skills.ultimate || currentCharacter.skills.ultimate.length === 0)"
              class="no-skills">
              暂未配置技能
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 技能悬浮提示 -->
    <div v-if="tooltipVisible && tooltipContent" class="skill-tooltip" :style="{
      left: tooltipPosition.x + 'px',
      top: tooltipPosition.y + 'px'
    }">
      <div class="tooltip-header">
        <div class="tooltip-name">{{ tooltipContent.name || '未知技能' }}</div>
        <div class="tooltip-type" :class="getSkillTypeClass(tooltipContent)">
          {{ getSkillTypeName(tooltipContent) }}
        </div>
      </div>
      <div class="tooltip-description">
        {{ tooltipContent.description || '无描述' }}
      </div>

      <!-- 技能基础信息 -->
      <div class="tooltip-stats">
        <div class="stat-item">
          <div class="stat-label">能量消耗</div>
          <div class="stat-value">{{ tooltipContent.energyCost || 0 }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">冷却时间</div>
          <div class="stat-value">{{ tooltipContent.cooldown || 0 }}回合</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">目标</div>
          <div class="stat-value">{{ formatTargetConfig(tooltipContent.selector) }}</div>
        </div>
      </div>

      <!-- 技能效果 -->
      <div v-if="tooltipContent.steps && tooltipContent.steps.length > 0" class="tooltip-effects">
        <div class="effects-title">技能效果</div>
        <div class="effect-item" v-for="(step, idx) in tooltipContent.steps" :key="idx">
          <span class="effect-type">{{ getStepTypeName(step.type) }}</span>
          <span class="effect-formula">{{ formatCalculation(step) }}</span>
          <span class="effect-duration" v-if="step.duration">{{ step.duration }}回合</span>
        </div>
      </div>

      <!-- 施放条件 -->
      <div v-if="tooltipContent.condition" class="tooltip-condition">
        <span class="condition-label">施放条件:</span>
        <span class="condition-value">{{ tooltipContent.condition }}</span>
      </div>

      <!-- 技能可用性 -->
      <div class="tooltip-availability"
        :class="{ 'available': isSkillAvailable(tooltipContent), 'unavailable': !isSkillAvailable(tooltipContent) }">
        {{ isSkillAvailable(tooltipContent) ? '当前可用' : '当前不可用' }}
      </div>
    </div>

    <AttributeTooltip :visible="attrTooltipVisible" :title="attrTooltipData.title"
      :modifiers="attrTooltipData.modifiers" :final-value="attrTooltipData.finalValue"
      :value-type="attrTooltipData.valueType" :trigger-rect="attrTooltipData.triggerRect"
      :display-text="attrTooltipData.displayText" :range-layers="attrTooltipData.rangeLayers" />

    <!-- 战斗回放 -->
    <BattleReplay @replay-event="handleReplayEvent" @replay-start="handleReplayStart" @replay-end="handleReplayEnd"
      @replay-pause="handleReplayPause" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { container } from '@/infrastructure/di/Container';
import AttributeTooltip, { type RangeLayerData, type RangeModifierRow } from "@/presentation/components/AttributeTooltip.vue";
import { ATTRIBUTE_CODE, type Modifier, AttributeValueType } from "@/domain/attribute/types";
import type { SkillConfig } from "@/domain/skill/types";
import { formatTargetConfig } from "@/domain/skill/types";
import { getStepTypeDisplayName } from "@/domain/skill/constants";
import { formatBonusValue } from '@/shared/utils/format'
import type { BattleService } from '@/application/facade/BattleFacade';
import { SkillType } from '@/domain/skill/types';
import { BattleEventType } from '@/domain/battle/types';
import BattleReplay from "@/presentation/views/BattleReplay.vue";
import { useBattleStore } from '@/presentation/stores';
const battleStore = useBattleStore();

// 获取 BattleService
const battleService = container.resolve<BattleService>('BattleService');
const props = defineProps<{
  battleSystem?: any;
}>();

// 响应式获取选中角色数据 — ponytail: 依赖 battleStore.selectedCharacterId 触发 Vue 响应式更新
const currentCharacter = computed(() => {
  const id = battleStore.selectedCharacterId;
  if (!id) return null;
  // 先找战斗中的参战角色，若未加入队伍则回退到角色库预览实体
  return battleService.getSelectedCharacter() || battleStore.previewEntity;
});
const selectedCharName = computed(() => currentCharacter.value?.name || "未选择");

// 计算攻击范围
const attackRange = computed(() => {
  const char = currentCharacter.value;
  if (!char) return { min: 0, max: 0 };

  const minAttack = typeof char.minAttack === 'object' ? char.minAttack.value : char.minAttack || 0;
  const maxAttack = typeof char.maxAttack === 'object' ? char.maxAttack.value : char.maxAttack || 0;

  return { min: minAttack, max: maxAttack };
});

// 手动干预表单数据
const manualSkillName = ref("");
const manualStatusName = ref("");
const manualStatusTurns = ref(2);
const manualHpAmount = ref(100);
const manualMpAmount = ref(50);

// ------------------------------------------------------------
// 技能悬浮提示状态
const tooltipVisible = ref(false);
const tooltipContent = ref<SkillConfig | null>(null);
const tooltipPosition = ref({ x: 0, y: 0 });

/**
 * 更新悬浮提示位置
 * @param event - 鼠标事件
 */
const updateTooltipPosition = (event: MouseEvent) => {
  const x = event.clientX + 15;
  const y = event.clientY + 15;

  const tooltipWidth = 320;
  const tooltipHeight = 200;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  tooltipPosition.value = {
    x: x + tooltipWidth > windowWidth ? windowWidth - tooltipWidth - 15 : x,
    y: y + tooltipHeight > windowHeight ? windowHeight - tooltipHeight - 15 : y,
  };
};

/**
 * 显示技能悬浮提示
 * @param event - 鼠标事件
 * @param skill - 技能配置
 */
const showSkillTooltip = (event: MouseEvent, skill: SkillConfig) => {
  updateTooltipPosition(event);
  tooltipContent.value = skill;
  tooltipVisible.value = true;
};

/**
 * 隐藏技能悬浮提示
 */
const hideSkillTooltip = () => {
  tooltipVisible.value = false;
  tooltipContent.value = null;
};

/**
 * 获取技能类型对应的CSS类名
 * @param skill - 技能配置
 * @returns CSS类名
 */
const getSkillTypeClass = (skill: SkillConfig): string => {
  if (skill.skillType === SkillType.PASSIVE) return 'passive';
  if (skill.skillType === SkillType.ULTIMATE) return 'ultimate';
  return 'active';
};

/**
 * 获取技能类型的中文名称
 * @param skill - 技能配置
 * @returns 技能类型中文名称
 */
const getSkillTypeName = (skill: SkillConfig): string => {
  if (skill.skillType === 'passive') return '被动';
  if (skill.skillType === 'ultimate') return '终极';
  return '主动';
};

const getStepTypeName = (stepType?: string): string => {
  return getStepTypeDisplayName(stepType);
};

const formatCalculation = (step: any): string => {
  if (!step.calculation) return ''
  const parts: string[] = []
  if (step.calculation.baseValue) parts.push(String(step.calculation.baseValue))
  if (step.calculation.extraValues) {
    for (const ev of step.calculation.extraValues) {
      parts.push(`${ev.attribute}×${ev.ratio}`)
    }
  }
  return parts.join(' + ') || ''
};

/**
 * 检查技能是否可用
 * @param skill - 技能配置
 * @returns 是否可用
 */
const isSkillAvailable = (skill: SkillConfig): boolean => {
  // 简单检查：能量消耗是否为0或角色有足够能量
  // 实际项目中需要检查角色当前能量和技能冷却
  const currentEnergy = currentCharacter.value?.currentEnergy;
  const energyValue = typeof currentEnergy === 'object' ? currentEnergy.value : (currentEnergy || 0);
  return (skill.energyCost || 0) === 0 || energyValue >= (skill.energyCost || 0);
};

// 属性悬浮提示状态
const attrTooltipVisible = ref(false)

/** 延迟隐藏定时器：鼠标移开后等待 300ms 再隐藏，避免快速划过时闪烁 */
let attrTooltipHideTimer: ReturnType<typeof setTimeout> | null = null

/** Alt 键按下时锁定 tooltip 不隐藏 */
const altKeyHeld = ref(false)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Alt') altKeyHeld.value = true
}
const handleKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'Alt') {
    altKeyHeld.value = false
    // ponytail: Alt 释放时取消待执行的延迟隐藏并强制隐藏
    if (attrTooltipHideTimer) { clearTimeout(attrTooltipHideTimer); attrTooltipHideTimer = null }
    attrTooltipVisible.value = false
  }
}

const attrTooltipData = ref<{
  title: string
  modifiers: Modifier[]
  finalValue: number
  valueType: AttributeValueType
  triggerRect: DOMRect | null
  displayText?: string
  rangeLayers?: RangeLayerData[]
}>({
  title: '',
  modifiers: [],
  finalValue: 0,
  valueType: AttributeValueType.VALUE,
  triggerRect: null
})

const showAttrTooltip = (event: MouseEvent, title: string, modifiers: Modifier[], finalValue: number, valueType: AttributeValueType, displayText?: string, rangeLayers?: RangeLayerData[]) => {
  // ponytail: 鼠标进入新属性时取消待执行的延迟隐藏，避免闪烁
  if (attrTooltipHideTimer) { clearTimeout(attrTooltipHideTimer); attrTooltipHideTimer = null }
  attrTooltipData.value = {
    title,
    modifiers,
    finalValue,
    valueType,
    triggerRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
    displayText,
    rangeLayers
  }
  attrTooltipVisible.value = true
}

/** ponytail: 简化版 — 接收属性枚举 code 自动取值，模板调用不再写一长串 */
const showAttrTooltipSimple = (event: MouseEvent, title: string, code: ATTRIBUTE_CODE, valueType: AttributeValueType, defaultValue: number = 0) => {
  const attr = currentCharacter.value?.getAttributeValue(code)
  showAttrTooltip(event, title, attr?.modifiers || [], attr?.value ?? defaultValue, valueType)
}

/**
 * 将修饰符列表按类型分组，同 source 的合并为 min/max 区间行
 */
const buildRangeLayer = (
  title: string,
  minMods: Modifier[],
  maxMods: Modifier[],
  modType: string,
): RangeLayerData => {
  // 按 sourceKey 聚合 min 和 max 的修饰符值
  const sourceMap = new Map<string, { label: string; minVal: number; maxVal: number }>()

  for (const m of minMods) {
    if (m.type !== modType) continue
    const key = m.sourceKey || m.description || 'unknown'
    const entry = sourceMap.get(key) || { label: m.description || key, minVal: 0, maxVal: 0 }
    entry.minVal += m.value
    sourceMap.set(key, entry)
  }
  for (const m of maxMods) {
    if (m.type !== modType) continue
    const key = m.sourceKey || m.description || 'unknown'
    const entry = sourceMap.get(key) || { label: m.description || key, minVal: 0, maxVal: 0 }
    entry.maxVal += m.value
    sourceMap.set(key, entry)
  }

  const rows: RangeModifierRow[] = []
  let minTotal = 0
  let maxTotal = 0

  for (const [, entry] of sourceMap) {
    // 标注仅作用单边的修饰符
    let label = entry.label
    if (entry.minVal !== 0 && entry.maxVal === 0) {
      label += '(最小攻击力)'
      rows.push({ label, minValue: entry.minVal, maxValue: null, isPercent: modType === 'PERCENTAGE' })
      minTotal += entry.minVal
      continue
    } else if (entry.maxVal !== 0 && entry.minVal === 0) {
      label += '(最大攻击力)'
      rows.push({ label, minValue: null, maxValue: entry.maxVal, isPercent: modType === 'PERCENTAGE' })
      maxTotal += entry.maxVal
      continue
    } else if (entry.minVal !== entry.maxVal) {
      // 两边值不同：分别标注
      rows.push({ label: entry.label + '(最小攻击力)', minValue: entry.minVal, maxValue: null, isPercent: modType === 'PERCENTAGE' })
      rows.push({ label: entry.label + '(最大攻击力)', minValue: null, maxValue: entry.maxVal, isPercent: modType === 'PERCENTAGE' })
      minTotal += entry.minVal
      maxTotal += entry.maxVal
      continue
    }
    rows.push({ label, minValue: entry.minVal, maxValue: entry.maxVal, isPercent: modType === 'PERCENTAGE' })
    minTotal += entry.minVal
    maxTotal += entry.maxVal
  }

  return { title, minTotal, maxTotal, rows }
}

/**
 * 攻击力 tooltip：按四层架构组织 min/max 修饰符，显示区间
 */
const showAttackTooltip = (event: MouseEvent) => {
  const char = currentCharacter.value
  if (!char) return

  const minAttr = char.getAttributeValue(ATTRIBUTE_CODE.minAttack)
  const maxAttr = char.getAttributeValue(ATTRIBUTE_CODE.maxAttack)
  if (!minAttr || !maxAttr) return

  const minMods = minAttr.modifiers
  const maxMods = maxAttr.modifiers

  const layers: RangeLayerData[] = [
    buildRangeLayer('基础数值', minMods, maxMods, 'ADDITIVE'),
    buildRangeLayer('属性加成', minMods, maxMods, 'PERCENTAGE'),
    buildRangeLayer('独立乘区', minMods, maxMods, 'MULTIPLICATIVE'),
    buildRangeLayer('最终乘区', minMods, maxMods, 'FINAL'),
  ]

  showAttrTooltip(
    event, '攻击力', [],
    attackRange.value.min, '数值',
    `${attackRange.value.min}-${attackRange.value.max}`,
    layers,
  )
}

const hideAttrTooltip = () => {
  if (altKeyHeld.value) return
  // ponytail: 延迟 300ms 隐藏，避免鼠标快速划过属性项时闪烁
  attrTooltipHideTimer = setTimeout(() => {
    attrTooltipVisible.value = false
    attrTooltipHideTimer = null
  }, 300)
}


// ------------------------------------------------------------
// 辅助函数（纯展示逻辑，无需缓存）

// 手动干预方法
const endTurn = () => {
  if (props.battleSystem) {
    try {
      props.battleSystem.endTurn();
    } catch (error) {
      console.warn('结束回合失败:', error);
    }
  }
};

const executeSkill = (skillName: string) => {
  if (props.battleSystem && currentCharacter.value) {
    try {
      props.battleSystem.executeSkill(currentCharacter.value.id, skillName);
    } catch (error) {
      console.warn('执行技能失败:', error);
    }
  }
};

interface StatusData {
  name: string;
  turns: number;
}

const addStatus = (status: StatusData) => {
  if (props.battleSystem && currentCharacter.value) {
    try {
      props.battleSystem.addStatus(currentCharacter.value.id, status.name, status.turns);
    } catch (error) {
      console.warn('添加状态失败:', error);
    }
  }
};

interface StatsData {
  hp: number;
  mp: number;
}

const adjustStats = (stats: StatsData) => {
  if (props.battleSystem && currentCharacter.value) {
    try {
      props.battleSystem.adjustStats(currentCharacter.value.id, stats.hp, stats.mp);
    } catch (error) {
      console.warn('调整属性失败:', error);
    }
  }
};

const clearStatuses = () => {
  if (props.battleSystem && currentCharacter.value) {
    try {
      props.battleSystem.clearStatuses(currentCharacter.value.id);
    } catch (error) {
      console.warn('清除状态失败:', error);
    }
  }
};

// Alt 键监听：按住时属性 tooltip 不隐藏
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  if (attrTooltipHideTimer) { clearTimeout(attrTooltipHideTimer); attrTooltipHideTimer = null }
})

// ------------------------------------------------------------
// 战斗回放相关方法

const handleReplayEvent = (event: any, index: number) => {
  console.log('回放事件:', event, '索引:', index);

  // 根据事件类型处理不同的回放逻辑
  switch (event.type) {
    case BattleEventType.ACTION:
      handleActionReplay(event.data.action);
      break;
    case BattleEventType.TURN_START:
      handleTurnStartReplay(event.data.turn, event.data.participantId);
      break;
    case BattleEventType.TURN_END:
      handleTurnEndReplay(event.data.turn);
      break;
    case BattleEventType.BATTLE_START:
      handleBattleStartReplay();
      break;
    case BattleEventType.BATTLE_END:
      handleBattleEndReplay(event.data.winner);
      break;
  }
};

const handleReplayStart = (recording: any) => {
  console.log('开始回放:', recording);
  battleStore.resetBattle();
  if (battleStore.battleService) {
    battleStore.battleService.startReplay(recording);
  }
};

const handleReplayEnd = (recording: any) => {
  console.log('回放结束:', recording);
  if (battleStore.battleService) {
    battleStore.battleService.stopReplay();
  }
};

const handleReplayPause = (recording: any, index: number) => {
  console.log('回放暂停:', recording, '当前索引:', index);
  if (battleStore.battleService) {
    battleStore.battleService.pauseReplay();
  }
};

// 具体的回放处理方法
const handleActionReplay = (action: any) => {
  console.log('回放动作:', action);
};

const handleTurnStartReplay = (turn: number, participantId: string) => {
  console.log('回放回合开始:', turn, '行动者:', participantId);
};

const handleTurnEndReplay = (turn: number) => {
  console.log('回放回合结束:', turn);
};

const handleBattleStartReplay = () => {
  console.log('回放战斗开始');
};

const handleBattleEndReplay = (winner: string) => {
  console.log('回放战斗结束:', winner);
};
</script>

<style scoped>
@use "@/presentation/styles/main.scss";

.skill-item {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.85);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
  cursor: pointer;
}

.skill-item:hover {
  /* ponytail: uses --color-energy (#22d3ee) with opacity; no token for 10% bg */
  background: rgba(34, 211, 238, 0.1);
  /* ponytail: glow uses --color-energy with opacity */
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
}

.skill-item.passive:hover {
  border-left: 2px solid var(--color-energy);
}

.skill-item.small:hover {
  border-left: 2px solid var(--color-info);
}

.skill-item.ultimate:hover {
  border-left: 2px solid var(--color-warning);
}

/* 技能信息显示样式 */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skill-category {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.skill-category-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-info);
  margin-bottom: var(--space-1);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-items {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-left: var(--space-2);
}

.no-skills {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  padding: var(--space-2);
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-sm);
}
</style>

<style>
/**
 * 技能悬浮提示样式（全局样式，用于Teleport渲染的内容）
 */
.skill-tooltip {
  position: fixed;
  z-index: 10000;
  min-width: 280px;
  max-width: 360px;
  padding: var(--space-3) var(--space-4);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(96, 165, 250, 0.2);
  backdrop-filter: blur(12px);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-md);
  color: rgba(255, 255, 255, 0.85);
  pointer-events: none;
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid rgba(96, 165, 250, 0.3);
}

.tooltip-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-energy);
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
}

.tooltip-type {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tooltip-type.active {
  background: rgba(96, 165, 250, 0.2);
  color: var(--color-info);
}

.tooltip-type.passive {
  background: rgba(34, 211, 238, 0.2);
  color: var(--color-energy);
}

.tooltip-type.ultimate {
  background: rgba(249, 115, 22, 0.2);
  color: var(--color-warning);
}

.tooltip-description {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: var(--space-3);
  line-height: var(--line-height-lg);
}

.tooltip-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.tooltip-stats .stat-item {
  display: flex;
  flex-direction: column;
  padding: var(--space-1) var(--space-2);
  background: rgba(96, 165, 250, 0.1);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(96, 165, 250, 0.2);
}

.tooltip-stats .stat-label {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tooltip-stats .stat-value {
  font-size: var(--font-size-sm);
  color: var(--color-energy);
  font-weight: var(--font-weight-medium);
}

.tooltip-effects {
  margin-bottom: var(--space-3);
}

.effects-title {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid rgba(96, 165, 250, 0.2);
}

.effect-item {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-1) 0;
  font-size: var(--font-size-sm);
}

.effect-type {
  padding: var(--space-1) var(--space-1);
  background: rgba(34, 211, 238, 0.15);
  border-radius: var(--radius-sm);
  color: var(--color-energy);
  font-weight: var(--font-weight-medium);
}

.effect-formula {
  color: rgba(255, 255, 255, 0.7);
  font-family: 'JetBrains Mono', monospace;
}

.effect-scope {
  color: rgba(96, 165, 250, 0.8);
}

.effect-duration {
  color: rgba(249, 115, 22, 0.8);
}

.tooltip-condition {
  padding: var(--space-2);
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.condition-label {
  color: var(--color-warning);
  margin-right: 6px;
}

.condition-value {
  color: rgba(255, 255, 255, 0.7);
  font-family: 'JetBrains Mono', monospace;
}

/* 技能可用性状态 */
.tooltip-availability {
  margin-top: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  text-align: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.tooltip-availability.available {
  background: rgba(34, 211, 238, 0.15);
  color: var(--color-energy);
  border: 1px solid rgba(34, 211, 238, 0.3);
}

.tooltip-availability.unavailable {
  background: rgba(249, 115, 22, 0.15);
  color: var(--color-warning);
  border: 1px solid rgba(249, 115, 22, 0.3);
}

/* 悬浮提示过渡动画 */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.tooltip-fade-enter-to,
.tooltip-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

</style>