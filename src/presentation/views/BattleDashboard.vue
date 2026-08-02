<template>
  <div class="panel-right">
    <div class="section flex-1">
      <div class="section-header">
        <span>角色监控</span>
        <span class="selected-info">(当前选中: {{ selectedCharName }})</span>
      </div>
      <!-- 显示层级过滤器（调试面板） -->
      <div class="tier-filters">
        <label class="tier-filter" v-for="tier in (['core', 'advanced', 'situational', 'hidden'] as const)" :key="tier">
          <input type="checkbox" v-model="tierFilters[tier]" />
          <span>{{ { core: '核心', advanced: '进阶', situational: '情境', hidden: '隐藏' }[tier] }}</span>
        </label>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">基础属性</div>
        <div class="monitor-grid" @mouseleave="hideAttrTooltip">
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.maxHealth)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">气血:</span>
            <span class="monitor-value">{{ displayHp }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.currentEnergy)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">能量:</span>
            <span class="monitor-value">{{ displayEnergy }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttackTooltip($event)" @mousemove="updateTooltipPosition"
            @mouseleave="hideAttrTooltip">
            <span class="monitor-label">攻击:</span>
            <span class="monitor-value">{{ attackRange.min }}-{{ attackRange.max }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.defense)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">防御:</span>
            <span class="monitor-value">{{ attrVal(ATTRIBUTE_CODE.defense) }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.speed)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">速度:</span>
            <span class="monitor-value">{{ attrVal(ATTRIBUTE_CODE.speed) }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.critRate)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">暴击率:</span>
            <span class="monitor-value">{{ attrVal(ATTRIBUTE_CODE.critRate) }}%</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.critDamage)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">暴击伤害:</span>
            <span class="monitor-value">{{ attrVal(ATTRIBUTE_CODE.critDamage) }}%</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.damageReduction)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">免伤率:</span>
            <span class="monitor-value">{{ attrVal(ATTRIBUTE_CODE.damageReduction) }}%</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.hit)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">命中率:</span>
            <span class="monitor-value">{{ attrVal(ATTRIBUTE_CODE.hit) }}%</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.dodge)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">闪避率:</span>
            <span class="monitor-value">{{ attrVal(ATTRIBUTE_CODE.dodge) }}%</span>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <div class="monitor-subtitle">属性加成</div>
        <div class="monitor-grid" @mouseleave="hideAttrTooltip">
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.healthBonus)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">气血加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(attrVal(ATTRIBUTE_CODE.healthBonus)) }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.attackBonus)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">攻击加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(attrVal(ATTRIBUTE_CODE.attackBonus)) }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.defenseBonus)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">防御加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(attrVal(ATTRIBUTE_CODE.defenseBonus)) }}</span>
          </div>
          <div class="monitor-item" @mouseenter="showAttrTooltipSimple($event, ATTRIBUTE_CODE.speedBonus)"
            @mousemove="updateTooltipPosition" @mouseleave="hideAttrTooltip">
            <span class="monitor-label">速度加成:</span>
            <span class="monitor-value bonus">{{
              formatBonusValue(attrVal(ATTRIBUTE_CODE.speedBonus)) }}</span>
          </div>
        </div>
      </div>
      <!-- 进阶属性（折叠） -->
      <div class="monitor-group" v-if="tierFilters.advanced">
        <div class="monitor-subtitle" role="button" tabindex="0" style="cursor:pointer"
          @click="advancedExpanded = !advancedExpanded"
          @keydown.enter.prevent="advancedExpanded = !advancedExpanded"
          @keydown.space.prevent="advancedExpanded = !advancedExpanded">
          进阶属性 {{ advancedExpanded ? '▼' : '▶' }}
        </div>
        <div v-show="advancedExpanded">
          <div v-for="(attrs, group) in advancedAttributes" :key="group">
            <div class="monitor-subtitle" style="font-size:0.85em;opacity:0.7;margin-top:8px">
              {{ groupLabels[group] || group }}
            </div>
            <div class="monitor-grid" @mouseleave="hideAttrTooltip">
              <div class="monitor-item" v-for="a in attrs" :key="a.code"
                @mouseenter="showAttrTooltipSimple($event, a.code as ATTRIBUTE_CODE)" @mousemove="updateTooltipPosition"
                @mouseleave="hideAttrTooltip">
                <span class="monitor-label">{{ a.meta.displayName }}:</span>
                <span class="monitor-value">{{ attrVal(a.code as ATTRIBUTE_CODE) }}{{ a.meta.isPercentage ? '%' : ''
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="monitor-group">
        <Tabs v-model="activeTab" :tabs="skillTabs" size="sm" destroy-inactive>
          <template #passive>
          <EmptyState v-if="groupedPassives.length === 0">暂无被动技能</EmptyState>
            <div v-else class="skills-list" @mouseleave="hideSkillTooltip">
              <div v-for="group in groupedPassives" :key="group.category" class="skill-category">
                <div class="skill-category-title">
                  <span class="category-dot" :style="{ background: group.color }"></span>
                  {{ group.label }}
                  <span class="category-count">({{ group.skills.length }})</span>
                </div>
                <div v-for="(skill, index) in group.skills" :key="index" class="skill-item passive"
                  :style="{ borderLeftColor: group.color }" @mouseenter="showSkillTooltip($event, skill)"
                  @mousemove="updateTooltipPosition" @mouseleave="hideSkillTooltip">
                  {{ skill.name || '未知技能' }}
                </div>
              </div>
            </div>
          </template>
          <template #active>
            <div class="skills-display">
              <EmptyState v-if="!currentCharacter?.skills?.small?.length && !currentCharacter?.skills?.ultimate?.length">暂无主动技能</EmptyState>
              <div v-else class="skills-list" @mouseleave="hideSkillTooltip">
                <div v-if="currentCharacter!.skills.small?.length" class="skill-category">
                  <div class="skill-category-title">小技能</div>
                  <div v-for="(skill, index) in currentCharacter!.skills.small" :key="index" class="skill-item small"
                    @mouseenter="showSkillTooltip($event, skill)" @mousemove="updateTooltipPosition"
                    @mouseleave="hideSkillTooltip">
                    {{ skill.name || '未知技能' }}
                  </div>
                </div>
                <div v-if="currentCharacter!.skills.ultimate?.length" class="skill-category">
                  <div class="skill-category-title">终极技能</div>
                  <div v-for="(skill, index) in currentCharacter!.skills.ultimate" :key="index"
                    class="skill-item ultimate" @mouseenter="showSkillTooltip($event, skill)"
                    @mousemove="updateTooltipPosition" @mouseleave="hideSkillTooltip">
                    {{ skill.name || '未知技能' }}
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #status>
            <div class="skills-display">
              <EmptyState v-if="buffListItems.length === 0">无生效状态</EmptyState>
              <div v-else class="buff-list">
                <BuffTextGroup v-for="buff in buffDisplay.groups" :key="buff.instanceId" :buff="buff"
                  :debug-mode="false" />
              </div>
            </div>
          </template>
        </Tabs>
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
      :display-text="attrTooltipData.displayText" :range-layers="attrTooltipData.rangeLayers"
      :attribute-code="attrTooltipData.attributeCode" />

    <!-- 战斗回放 -->
    <BattleReplay />

  </div>
</template>

<script setup lang="ts">
import type { BattleService } from '@/application/facade/BattleFacade';
import { ATTRIBUTE_CODE, AttributeMetaMap, AttributeValueType, getAttrDv, getAttrMeta, type Modifier, ModifierType, ModifierTypeNames } from "@/domain/attribute/types";
import { getAttributeDisplayConfig } from '@/presentation/config/attributeDisplay';
import { BattleEntity } from '@/domain/battle/type/types';
import { getStepTypeDisplayName } from "@/domain/skill/constants";
import type { SkillConfig } from "@/domain/skill/types";
import { formatTargetConfig, SkillType, SkillTypeName, ExtendedSkillStep } from "@/domain/skill/types";
import { container } from '@/infrastructure/di/Container';
import AttributeTooltip, { type RangeLayerData, type RangeModifierRow } from "@/presentation/components/AttributeTooltip.vue";
import BuffTextGroup from "@/presentation/components/BuffTextGroup.vue";
import Tabs from '@/presentation/components/Tabs.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import { useBattleStore } from '@/presentation/stores';
import BattleReplay from "@/presentation/views/BattleReplay.vue";
import { formatBonusValue } from '@/shared/utils/format';
import { computed, onMounted, onUnmounted, ref, type ComputedRef } from "vue";

import type { BuffRawItem } from '@/shared/types/buff-display'
import { useBuffDisplay } from '@/presentation/composables/useBuffDisplay'
import EmptyState from '@/presentation/components/EmptyState.vue'

const battleStore = useBattleStore();

// 获取 BattleService
const battleService = container.resolve<BattleService>('BattleService');
defineProps<{}>();

// 响应式获取选中角色数据
const currentCharacter: ComputedRef<BattleEntity | null> = computed(() => {
  const id = battleStore.selectedCharacterId;
  if (!id) return null;
  // 先找战斗中的参战角色，若未加入队伍则回退到角色库预览实体
  const char = battleService.getSelectedCharacter() || battleStore.previewEntity;
  return char;
});

// 投影层快照 ID — 所有下游 computed 依赖此值建立响应式链路
const snapId = computed(() => battleStore.selectedCharacterId)
const snapVersion = computed(() => {
  const id = snapId.value
  if (!id) return 0
  return battleStore.participants.get(id)?.version ?? 0
})

const selectedCharName = computed(() => currentCharacter.value?.name || "未选择");

// 从实体读取选中角色最新值（依赖 snapVersion 触发重算）
function readEntity<T>(reader: (char: BattleEntity) => T, fallback: T): T {
  void snapVersion.value  // 建立响应式依赖
  const char = currentCharacter.value
  if (!char) return fallback
  return reader(char)
}

const displayHp = computed(() => {
  return readEntity(
    char => `${Math.max(0, Math.floor(char.currentHealth))}/${Math.max(0, Math.floor(char.maxHealth))}`,
    '--/--'
  )
})

const displayEnergy = computed(() => {
  return readEntity(
    char => `${Math.floor(char.currentEnergy)}/${Math.floor(char.maxEnergy)}`,
    '--/--'
  )
})

// 获取角色属性值（模板调用时自动建立响应式依赖）
const attrVal = (code: ATTRIBUTE_CODE): number => {
  void snapVersion.value
  const char = currentCharacter.value
  return char?.getAttrVal(code)?.value ?? getAttrDv(code)
}

const attackRange = computed(() => {
  return readEntity(
    char => ({
      min: char.getAttrVal(ATTRIBUTE_CODE.minAttack)?.value ?? 0,
      max: char.getAttrVal(ATTRIBUTE_CODE.maxAttack)?.value ?? 0,
    }),
    { min: 0, max: 0 }
  )
})

// 进阶属性配置
const groupLabels: Record<string, string> = {
  defense: '防御',
  offense: '攻击',
  elemental: '元素',
  control: '控制',
  utility: '辅助',
}
const advancedExpanded = ref(false)
const tierFilters = ref({
  core: true,
  advanced: true,
  situational: false,
  hidden: false,
})
const advancedAttributes = computed(() => {
  const groups: Record<string, Array<{ code: string; meta: { displayName: string; isPercentage: boolean } }>> = {}
  for (const [code, meta] of Object.entries(AttributeMetaMap)) {
    const display = getAttributeDisplayConfig(code)
    if (display.displayTier !== 'advanced') continue
    if (!groups[display.group]) groups[display.group] = []
    groups[display.group].push({ code, meta: { displayName: meta.displayName, isPercentage: !!meta.isPercentage } })
  }
  return groups
})

// ------------------------------------------------------------
// Tabs 状态（技能/状态切换）
const activeTab = ref<string>('passive')
const skillTabs: TabItem[] = [
  { id: 'passive', label: '被动' },
  { id: 'active', label: '主动' },
  { id: 'status', label: '状态' },
]

// ------------------------------------------------------------
// Buff 数据（状态 tab）
// 从投影层快照读取当前角色的 Buff 原始数据
const currentCharacterSnap = computed(() => {
  const id = snapId.value
  if (!id) return null
  return battleStore.participants.get(id) ?? null
})

// 从快照读取 Buff 数据，无需再直接 resolve BuffSystem
const buffListItems = computed((): BuffRawItem[] => currentCharacterSnap.value?.buffs ?? [])

const buffDisplay = useBuffDisplay(buffListItems, computed(() => currentCharacter.value?.id ?? ''), 99)

/** 被动技能分类展示配置
 *  NOTE: 分类色为被动技能专属色板，集中在此配置（不散落），与 tokens 的 --cat-*（数据分类圆点）色板语义不同，故不合并 */
const CATEGORY_CONFIG: Record<string, { label: string; color: string; priority: number }> = {
  aura: { label: '光环', color: '#34d399', priority: 0 },
  trigger: { label: '触发', color: '#a78bfa', priority: 1 },
  heal: { label: '治疗', color: '#f472b6', priority: 2 },
  immunity: { label: '免疫', color: '#fbbf24', priority: 3 },
  summon: { label: '召唤', color: '#fb923c', priority: 4 },
  dot: { label: '持续', color: '#f87171', priority: 5 },
  shield: { label: '护盾', color: '#0a7f91', priority: 6 },
  attribute: { label: '属性', color: '#60a5fa', priority: 7 },
}

const UNCATEGORIZED = { label: '未分类', color: '#94a3b8', priority: 99 }

interface PassiveSkillGroup {
  category: string
  label: string
  color: string
  skills: SkillConfig[]
}

const groupedPassives = computed<PassiveSkillGroup[]>(() => {
  const passives = currentCharacter.value?.skills?.passive ?? []
  const groups = new Map<string, PassiveSkillGroup>()

  for (const skill of passives) {
    // 取首个分类为主分类，避免重复展示
    const primary = skill.passiveCategory?.[0]
    const cat = primary && CATEGORY_CONFIG[primary] ? primary : '__uncategorized__'
    if (!groups.has(cat)) {
      const cfg = CATEGORY_CONFIG[cat] ?? UNCATEGORIZED
      groups.set(cat, { category: cat, label: cfg.label, color: cfg.color, skills: [] })
    }
    groups.get(cat)!.skills.push(skill)
  }

  return [...groups.values()].sort((a, b) => {
    const pa = CATEGORY_CONFIG[a.category]?.priority ?? 99
    const pb = CATEGORY_CONFIG[b.category]?.priority ?? 99
    return pa - pb
  })
})

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
  return skill.skillType ? SkillTypeName[skill.skillType] : '未知';
};

const getStepTypeName = (stepType?: string): string => {
  return getStepTypeDisplayName(stepType);
};

const formatCalculation = (step: ExtendedSkillStep): string => {
  if (!step.calculation) return ''
  const parts: string[] = []
  // ponytail: 用 != null 而非 if(baseValue) 避免 baseValue=0 被跳过
  if (step.calculation.baseValue != null) parts.push(String(step.calculation.baseValue))
  if (step.calculation.extraValues) {
    for (const ev of step.calculation.extraValues) {
      const attrName = getAttrMeta(ev.attribute as ATTRIBUTE_CODE)?.displayName ?? ev.attribute
      parts.push(`${attrName}×${ev.ratio}`)
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
  const currentEnergy = currentCharacter.value?.getAttrVal(ATTRIBUTE_CODE.currentEnergy)?.value ?? 0;
  return (skill.energyCost || 0) === 0 || currentEnergy >= (skill.energyCost || 0);
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

/** 窗口失焦时重置 Alt 锁定并隐藏 tooltip，防止 altKeyHeld 卡住导致工具提示永不隐藏 */
const handleWindowBlur = () => {
  altKeyHeld.value = false
  if (attrTooltipHideTimer) { clearTimeout(attrTooltipHideTimer); attrTooltipHideTimer = null }
  attrTooltipVisible.value = false
  tooltipVisible.value = false
  tooltipContent.value = null
}

const attrTooltipData = ref<{
  title: string
  modifiers: Modifier[]
  finalValue: number
  valueType: AttributeValueType
  triggerRect: DOMRect | null
  displayText?: string
  rangeLayers?: RangeLayerData[]
  attributeCode?: string
}>({
  title: '',
  modifiers: [],
  finalValue: 0,
  valueType: AttributeValueType.VALUE,
  triggerRect: null
})

const showAttrTooltip = (event: MouseEvent, title: string, modifiers: Modifier[], finalValue: number, valueType: AttributeValueType, displayText?: string, rangeLayers?: RangeLayerData[], attributeCode?: string) => {
  if (attrTooltipHideTimer) { clearTimeout(attrTooltipHideTimer); attrTooltipHideTimer = null }
  attrTooltipData.value = {
    title,
    modifiers,
    finalValue,
    valueType,
    triggerRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
    displayText,
    rangeLayers,
    attributeCode,
  }
  attrTooltipVisible.value = true
}

const showAttrTooltipSimple = (event: MouseEvent, code: ATTRIBUTE_CODE) => {
  const meta = getAttrMeta(code)
  const title = meta?.displayName ?? code
  const valueType = meta?.isPercentage ? AttributeValueType.PERCENT : AttributeValueType.VALUE
  const defaultValue = getAttrDv(code)
  const attr = currentCharacter.value?.getAttrVal(code)
  showAttrTooltip(event, title, attr?.modifiers || [], attr?.value ?? defaultValue, valueType, undefined, undefined, code)
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

  const minAttr = char.getAttrVal(ATTRIBUTE_CODE.minAttack)
  const maxAttr = char.getAttrVal(ATTRIBUTE_CODE.maxAttack)
  if (!minAttr || !maxAttr) return

  const minMods = minAttr.modifiers
  const maxMods = maxAttr.modifiers

  const layers: RangeLayerData[] = [
    buildRangeLayer(ModifierTypeNames.ADDITIVE, minMods, maxMods, ModifierType.ADDITIVE),
    buildRangeLayer(ModifierTypeNames.PERCENTAGE, minMods, maxMods, ModifierType.PERCENTAGE),
    buildRangeLayer(ModifierTypeNames.MULTIPLICATIVE, minMods, maxMods, ModifierType.MULTIPLICATIVE),
    buildRangeLayer(ModifierTypeNames.FINAL, minMods, maxMods, ModifierType.FINAL),
  ]
  showAttrTooltip(
    event, '攻击力', [],
    attackRange.value.min, AttributeValueType.VALUE,
    `${attackRange.value.min}-${attackRange.value.max}`,
    layers,
  )
}

const hideAttrTooltip = () => {
  if (altKeyHeld.value) return
  attrTooltipHideTimer = setTimeout(() => {
    attrTooltipVisible.value = false
    attrTooltipHideTimer = null
  }, 300)
}

// Alt 键监听：按住时属性 tooltip 不隐藏
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleWindowBlur)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
  if (attrTooltipHideTimer) { clearTimeout(attrTooltipHideTimer); attrTooltipHideTimer = null }
})

</script>

<style scoped>
/* 显示层级过滤器 */
.tier-filters {
  display: flex;
  gap: 12px;
  padding: 4px 12px 8px;
  border-bottom: 1px solid var(--border-common-color-dark);
  margin-bottom: 4px;
}

.tier-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8em;
  color: rgba(var(--rgb-white), 0.65);
  cursor: pointer;
  user-select: none;
}

