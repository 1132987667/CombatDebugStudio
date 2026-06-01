<template>
  <div class="debug-panel panel-right">
    <div class="section">
      <div class="section-header">
        <span>属性监控</span>
        <span class="selected-info">(当前选中: {{ selectedCharName }})</span>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">基础属性</div>
        <div class="monitor-grid">
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '最大生命值', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxHealth)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxHealth)?.value || 0, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">气血:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.currentHealth)?.value || 0
            }}/{{
                currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxHealth)?.value || 0 }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '能量', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.energy)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.energy)?.value || 0, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">能量:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.energy)?.value || 0 }}/{{
              currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxEnergy)?.value || 150 }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '攻击力', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.attack)?.modifiers || [], attackRange.min, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">攻击:</span>
            <span class="monitor-value">{{ attackRange.min }}-{{ attackRange.max }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '防御力', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defense)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defense)?.value || 0, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">防御:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defense)?.value || 0
            }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '速度', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speed)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speed)?.value || 0, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">速度:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speed)?.value || 0
            }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '暴击率', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critRate)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critRate)?.value || 10, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">暴击率:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critRate)?.value || 10
            }}%</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '暴击伤害', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critDamage)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critDamage)?.value || 125, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">暴击伤害:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.critDamage)?.value || 125
            }}%</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '免伤率', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.damageReduction)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.damageReduction)?.value || 0, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">免伤率:</span>
            <span class="monitor-value">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.damageReduction)?.value ||
              0 }}%</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">属性加成</div>
        <div class="monitor-grid">
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '生命值加成', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.healthBonus)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.healthBonus)?.value || 0, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">气血加成:</span>
            <span class="monitor-value bonus">{{
              formatBonus(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.healthBonus)?.value ||
                0) }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '攻击力加成', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.attackBonus)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.attackBonus)?.value || 0, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">攻击加成:</span>
            <span class="monitor-value bonus">{{
              formatBonus(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.attackBonus)?.value ||
                0) }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '防御力加成', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defenseBonus)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defenseBonus)?.value || 0, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">防御加成:</span>
            <span class="monitor-value bonus">{{
              formatBonus(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defenseBonus)?.value ||
                0) }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '速度加成', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speedBonus)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speedBonus)?.value || 0, '百分比')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">速度加成:</span>
            <span class="monitor-value bonus">{{
              formatBonus(currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speedBonus)?.value ||
                0) }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">最终属性</div>
        <div class="monitor-grid">
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '攻击力', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.attack)?.modifiers || [], attackRange.min, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">最终攻击:</span>
            <span class="monitor-value final">{{ attackRange.min }}-{{ attackRange.max }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '防御力', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defense)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defense)?.value || 0, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">最终防御:</span>
            <span class="monitor-value final">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.defense)?.value || 0
              }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '速度', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speed)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speed)?.value || 0, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">最终速度:</span>
            <span class="monitor-value final">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.speed)?.value || 0
              }}</span>
          </div>
          <div class="monitor-item"
            @mouseenter="showAttrTooltip($event, '最大生命值', currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxHealth)?.modifiers || [], currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxHealth)?.value || 0, '数值')"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">最终气血:</span>
            <span class="monitor-value final">{{ currentCharacter?.getAttributeValue(ATTRIBUTE_CODE.maxHealth)?.value ||
              0 }}</span>
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
          <div class="stat-label">目标类型</div>
          <div class="stat-value">{{ getTargetTypeName(tooltipContent.targetType) }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">作用范围</div>
          <div class="stat-value">{{ getScopeName(tooltipContent.scope) }}</div>
        </div>
      </div>

      <!-- 技能效果 -->
      <div v-if="tooltipContent.steps && tooltipContent.steps.length > 0" class="tooltip-effects">
        <div class="effects-title">技能效果</div>
        <div class="effect-item" v-for="(step, idx) in tooltipContent.steps" :key="idx">
          <span class="effect-type">{{ getStepTypeName(step.type) }}</span>
          <span class="effect-formula">{{ step.formula || '' }}</span>
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

    <div class="section">
      <div class="section-header">手动干预</div>
      <div class="intervention-list">
        <button class="intervention-btn" @click="resetBattle">[R] 重置战斗</button>
      </div>
    </div>

    <div class="section">
      <div class="section-header">数据快照</div>
      <div class="snapshot-actions">
        <button class="intervention-btn" @click="exportState">[E] 导出当前状态(JSON)</button>
        <button class="intervention-btn" @click="importState">[I] 导入状态数据</button>
      </div>
      <div class="last-export">
        <span>最近导出: {{ debugStore.lastExportTime || '无' }}</span>
        <div class="snapshot-btns">
          <button class="btn-small" @click="viewExport">[查看]</button>
          <button class="btn-small" @click="reloadExport">[重载]</button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">异常检测</div>
      <div class="exception-status" :class="'normal'">
        <span>系统正常运行中</span>
      </div>
    </div>

    <!-- 属性悬浮提示 -->
    <AttributeTooltip :visible="attrTooltipVisible" :title="attrTooltipData.title"
      :modifiers="attrTooltipData.modifiers" :final-value="attrTooltipData.finalValue"
      :value-type="attrTooltipData.valueType" :trigger-rect="attrTooltipData.triggerRect" />

    <!-- 通知组件 -->
    <Notification ref="notificationRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { container } from '@/core/di/Container';
import { useDebugStore } from "@/stores";
import AttributeTooltip from "@/components/AttributeTooltip.vue";
import Notification from "@/components/Notification.vue";
import { ATTRIBUTE_CODE, type Modifier, type AttributeValueType } from "@/types/attribute";
import type { SkillConfig } from "@/types/skill";
import { SELECTOR_TARGET_NAMES } from "@/types/skill";
import type { BattleManager } from '@/core/battle/BattleManager';

// 获取 BattleManager
const battleManager = container.resolve<BattleManager>('BattleManager');
const debugStore = useDebugStore();

const props = defineProps<{
  battleSystem?: any;
}>();

// 通知组件引用
const notificationRef = ref<InstanceType<typeof Notification> | null>(null);

// 响应式获取选中角色数据
const currentCharacter = computed(() => battleManager.getSelectedCharacter());
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
  if (skill.skillType === 'passive') return 'passive';
  if (skill.skillType === 'ultimate') return 'ultimate';
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

/**
 * 获取目标类型的中文名称
 * @param targetType - 目标类型
 * @returns 目标类型中文名称
 */
const getTargetTypeName = (targetType?: string): string => {
  if (!targetType) return '未知';
  return SELECTOR_TARGET_NAMES[targetType as keyof typeof SELECTOR_TARGET_NAMES] || '未知';
};

/**
 * 获取作用范围的中文名称
 * @param scope - 作用范围
 * @returns 作用范围中文名称
 */
const getScopeName = (scope?: string): string => {
  if (!scope) return '未知';
  return SELECTOR_TARGET_NAMES[scope as keyof typeof SELECTOR_TARGET_NAMES] || '未知';
};

/**
 * 获取技能步骤类型的中文名称
 * @param stepType - 技能步骤类型
 * @returns 技能步骤类型中文名称
 */
const getStepTypeName = (stepType?: string): string => {
  const stepTypes: Record<string, string> = {
    'DAMAGE': '造成伤害',
    'HEAL': '治疗目标',
    'BUFF': '施加增益',
    'DEBUFF': '施加减益',
    'REMOVE_BUFF': '移除增益',
    'REMOVE_DEBUFF': '移除减益',
    'CLEANSE': '净化',
    'DISPEL': '驱散',
    'STUN': '眩晕',
    'SILENCE': '沉默',
    'KNOCKBACK': '击退',
    'PULL': '拉扯',
    'TELEPORT': '传送',
    'SUMMON': '召唤',
    'TRANSFORM': '变身',
    'SHIELD': '护盾',
    'REFLECT': '反射',
    'DRAIN': '吸取',
    'REVIVE': '复活',
    'CUSTOM': '自定义效果'
  };
  return stepTypes[stepType || ''] || '未知';
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
const attrTooltipData = ref<{
  title: string
  modifiers: Modifier[]
  finalValue: number
  valueType: AttributeValueType
  triggerRect: DOMRect | null
}>({
  title: '',
  modifiers: [],
  finalValue: 0,
  valueType: '数值',
  triggerRect: null
})

const showAttrTooltip = (event: MouseEvent, title: string, modifiers: Modifier[], finalValue: number, valueType: AttributeValueType) => {
  attrTooltipData.value = {
    title,
    modifiers,
    finalValue,
    valueType,
    triggerRect: (event.currentTarget as HTMLElement).getBoundingClientRect()
  }
  attrTooltipVisible.value = true
}

const hideAttrTooltip = () => {
  attrTooltipVisible.value = false
}

/**
 * 获取加成属性的值
 * @param bonus - 加成属性值
 * @returns 数值类型的加成值
 */
const getBonusValue = (bonus: any): number => {
  if (typeof bonus === 'number') return bonus;
  if (typeof bonus === 'object' && bonus !== null && typeof bonus.value === 'number') return bonus.value;
  return 0;
};

/**
 * 格式化加成值显示
 * @param value - 加成属性值
 * @returns 格式化后的字符串
 */
const formatBonus = (value: any): string => {
  const numValue = getBonusValue(value);
  if (isNaN(numValue)) return "0%";
  if (numValue === 0) return "0%";
  const roundedValue = Math.round(numValue * 100) / 100;
  return roundedValue > 0 ? `+${roundedValue}%` : `${roundedValue}%`;
};

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

const resetBattle = () => {
  if (props.battleSystem) {
    try {
      props.battleSystem.resetBattle();
      battleManager.clearParticipants();
    } catch (error) {
      console.warn('重置战斗失败:', error);
    }
  }
};

// 数据快照方法
const exportState = async () => {
  try {
    if (!currentCharacter.value) {
      notificationRef.value?.addNotification(
        '导出失败',
        '请先选择一个角色',
        'warning',
        3000
      );
      return;
    }

    const char = currentCharacter.value;
    const currentTurn = battleManager.getCurrentTurn();

    // 定义要导出的属性列表
    const attributeCodes = [
      'currentHealth',
      'maxHealth',
      'energy',
      'maxEnergy',
      'attack',
      'minAttack',
      'maxAttack',
      'defense',
      'speed',
      'critRate',
      'critDamage',
      'damageReduction',
      'healthBonus',
      'attackBonus',
      'defenseBonus',
      'speedBonus',
    ];

    // 定义属性详细信息类型
    interface AttributeDetail {
      finalValue: number;
      baseValue: number;
      isPercentage: boolean;
      modifiers: Array<{
        source: string;
        sourceType: string;
        value: number;
        type: string;
        description?: string;
      }>;
      breakdown: {
        base: number;
        additive: number;
        percentMultiplier: number;
        independentMultiplier: number;
        finalMultiplier: number;
      } | null;
      trace: {
        finalValue: number;
        baseValue: number;
        steps: Array<{
          modifierId: string;
          sourceName: string;
          type: string;
          appliedValue: number;
          previousValue: number;
          intermediateResult: number;
        }>;
        sourceContributions: Array<{
          sourceId: string;
          sourceName: string;
          sourceType?: string;
          contribution: number;
        }>;
      } | null;
    }

    // 收集所有属性的详细信息
    const attributesDetail: Record<string, AttributeDetail> = {};

    for (const attrCode of attributeCodes) {
      const attrValue = char.getAttributeValue(attrCode);

      if (attrValue) {
        attributesDetail[attrCode] = {
          // 最终值
          finalValue: attrValue.value,
          // 基础值
          baseValue: attrValue.base,
          // 是否为百分比属性
          isPercentage: attrValue.isPercentage,
          // 修饰符列表
          modifiers: attrValue.modifiers.map(mod => ({
            source: mod.source,
            sourceType: mod.sourceType,
            value: mod.value,
            type: mod.type,
            description: mod.description,
          })),
          // 计算拆解（如果有）
          breakdown: attrValue.breakdown ? {
            base: attrValue.breakdown.base,
            additive: attrValue.breakdown.additive,
            percentMultiplier: attrValue.breakdown.percentMultiplier,
            independentMultiplier: attrValue.breakdown.independentMultiplier,
            finalMultiplier: attrValue.breakdown.finalMultiplier,
          } : null,
          // 详细追踪信息（如果有）
          trace: attrValue.trace ? {
            finalValue: attrValue.trace.finalValue,
            baseValue: attrValue.trace.baseValue,
            steps: attrValue.trace.steps.map(step => ({
              modifierId: step.modifierId,
              sourceName: step.sourceName,
              type: step.type,
              appliedValue: step.appliedValue,
              previousValue: step.previousValue,
              intermediateResult: step.intermediateResult,
            })),
            sourceContributions: attrValue.trace.sourceContributions.map(contrib => ({
              sourceId: contrib.sourceId,
              sourceName: contrib.sourceName,
              sourceType: contrib.sourceType,
              contribution: contrib.contribution,
            })),
          } : null,
        };
      }
    }

    // 准备导出数据
    const exportData = {
      exportTime: new Date().toISOString(),
      currentTurn,
      character: {
        // 基本信息
        id: char.id,
        name: char.name,
        level: char.level,
        type: char.type,
        team: char.team,
        enabled: char.enabled,

        // Buff列表
        buffs: char.buffs,

        // 技能配置
        skills: char.skills,

        // 状态效果
        statusEffects: char.statusEffects,

        // 属性详细信息（包含计算过程）
        attributes: attributesDetail,
      },
    };

    // 序列化为 JSON
    const jsonString = JSON.stringify(exportData, null, 2);

    // 写入剪贴板
    await navigator.clipboard.writeText(jsonString);

    // 显示成功通知
    notificationRef.value?.addNotification(
      '导出成功',
      `角色 "${char.name}" 的详细数据已复制到剪贴板`,
      'success',
      3000
    );

    console.log('导出角色状态成功，数据已写入剪贴板');
  } catch (error) {
    console.warn('导出状态失败:', error);

    // 显示失败通知
    notificationRef.value?.addNotification(
      '导出失败',
      `导出状态失败: ${error instanceof Error ? error.message : '未知错误'}`,
      'error',
      5000
    );
  }
};

const importState = () => {
  try {
    const state = debugStore.importState();
    if (state) {
      console.log('导入状态成功:', state);
      // 这里需要实现导入状态的逻辑
    }
  } catch (error) {
    console.warn('导入状态失败:', error);
  }
};

const viewExport = () => {
  try {
    const state = debugStore.viewExport();
    if (state) {
      console.log('导出状态:', state);
      // 这里可以显示导出的状态
    }
  } catch (error) {
    console.warn('查看导出状态失败:', error);
  }
};

const reloadExport = () => {
  try {
    const state = debugStore.reloadExport();
    if (state) {
      console.log('重载状态成功:', state);
      // 这里需要实现重载状态的逻辑
    }
  } catch (error) {
    console.warn('重载状态失败:', error);
  }
};
</script>

<style scoped>
@use "@/styles/main.scss";

.skill-item {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.skill-item:hover {
  background: rgba(34, 211, 238, 0.1);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
}

.skill-item.passive:hover {
  border-left: 2px solid #22d3ee;
}

.skill-item.small:hover {
  border-left: 2px solid #60a5fa;
}

.skill-item.ultimate:hover {
  border-left: 2px solid #f97316;
}

/* 技能信息显示样式 */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-category {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-category-title {
  font-size: 12px;
  font-weight: 600;
  color: #60a5fa;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 8px;
}

.no-skills {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
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
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(96, 165, 250, 0.2);
  backdrop-filter: blur(12px);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.85);
  pointer-events: none;
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.3);
}

.tooltip-name {
  font-size: 15px;
  font-weight: 600;
  color: #22d3ee;
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
}

.tooltip-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tooltip-type.active {
  background: rgba(96, 165, 250, 0.2);
  color: #60a5fa;
}

.tooltip-type.passive {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}

.tooltip-type.ultimate {
  background: rgba(249, 115, 22, 0.2);
  color: #f97316;
}

.tooltip-description {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 12px;
  line-height: 1.6;
}

.tooltip-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.tooltip-stats .stat-item {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(96, 165, 250, 0.2);
}

.tooltip-stats .stat-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tooltip-stats .stat-value {
  font-size: 13px;
  color: #22d3ee;
  font-weight: 500;
}

.tooltip-effects {
  margin-bottom: 12px;
}

.effects-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.2);
}

.effect-item {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
}

.effect-type {
  padding: 2px 6px;
  background: rgba(34, 211, 238, 0.15);
  border-radius: 3px;
  color: #22d3ee;
  font-weight: 500;
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
  padding: 8px;
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-radius: 4px;
  font-size: 11px;
}

.condition-label {
  color: #f97316;
  margin-right: 6px;
}

.condition-value {
  color: rgba(255, 255, 255, 0.7);
  font-family: 'JetBrains Mono', monospace;
}

/* 技能可用性状态 */
.tooltip-availability {
  margin-top: 12px;
  padding: 8px;
  border-radius: 6px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
}

.tooltip-availability.available {
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.3);
}

.tooltip-availability.unavailable {
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
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

/* 响应式适配 */
@media (max-width: 768px) {
  .skill-tooltip {
    max-width: 280px;
    font-size: 12px;
  }

  .tooltip-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .skill-tooltip {
    max-width: 260px;
    left: 10px !important;
    right: 10px !important;
    font-size: 11px;
  }

  .tooltip-stats {
    grid-template-columns: 1fr;
  }
}
</style>