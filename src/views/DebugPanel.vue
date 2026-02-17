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
          <div class="monitor-item">
            <span class="monitor-label">HP:</span>
            <span class="monitor-value">{{ selectedChar?.currentHp || 0 }}/{{ baseProps.maxHp }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">能量:</span>
            <span class="monitor-value">{{ selectedChar?.currentEnergy || 0 }}/{{ selectedChar?.maxEnergy || 150 }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">攻击:</span>
            <span class="monitor-value" 
              @mouseenter="showAttrTooltip($event, '攻击', [], 0, '数值')"
              @mouseleave="hideAttrTooltip">{{ attackRange.min }}-{{ attackRange.max }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">防御:</span>
            <span class="monitor-value" 
              @mouseenter="showAttrTooltip($event, '防御', baseProps.defenseOptions, baseProps.defense, '数值')"
              @mouseleave="hideAttrTooltip">{{ baseProps.defense }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">速度:</span>
            <span class="monitor-value" 
              @mouseenter="showAttrTooltip($event, '速度', baseProps.speedOptions, baseProps.speed, '数值')"
              @mouseleave="hideAttrTooltip">{{ baseProps.speed }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">暴击率:</span>
            <span class="monitor-value" 
              @mouseenter="showAttrTooltip($event, '暴击率', baseProps.critRateOptions, baseProps.critRate, '百分比')"
              @mouseleave="hideAttrTooltip">{{ baseProps.critRate }}%</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">暴击伤害:</span>
            <span class="monitor-value" 
              @mouseenter="showAttrTooltip($event, '暴击伤害', baseProps.critDamageOptions, baseProps.critDamage, '百分比')"
              @mouseleave="hideAttrTooltip">{{ baseProps.critDamage }}%</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">免伤率:</span>
            <span class="monitor-value" 
              @mouseenter="showAttrTooltip($event, '免伤率', baseProps.damageReductionOptions, baseProps.damageReduction, '百分比')"
              @mouseleave="hideAttrTooltip">{{ baseProps.damageReduction }}%</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">属性加成</div>
        <div class="monitor-grid">
          <div class="monitor-item">
            <span class="monitor-label">气血加成:</span>
            <span class="monitor-value bonus" 
              @mouseenter="showAttrTooltip($event, '气血加成', bonusProps.healthBonusOptions, bonusProps.healthBonus, '百分比')"
              @mouseleave="hideAttrTooltip">{{ formatBonus(selectedChar?.healthBonus) }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">攻击加成:</span>
            <span class="monitor-value bonus" 
              @mouseenter="showAttrTooltip($event, '攻击加成', bonusProps.attackBonusOptions, bonusProps.attackBonus, '百分比')"
              @mouseleave="hideAttrTooltip">{{ formatBonus(selectedChar?.attackBonus) }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">防御加成:</span>
            <span class="monitor-value bonus" 
              @mouseenter="showAttrTooltip($event, '防御加成', bonusProps.defenseBonusOptions, bonusProps.defenseBonus, '百分比')"
              @mouseleave="hideAttrTooltip">{{ formatBonus(selectedChar?.defenseBonus) }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">速度加成:</span>
            <span class="monitor-value bonus" 
              @mouseenter="showAttrTooltip($event, '速度加成', bonusProps.speedBonusOptions, bonusProps.speedBonus, '百分比')"
              @mouseleave="hideAttrTooltip">{{ formatBonus(selectedChar?.speedBonus) }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">最终属性</div>
        <div class="monitor-grid">
          <div class="monitor-item">
            <span class="monitor-label">最终攻击:</span>
            <span class="monitor-value final" 
              @mouseenter="showAttrTooltip($event, '最终攻击', finalProps.attackOptions, finalProps.attack, '数值')"
              @mouseleave="hideAttrTooltip">{{ finalStats.attack }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">最终防御:</span>
            <span class="monitor-value final" 
              @mouseenter="showAttrTooltip($event, '最终防御', finalProps.defenseOptions, finalProps.defense, '数值')"
              @mouseleave="hideAttrTooltip">{{ finalStats.defense }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">最终速度:</span>
            <span class="monitor-value final" 
              @mouseenter="showAttrTooltip($event, '最终速度', finalProps.speedOptions, finalProps.speed, '数值')"
              @mouseleave="hideAttrTooltip">{{ finalStats.speed }}</span>
          </div>
          <div class="monitor-item">
            <span class="monitor-label">最终气血:</span>
            <span class="monitor-value final" 
              @mouseenter="showAttrTooltip($event, '最终气血', finalProps.healthOptions, finalProps.health, '数值')"
              @mouseleave="hideAttrTooltip">{{ finalStats.health }}</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">技能信息</div>
        <div class="skills-display">
          <div 
            class="skill-item passive" 
            v-if="passiveSkillName"
            @mouseenter="showSkillTooltip($event, 'passive')"
            @mouseleave="hideSkillTooltip"
            @mousemove="updateTooltipPosition"
          >
            <span class="skill-label">被动:</span>
            <span class="skill-name">{{ passiveSkillName }}</span>
          </div>
          <div 
            class="skill-item small" 
            v-if="smallSkillName"
            @mouseenter="showSkillTooltip($event, 'small')"
            @mouseleave="hideSkillTooltip"
            @mousemove="updateTooltipPosition"
          >
            <span class="skill-label">小技能:</span>
            <span class="skill-name">{{ smallSkillName }}</span>
          </div>
          <div 
            class="skill-item ultimate" 
            v-if="ultimateSkillName"
            @mouseenter="showSkillTooltip($event, 'ultimate')"
            @mouseleave="hideSkillTooltip"
            @mousemove="updateTooltipPosition"
          >
            <span class="skill-label">大技能:</span>
            <span class="skill-name">{{ ultimateSkillName }}</span>
          </div>
          <div
            v-if="!passiveSkillName && !smallSkillName && !ultimateSkillName"
            class="no-skills"
          >
            暂未配置技能
          </div>
        </div>
      </div>
    </div>

    <!-- 技能悬浮提示 -->
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div 
          v-if="tooltipVisible && tooltipContent"
          class="skill-tooltip"
          :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"
        >
          <div class="tooltip-header">
            <span class="tooltip-name">{{ tooltipContent.name }}</span>
            <span class="tooltip-type" :class="tooltipContent.skillType || 'active'">
              {{ tooltipContent.skillType === 'passive' ? '被动' : tooltipContent.skillType === 'ultimate' ? '终极' : '主动' }}
            </span>
          </div>
          <div class="tooltip-description">{{ tooltipContent.description || '暂无描述' }}</div>
          <div class="tooltip-stats">
            <div class="stat-item" v-if="tooltipContent.mpCost > 0">
              <span class="stat-label">消耗:</span>
              <span class="stat-value">{{ tooltipContent.mpCost }} 能量</span>
            </div>
            <div class="stat-item" v-if="tooltipContent.cooldown > 0">
              <span class="stat-label">冷却:</span>
              <span class="stat-value">{{ tooltipContent.cooldown }} 回合</span>
            </div>
            <div class="stat-item" v-if="tooltipContent.maxUses">
              <span class="stat-label">次数:</span>
              <span class="stat-value">{{ tooltipContent.maxUses }} 次</span>
            </div>
          </div>
          <div class="tooltip-effects" v-if="tooltipContent.steps && tooltipContent.steps.length > 0">
            <div class="effects-title">技能效果</div>
            <div 
              class="effect-item" 
              v-for="(step, index) in tooltipContent.steps" 
              :key="index"
            >
              <span class="effect-type">{{ getStepTypeName(step.type) }}</span>
              <span class="effect-formula" v-if="step.formula">{{ step.formula }}</span>
              <span class="effect-scope" v-if="step.scope">{{ getScopeName(step.scope) }}</span>
              <span class="effect-duration" v-if="step.duration">({{ step.duration }}回合)</span>
            </div>
          </div>
          <div class="tooltip-condition" v-if="tooltipContent.condition">
            <span class="condition-label">条件:</span>
            <span class="condition-value">{{ tooltipContent.condition }}</span>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div class="section">
      <div class="section-header">手动干预</div>
      <div class="intervention-list">
        <button class="intervention-btn" @click="$emit('end-turn')">[1] 立即结束当前回合</button>
        <div class="intervention-row">
          <span>[2]</span>
          <input type="text" v-model="manualSkillName" placeholder="技能名" class="intervention-input" />
          <button class="btn-small" @click="$emit('execute-skill', manualSkillName)">[执行]</button>
        </div>
        <div class="intervention-row">
          <span>[3]</span>
          <input type="text" v-model="manualStatusName" placeholder="状态名" class="intervention-input" />
          <span>回合:</span>
          <input type="number" v-model="manualStatusTurns" class="intervention-num" />
          <button class="btn-small" @click="$emit('add-status', { name: manualStatusName, turns: manualStatusTurns })">
            [执行]
          </button>
        </div>
        <div class="intervention-row">
          <span>[4]</span>
          <span>HP[</span>
          <input type="number" v-model="manualHpAmount" class="intervention-num" />
          <span>] MP[</span>
          <input type="number" v-model="manualMpAmount" class="intervention-num" />
          <span>]</span>
          <button class="btn-small" @click="$emit('adjust-stats', { hp: manualHpAmount, mp: manualMpAmount })">
            [执行]
          </button>
        </div>
        <button class="intervention-btn" @click="$emit('clear-statuses')">[5] 清除所有状态</button>
        <button class="intervention-btn danger" @click="$emit('reset-battle')">[R] 重置战斗</button>
      </div>
    </div>

    <div class="section">
      <div class="section-header">数据快照</div>
      <div class="snapshot-actions">
        <button class="intervention-btn" @click="$emit('export-state')">[E] 导出当前状态(JSON)</button>
        <button class="intervention-btn" @click="$emit('import-state')">[I] 导入状态数据</button>
      </div>
      <div class="last-export">
        <span>最近导出: {{ lastExportTime || '无' }}</span>
        <div class="snapshot-btns">
          <button class="btn-small" @click="$emit('view-export')">[查看]</button>
          <button class="btn-small" @click="$emit('reload-export')">[重载]</button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">异常检测</div>
      <div class="exception-status" :class="exceptionStatus.class">
        <span>{{ exceptionStatus.message }}</span>
        <button v-if="exceptionStatus.hasException" class="btn-small" @click="$emit('locate-exception')">[定位]</button>
      </div>
    </div>

    <!-- 属性悬浮提示 -->
    <AttributeTooltip 
      :visible="attrTooltipVisible" 
      :title="attrTooltipData.title"
      :options="attrTooltipData.options"
      :final-value="attrTooltipData.finalValue"
      :value-type="attrTooltipData.valueType"
      :trigger-rect="attrTooltipData.triggerRect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { GameDataProcessor } from "@/utils/GameDataProcessor";
import AttributeTooltip from "@/components/AttributeTooltip.vue";
import type { UIBattleCharacter, AttributeValue } from "@/types";
import type { AttributeOption, AttributeValueType } from "@/types/UI/UIBattleCharacter";
import type { SkillConfig } from "@/types/skill";

const props = defineProps<{
  allyTeam: UIBattleCharacter[];
  enemyTeam: UIBattleCharacter[];
  selectedChar: UIBattleCharacter | null;
  selectedCharacterId?: string | null;
  lastExportTime: string | null;
}>();

const emit = defineEmits<{
  "end-turn": [];
  "execute-skill": [skillName: string];
  "add-status": [status: { name: string; turns: number }];
  "adjust-stats": [stats: { hp: number; mp: number }];
  "clear-statuses": [];
  "reset-battle": [];
  "export-state": [];
  "import-state": [];
  "view-export": [];
  "reload-export": [];
  "locate-exception": [];
}>();

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
 * 显示技能悬浮提示
 * @param event - 鼠标事件
 * @param skillType - 技能类型
 */
const showSkillTooltip = (event: MouseEvent, skillType: 'passive' | 'small' | 'ultimate') => {
  const skill = selectedCharSkills.value[skillType];
  if (!skill) return;
  
  tooltipContent.value = skill;
  tooltipVisible.value = true;
  updateTooltipPosition(event);
};

/**
 * 隐藏技能悬浮提示
 */
const hideSkillTooltip = () => {
  tooltipVisible.value = false;
  tooltipContent.value = null;
};

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
 * 获取技能步骤类型的中文名称
 * @param type - 步骤类型
 */
const getStepTypeName = (type: string): string => {
  const typeMap: Record<string, string> = {
    damage: "伤害",
    heal: "治疗",
    buff: "增益",
    debuff: "减益",
    stun: "眩晕",
    silence: "沉默",
    shield: "护盾",
  };
  return typeMap[type] || type;
};

/**
 * 获取作用范围的中文名称
 * @param scope - 作用范围
 */
const getScopeName = (scope: string): string => {
  const scopeMap: Record<string, string> = {
    enemy: "敌方",
    ally: "友方",
    self: "自身",
    all: "全体",
    single: "单体",
    enemy_front: "敌方前排",
    enemy_back: "敌方后排",
  };
  return scopeMap[scope] || scope;
};

// ------------------------------------------------------------
// 1. 当前选中的角色（优先使用 props，如果为空则尝试从队伍中查找）
const selectedChar = computed(() => {
  // 优先使用 props 传入的 selectedChar
  if (props.selectedChar) return props.selectedChar;
  
  // 如果 props.selectedChar 为空，尝试从队伍中根据 selectedCharacterId 查找
  const charId = props.selectedCharacterId;
  if (!charId) return null;
  
  const ally = props.allyTeam.find(c => c.id === charId);
  if (ally) return ally;
  
  const enemy = props.enemyTeam.find(e => e.id === charId);
  if (enemy) return enemy;
  
  return null;
});

// 选中角色名称（用于标题栏）
const selectedCharName = computed(() => selectedChar.value?.name || "未选择");

// 选中角色的原始ID（用于查询技能）
const selectedOriginalId = computed(() => {
  const char = selectedChar.value;
  return char?.originalId || char?.id || "";
});

// ------------------------------------------------------------
// 2. 技能信息（优先使用角色自带的技能配置，如果没有则回退到查询）
const selectedCharSkills = computed(() => {
  const char = selectedChar.value;
  if (!char) return { passive: null, small: null, ultimate: null };
  
  // 优先使用角色自带的 skills 配置
  if (char.skills && (char.skills.passive?.length || char.skills.small?.length || char.skills.ultimate?.length)) {
    return {
      passive: char.skills.passive?.[0] || null,
      small: char.skills.small?.[0] || null,
      ultimate: char.skills.ultimate?.[0] || null,
    };
  }
  
  // 回退到通过 originalId 查询
  const id = selectedOriginalId.value;
  if (!id) return { passive: null, small: null, ultimate: null };
  return GameDataProcessor.getCharacterSkills(id);
});

// 各技能名称（直接绑定到模板）
const passiveSkillName = computed(() => selectedCharSkills.value.passive?.name || "");
const smallSkillName = computed(() => selectedCharSkills.value.small?.name || "");
const ultimateSkillName = computed(() => selectedCharSkills.value.ultimate?.name || "");

// ------------------------------------------------------------
// 3. 最终属性（一次计算全部）
const finalStats = computed(() => {
  const char = selectedChar.value;
  if (!char) return { attack: 0, defense: 0, speed: 0, health: 0 };

  const getVal = (attr: number | AttributeValue | undefined) => GameDataProcessor.getAttributeValue(attr);
  const getBonus = (attr: number | AttributeValue | undefined) => GameDataProcessor.getAttributeValue(attr);

  const baseAttack = getVal(char.attack);
  const baseDefense = getVal(char.defense);
  const baseSpeed = getVal(char.speed);
  const baseHealth = getVal(char.maxHp);
  const attackBonus = getBonus(char.attackBonus);
  const defenseBonus = getBonus(char.defenseBonus);
  const speedBonus = getBonus(char.speedBonus);
  const healthBonus = getBonus(char.healthBonus);

  const calc = (base: number, bonus = 0) => Math.floor(base * (1 + bonus / 100));

  return {
    attack: calc(baseAttack, attackBonus),
    defense: calc(baseDefense, defenseBonus),
    speed: calc(baseSpeed, speedBonus),
    health: calc(baseHealth, healthBonus),
  };
});

// 模板中直接使用的属性计算
const baseProps = computed(() => {
  const char = selectedChar.value;
  if (!char) return { 
    maxHp: 0, defense: 0, speed: 0, critRate: 10, critDamage: 125, damageReduction: 0,
    maxHpOptions: [], defenseOptions: [], speedOptions: [], critRateOptions: [], critDamageOptions: [], damageReductionOptions: []
  };
  
  return {
    maxHp: GameDataProcessor.getAttributeValue(char.maxHp),
    defense: GameDataProcessor.getAttributeValue(char.defense),
    speed: GameDataProcessor.getAttributeValue(char.speed),
    critRate: GameDataProcessor.getAttributeValue(char.critRate),
    critDamage: GameDataProcessor.getAttributeValue(char.critDamage),
    damageReduction: GameDataProcessor.getAttributeValue(char.damageReduction),
    maxHpOptions: GameDataProcessor.getAttributeOptions(char.maxHp),
    defenseOptions: GameDataProcessor.getAttributeOptions(char.defense),
    speedOptions: GameDataProcessor.getAttributeOptions(char.speed),
    critRateOptions: GameDataProcessor.getAttributeOptions(char.critRate),
    critDamageOptions: GameDataProcessor.getAttributeOptions(char.critDamage),
    damageReductionOptions: GameDataProcessor.getAttributeOptions(char.damageReduction),
  };
});

// 属性加成计算（含来源信息）
const bonusProps = computed(() => {
  const char = selectedChar.value;
  if (!char) return {
    healthBonus: 0, attackBonus: 0, defenseBonus: 0, speedBonus: 0,
    healthBonusOptions: [], attackBonusOptions: [], defenseBonusOptions: [], speedBonusOptions: []
  };
  
  return {
    healthBonus: GameDataProcessor.getAttributeValue(char.healthBonus),
    attackBonus: GameDataProcessor.getAttributeValue(char.attackBonus),
    defenseBonus: GameDataProcessor.getAttributeValue(char.defenseBonus),
    speedBonus: GameDataProcessor.getAttributeValue(char.speedBonus),
    healthBonusOptions: GameDataProcessor.getAttributeOptions(char.healthBonus),
    attackBonusOptions: GameDataProcessor.getAttributeOptions(char.attackBonus),
    defenseBonusOptions: GameDataProcessor.getAttributeOptions(char.defenseBonus),
    speedBonusOptions: GameDataProcessor.getAttributeOptions(char.speedBonus),
  };
});

// 最终属性计算（含来源信息）
const finalProps = computed(() => {
  const char = selectedChar.value;
  if (!char) return {
    attack: 0, defense: 0, speed: 0, health: 0,
    attackOptions: [], defenseOptions: [], speedOptions: [], healthOptions: []
  };
  
  const getVal = (attr: number | AttributeValue | undefined) => GameDataProcessor.getAttributeValue(attr);
  const getOpts = (attr: number | AttributeValue | undefined) => GameDataProcessor.getAttributeOptions(attr);
  const getBonus = (attr: number | AttributeValue | undefined) => GameDataProcessor.getAttributeValue(attr);

  const baseAttack = getVal(char.attack);
  const baseDefense = getVal(char.defense);
  const baseSpeed = getVal(char.speed);
  const baseHealth = getVal(char.maxHp);
  const attackBonus = getBonus(char.attackBonus);
  const defenseBonus = getBonus(char.defenseBonus);
  const speedBonus = getBonus(char.speedBonus);
  const healthBonus = getBonus(char.healthBonus);

  const calc = (base: number, bonus = 0) => Math.floor(base * (1 + bonus / 100));

  return {
    attack: calc(baseAttack, attackBonus),
    defense: calc(baseDefense, defenseBonus),
    speed: calc(baseSpeed, speedBonus),
    health: calc(baseHealth, healthBonus),
    attackOptions: getOpts(char.attack),
    defenseOptions: getOpts(char.defense),
    speedOptions: getOpts(char.speed),
    healthOptions: getOpts(char.maxHp),
  };
});

// 属性悬浮提示状态
const attrTooltipVisible = ref(false)
const attrTooltipData = ref<{
  title: string
  options: AttributeOption[]
  finalValue: number
  valueType: AttributeValueType
  triggerRect: DOMRect | null
}>({
  title: '',
  options: [],
  finalValue: 0,
  valueType: '数值',
  triggerRect: null
})

const showAttrTooltip = (event: MouseEvent, title: string, options: AttributeOption[], finalValue: number, valueType: AttributeValueType) => {
  attrTooltipData.value = {
    title,
    options,
    finalValue,
    valueType,
    triggerRect: (event.target as HTMLElement).getBoundingClientRect()
  }
  attrTooltipVisible.value = true
}

const hideAttrTooltip = () => {
  attrTooltipVisible.value = false
}

// 攻击范围计算
const attackRange = computed(() => {
  const char = selectedChar.value;
  if (!char) return { min: 0, max: 0 };
  return {
    min: char.minAttack || 0,
    max: char.maxAttack || 0,
  };
});

// ------------------------------------------------------------
// 4. 辅助函数（纯展示逻辑，无需缓存）
const formatBonus = (value: number | AttributeValue | undefined): string => {
  const numValue = GameDataProcessor.getAttributeValue(value);
  if (numValue === 0) return "0%";
  const roundedValue = Math.round(numValue * 100) / 100;
  return roundedValue > 0 ? `+${roundedValue}%` : `${roundedValue}%`;
};

// ------------------------------------------------------------
// 5. 异常检测（保持原样，仅示例）
const exceptionStatus = computed(() => {
  return { message: "[正常] 无逻辑异常", class: "normal", hasException: false };
});
</script>

<style scoped>
@use "@/styles/main.scss";

.skill-item {
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 4px 8px;
  border-radius: 4px;
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