.tier-filter input[type="checkbox"] {
  accent-color: #0a7f91;
}

.skill-item {
  color: rgba(var(--rgb-white), 0.85);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
  cursor: pointer;
  border-left: 3px solid transparent;
}

.skill-item.passive {
  border-left-color: var(--color-border-default);
}

.skill-item:hover {
  /* ponytail: uses --color-energy (#0a7f91) with opacity; no token for 10% bg */
  background: rgba(var(--rgb-energy), var(--alpha-wash));
  /* ponytail: glow uses --color-energy with opacity */
  box-shadow: 0 0 8px var(--border-debug-color);
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
  font-weight: var(--font-weight-semibold);
  color: var(--color-info);
  margin-bottom: var(--space-1);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.category-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.category-count {
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-normal);
  text-transform: none;
}

.skill-items {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-left: var(--space-2);
}
</style>

<style>
/**
 * 技能悬浮提示样式（全局样式，用于Teleport渲染的内容）
 */
.skill-tooltip {
  position: fixed;
  z-index: var(--z-tooltip);
  min-width: 280px;
  max-width: 360px;
  padding: var(--space-3) var(--space-4);
  background: var(--color-overlay-panel);
  border: 1px solid var(--border-common-color-dark);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(var(--rgb-black), var(--alpha-glow)), 0 0 16px var(--border-common-color-dark);
  backdrop-filter: blur(12px);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  line-height: var(--line-height-md);
  color: rgba(var(--rgb-white), 0.85);
  pointer-events: none;
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-common-color-dark);
}

.tooltip-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-energy);
  text-shadow: 0 0 8px rgba(var(--rgb-energy), 0.4);
}

.tooltip-type {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tooltip-type.active {
  background: var(--border-common-color-dark);
  color: var(--color-info);
}

.tooltip-type.passive {
  background: rgba(var(--rgb-energy), var(--alpha-wash-strong));
  color: var(--color-energy);
}

.tooltip-type.ultimate {
  background: rgba(var(--rgb-live), var(--alpha-wash-strong));
  color: var(--color-warning);
}

.tooltip-description {
  color: rgba(var(--rgb-white), 0.75);
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
  background: var(--border-common-color-dark);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-common-color-dark);
}

.tooltip-stats .stat-label {
  color: rgba(var(--rgb-white), var(--alpha-glow));
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tooltip-stats .stat-value {
  color: var(--color-energy);
  font-weight: var(--font-weight-medium);
}

.tooltip-effects {
  margin-bottom: var(--space-3);
}

.effects-title {
  color: rgba(var(--rgb-white), var(--alpha-glow));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--border-common-color-dark);
}

.effect-item {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-1) 0;
}

.effect-type {
  padding: var(--space-1) var(--space-1);
  background: --border-debug-color-dark;
  border-radius: var(--radius-sm);
  color: var(--color-energy);
  font-weight: var(--font-weight-medium);
}

.effect-formula {
  color: rgba(var(--rgb-white), 0.7);
  font-family: 'JetBrains Mono', monospace;
}

.effect-scope {
  color: var(--border-common-color-light);
}

.effect-duration {
  color: rgba(var(--rgb-live), 0.8);
}

.tooltip-condition {
  padding: var(--space-2);
  background: rgba(var(--rgb-live), var(--alpha-wash));
  border: 1px solid rgba(var(--rgb-live), var(--alpha-border));
  border-radius: var(--radius-sm);
}

.condition-label {
  color: var(--color-warning);
  margin-right: 6px;
}

.condition-value {
  color: rgba(var(--rgb-white), 0.7);
  font-family: 'JetBrains Mono', monospace;
}

/* 技能可用性状态 */
.tooltip-availability {
  margin-top: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  text-align: center;
  font-weight: var(--font-weight-medium);
}

.tooltip-availability.available {
  background: --border-debug-color-dark;
  color: var(--color-energy);
  border: 1px solid var(--border-debug-color);
}

.tooltip-availability.unavailable {
  background: rgba(var(--rgb-live), var(--alpha-wash));
  color: var(--color-warning);
  border: 1px solid rgba(var(--rgb-live), var(--alpha-border));
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