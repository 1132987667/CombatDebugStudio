<template>
  <aside class="xy-roster xy-panel" aria-label="角色与行囊">
    <!-- 常显概要条：金钱/经验/技能点是跨页签全局资源，任何页签下都可见 -->
    <div class="xy-row-card xy-roster-head">
      <div class="xy-roster-line">
        <span class="xy-row-name xy-roster-name">{{ player.name }}</span>
        <span class="xy-chip xy-chip--gold">金钱: {{ currency.money }}</span>
        <span class="xy-roster-sp">技能点 {{ statPoints.available }}</span>
      </div>
      <div class="xy-roster-line">
        <span class="xy-chip xy-chip--gold">Lv.{{ player.level }}</span>
        <div class="xy-progress xy-progress--gold xy-roster-exp" aria-label="经验进度">
          <div class="xy-progress-fill" :style="{ width: expPct }"></div>
        </div>
        <span class="xy-roster-exp-text">{{ player.exp }} / {{ expNeedText }}</span>
      </div>
    </div>

    <!-- 页签：场景（当前关卡敌情，战斗模块默认页）/ 属性 / 行囊 -->
    <nav class="xy-roster-tabs" role="tablist" aria-label="信息页签">
      <button v-for="t in TABS" :key="t.key" type="button" role="tab" class="xy-roster-tab"
        :class="{ 'xy-roster-tab--active': activeTab === t.key }" :aria-selected="activeTab === t.key"
        @click="activeTab = t.key">{{ t.label }}</button>
    </nav>

    <!-- 场景页签（自战斗面板头部迁入）：敌情掉落浮层弹出时不可被滚动容器裁剪 → 此页不设 overflow -->
    <div v-if="activeTab === 'scene'" class="xy-roster-pane xy-roster-pane--scene" role="tabpanel" aria-label="场景信息">
      <h4 class="xy-scene-title">
        {{ scene.name }}
        <span class="xy-scene-lv">Lv.{{ scene.levelRange?.[0] }}-{{ scene.levelRange?.[1] }}</span>
      </h4>
      <p class="xy-scene-desc">{{ scene.desc }}</p>
      <p v-if="scene.narrativeHook" class="xy-scene-hook">{{ scene.narrativeHook }}</p>
      <div class="xy-scene-drops" role="list" aria-label="敌人与掉落">
        <div v-for="e in scene.enemies" :key="e.name" class="xy-drop-row" role="listitem" tabindex="0">
          <span class="xy-drop-ename">
            <span class="xy-drop-name">{{ e.name }}</span>
            <span class="xy-drop-lv">Lv.{{ e.level }}</span>
          </span>
          <span class="xy-drop-pop" role="tooltip">
            <span v-for="d in dropsForEnemy(e.name)" :key="d.itemId" class="xy-drop-chip">
              <span class="xy-drop-chip-name">{{ itemName(d.itemId) }}<template v-if="d.quantity > 1">×{{ d.quantity
              }}</template></span>
              <span class="xy-pct" :class="pctClass(d.chance)">{{ Math.round(d.chance * 100) }}%</span>
            </span>
          </span>
        </div>
        <div v-if="scene.yaotu" class="xy-drop-row xy-drop-row--yaotu" role="listitem" tabindex="0">
          <span class="xy-drop-ename">
            <span class="xy-dot xy-dot--yaotu"></span>
            <span class="xy-drop-name">{{ scene.yaotu.name }}</span>
            <span class="xy-guard-tag">守护</span>
          </span>
          <span class="xy-drop-pop" role="tooltip">
            <span v-for="d in dropsForEnemy(scene.yaotu.name)" :key="d.itemId" class="xy-drop-chip">
              <span class="xy-drop-chip-name">{{ itemName(d.itemId) }}<template v-if="d.quantity > 1">×{{ d.quantity
              }}</template></span>
              <span class="xy-pct" :class="pctClass(d.chance)">{{ Math.round(d.chance * 100) }}%</span>
            </span>
          </span>
        </div>
        <div v-if="scene.drops?.materials?.length" class="xy-drop-row xy-drop-row--materials" role="listitem" tabindex="0">
          <span class="xy-drop-ename">
            <span class="xy-dot xy-dot--materials"></span>
            <span class="xy-drop-name">关卡必掉</span>
          </span>
          <span class="xy-drop-pop" role="tooltip">
            <span v-for="m in scene.drops.materials" :key="m" class="xy-drop-chip">
              <span class="xy-drop-chip-name">{{ itemName(m) }}</span>
              <span class="xy-pct xy-pct--main">必掉</span>
            </span>
          </span>
        </div>
        <!-- 场景掉落汇总：全敌人 + 守护者合并一眼总览（多来源概率合并，fabao 条目显示法宝名） -->
        <div v-if="dropSummary.merged.length" class="xy-drop-row xy-drop-row--summary" role="listitem" tabindex="0">
          <span class="xy-drop-ename">
            <span class="xy-dot xy-dot--summary"></span>
            <span class="xy-drop-name">掉落汇总</span>
          </span>
          <span class="xy-drop-pop" role="tooltip">
            <span v-for="m in dropSummary.materials" :key="'m-' + m" class="xy-drop-chip">
              <span class="xy-drop-chip-name">{{ itemName(m) }}</span>
              <span class="xy-pct xy-pct--main">必掉</span>
            </span>
            <span v-for="d in dropSummary.merged" :key="d.itemId" class="xy-drop-chip"
              :title="d.sources > 1 ? `${d.sources} 个来源独立判定，概率为至少掉一次的合并值` : undefined">
              <span class="xy-drop-chip-name">{{ dropName(d.itemId) }}<template v-if="d.quantity > 1">×{{ d.quantity
              }}</template></span>
              <span class="xy-pct" :class="pctClass(d.chance)">{{ Math.round(d.chance * 100) }}%</span>
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- 属性页签（与修行「角色」页同源同口径：characterAttrs 派生 + 基础/进阶分组 + 悬浮说明） -->
    <div v-else-if="activeTab === 'attrs'" class="xy-roster-pane" role="tabpanel" aria-label="角色属性">
      <div class="xy-attr-group">
        <p class="xy-attr-sub">基础属性<span class="xy-sec-count">已激活 {{ attrActiveCount }} / {{ attrTotal }} 项</span></p>
        <div class="xy-attr-grid" @mouseleave="hideAttrTooltip">
          <div class="xy-attr-item"
            @mouseenter="showAttrTooltip($event, ATTRIBUTE_CODE.maxHealth, attrVal(ATTRIBUTE_CODE.maxHealth))"
            @mousemove="updateTooltipPosition">
            <span class="xy-attr-label">气血</span>
            <span class="xy-attr-value">{{ hpText }}</span>
          </div>
          <div class="xy-attr-item"
            @mouseenter="showAttrTooltip($event, ATTRIBUTE_CODE.maxEnergy, attrVal(ATTRIBUTE_CODE.maxEnergy))"
            @mousemove="updateTooltipPosition">
            <span class="xy-attr-label">法力</span>
            <span class="xy-attr-value">{{ energyText }}</span>
          </div>
          <div class="xy-attr-item" v-for="item in coreAttrs" :key="item.code"
            @mouseenter="showAttrTooltip($event, item.code, attrVal(item.code))" @mousemove="updateTooltipPosition">
            <span class="xy-attr-label">{{ item.displayName }}</span>
            <span class="xy-attr-value" :class="valueClass(item)">{{ attrText(item) }}</span>
          </div>
        </div>
      </div>

      <div class="xy-attr-group">
        <button type="button" class="xy-attr-sub xy-attr-sub--toggle" :aria-expanded="advancedExpanded"
          @click="advancedExpanded = !advancedExpanded">
          <span class="xy-attr-caret" :class="{ 'xy-attr-caret--open': advancedExpanded }" aria-hidden="true"></span>
          <span>进阶属性</span>
          <span class="xy-sec-count">共 {{ advancedCount }} 项</span>
        </button>
        <template v-if="advancedExpanded">
          <div v-for="group in advancedGroupList" :key="group.key" class="xy-attr-sub-group">
            <button type="button" class="xy-attr-sub xy-attr-sub--minor xy-attr-sub--toggle"
              :aria-expanded="expandedGroups.has(group.key)" @click="toggleGroup(group.key)">
              <span class="xy-attr-caret xy-attr-caret--minor"
                :class="{ 'xy-attr-caret--open': expandedGroups.has(group.key) }" aria-hidden="true"></span>
              <span>{{ group.label }}</span>
              <span class="xy-sec-count">{{ group.attrs.length }} 项</span>
            </button>
            <div v-if="expandedGroups.has(group.key)" class="xy-attr-grid" @mouseleave="hideAttrTooltip">
              <div class="xy-attr-item" v-for="item in group.attrs" :key="item.code"
                @mouseenter="showAttrTooltip($event, item.code, attrVal(item.code))"
                @mousemove="updateTooltipPosition">
                <span class="xy-attr-label">{{ item.displayName }}</span>
                <span class="xy-attr-value" :class="valueClass(item)">{{ attrText(item) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 行囊页签 -->
    <div v-else class="xy-roster-pane" role="tabpanel" aria-label="行囊">
      <h4 class="xy-sec-title xy-roster-pack-title">行囊
        <Button size="small" variant="ghost" class="xy-roster-pack-more" @click="emit('open-pack')">打开完整行囊</Button>
      </h4>
      <div class="xy-roster-pack-list">
        <PackItemCard v-for="it in pack.ownedItems.slice(0, 10)" :key="it.id" :item="it"
          :count="pack.countOf(it.id)"
          @open="emit('open-pack')" @use="emit('open-pack')" @storage="emit('open-pack')"
          @discard="emit('open-pack')" @sell="emit('open-pack')" />
      </div>
    </div>

    <AttributeTooltip :visible="attrTooltip.visible" :title="attrTooltip.title"
      :modifiers="attrTooltip.modifiers"
      :final-value="attrTooltip.finalValue" :value-type="attrTooltip.valueType"
      :trigger-rect="attrTooltip.triggerRect" :attribute-code="attrTooltip.attributeCode" />
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import AttributeTooltip from '@/presentation/components/AttributeTooltip.vue'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { dropsForEnemy, sceneDropSummary } from '../battle'
import { itemName } from '../caveLogic'
import { fabaoDefById } from '../fabao'
import { useCharacterAttrs } from '../characterAttrs'
import type { XiyouScene } from '../types'
import PackItemCard from './PackItemCard.vue'

const props = defineProps<{ scene: XiyouScene }>()

const emit = defineEmits<{ 'open-pack': [] }>()

const { player, statPoints, currency } = storeToRefs(usePlayerStore())
const pack = usePackStore()

onMounted(() => {
  void pack.init()
})

const expNeedText = computed(() => (Number.isFinite(player.value.expNeed) ? player.value.expNeed : 'MAX'))

/** 经验条宽度（0-100%）：expNeed 非有限值（MAX）时充满 */
const expPct = computed(() => {
  const need = player.value.expNeed
  if (!Number.isFinite(need) || need <= 0) return '100%'
  return `${Math.min(100, Math.max(0, (player.value.exp / need) * 100))}%`
})

// ════════════ 页签 ════════════
const TABS = [
  { key: 'scene', label: '场景' },
  { key: 'attrs', label: '属性' },
  { key: 'pack', label: '行囊' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** 战斗模块默认看当前关卡敌情 → 默认场景页 */
const activeTab = ref<TabKey>('scene')

/** 场景掉落汇总（computed：全敌人 + 守护者 drops 合并；materials 必掉单列） */
const dropSummary = computed(() => sceneDropSummary(props.scene))

/** 掉落物品名：fabao_ 前缀条目不在物品目录，解析为「法宝·名/神器·名」（否则显示原始 id） */
function dropName(itemId: string): string {
  if (itemId.startsWith('fabao_')) {
    const def = fabaoDefById(itemId.slice('fabao_'.length))
    if (def) return `${def.kind === 'relic' ? '神器' : '法宝'}·${def.name}`
  }
  return itemName(itemId)
}

/** 掉落概率色阶：主掉落青 / 次掉落灰 / 稀有金（与 SceneMapDialog/路引同口径） */
function pctClass(chance: number): string {
  if (chance >= 0.35) return 'xy-pct--main'
  if (chance < 0.1) return 'xy-pct--rare'
  return 'xy-pct--minor'
}

// 角色属性（与修行「角色」页共用 characterAttrs 派生：基础/进阶分组 + 装备加成同口径）
const {
  coreAttrs,
  advancedGroupList,
  advancedExpanded,
  expandedGroups,
  toggleGroup,
  advancedCount,
  attrTotal,
  attrActiveCount,
  hpText,
  energyText,
  attrVal,
  attrText,
  valueClass,
  attrTooltip,
  showAttrTooltip,
  updateTooltipPosition,
  hideAttrTooltip,
} = useCharacterAttrs()
</script>

<style scoped lang="scss">
.xy-roster {
  grid-area: roster;
  margin: var(--space-3) 0 var(--space-3) var(--space-3);
}

/* ═══ 常显概要条：两行紧凑（名字+金钱+技能点 / 等级+经验条+经验值） ═══ */
.xy-roster-head {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-roster-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.xy-roster-sp {
  margin-left: auto;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
  white-space: nowrap;
}

.xy-roster-exp {
  flex: 1;
  min-width: 0;
}

.xy-roster-exp-text {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 角色头部：姓名题字楷体 + 印章方块（呼应 .xy-seal-title::after 的印章语言） */
.xy-roster-name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: 2px;

  &::after {
    content: '';
    width: 9px;
    height: 9px;
    flex-shrink: 0;
    background: var(--xy-seal);
    border-radius: 2px;
  }
}

/* ═══ 页签栏 ═══ */
.xy-roster-tabs {
  flex-shrink: 0;
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-2) 0;
  border-top: 1px solid var(--xy-ink-line);
}

.xy-roster-tab {
  padding: 3px var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: transparent;
  color: var(--xy-ink-3);
  font-family: inherit;
  font-size: var(--font-size-md);
  letter-spacing: 1px;
  cursor: pointer;

  &:hover {
    color: var(--xy-gold);
  }

  &--active {
    border-color: var(--xy-ink-line);
    border-bottom-color: transparent;
    background: var(--xy-paper-warm);
    color: var(--xy-gold);
  }
}

.xy-roster-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-2);
}

/* 场景页签：内容矮（标题+两行文案+敌情行）不滚动，掉落浮层弹出不被 overflow 裁剪 */
.xy-roster-pane--scene {
  overflow: visible;
}

/* ═══ 场景页签（自战斗面板头部迁入） ═══ */
.xy-scene-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-scene-lv {
  color: var(--xy-ink-3);
}

.xy-scene-desc {
  margin: var(--space-2) 0 0;
  line-height: var(--line-height-md);
  color: var(--xy-ink-2);
}

.xy-scene-hook {
  margin: var(--space-1) 0 0;
  padding-left: var(--space-2);
  border-left: 2px solid var(--xy-gold);
  color: var(--xy-ink-3);
}

.xy-scene-drops {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
  margin-top: var(--space-2);
}

.xy-drop-row {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);

  &:hover,
  &:focus-visible {
    background: var(--xy-paper-warm);
  }

  &:hover .xy-drop-name,
  &:focus-visible .xy-drop-name {
    color: var(--xy-gold);
  }
}

.xy-drop-ename {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  min-width: 0;
  cursor: pointer;
}

.xy-drop-name {
  color: var(--xy-ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.xy-drop-lv {
  color: var(--xy-seal);
  white-space: nowrap;
}

/* 掉落浮层：默认隐藏，行 hover / focus-within 时弹出。
   锚定敌情列表正下方（相对列表容器），横向不超出面板；不同徽章的浮层同位互斥切换 */
.xy-drop-pop {
  position: absolute;
  left: 0;
  top: calc(100% + var(--space-1));
  z-index: 30;
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  width: max-content;
  max-width: 100%;
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-sm);
  background: var(--xy-paper-light);
  box-shadow: 0 4px 12px rgba(var(--rgb-black), 0.3);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
  pointer-events: none;
}

.xy-scene-drops {
  position: relative;
}

.xy-drop-row:hover .xy-drop-pop,
.xy-drop-row:focus-within .xy-drop-pop {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.xy-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &--yaotu {
    background: var(--xy-gold);
  }

  &--materials {
    background: var(--xy-jade);
  }

  &--summary {
    background: var(--xy-gold);
  }
}

.xy-drop-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 1px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  background: var(--xy-paper-warm);
  color: var(--xy-ink-2);
  white-space: nowrap;
}

.xy-drop-chip-name {
  color: var(--xy-ink-2);
}

.xy-pct {
  &--main {
    color: var(--xy-jade);
  }

  &--minor {
    color: var(--xy-ink-4);
  }

  &--rare {
    color: var(--xy-gold);
  }
}

.xy-drop-row--yaotu .xy-drop-name,
.xy-drop-row--summary .xy-drop-name {
  color: var(--xy-gold);
}

.xy-guard-tag {
  color: var(--xy-gold);
  border: 1px solid rgba(var(--rgb-warning), var(--alpha-border));
  background: var(--xy-gold-soft);
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

/* ═══ 行囊页签 ═══ */
.xy-roster-pack-title {
  display: flex;
  align-items: center;
  margin: 0 0 var(--space-2);
}

/* 卡片两列网格 + 四周留白：hover 外圈阴影（6px ring + 上移 4px）超出滚动容器 overflow 裁剪边界，
   留出 padding 让阴影在 padding 区域内完整显示（上下 14px / 左右 12px，各留 4px+ 余量） */
.xy-roster-pack-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
  padding: 14px var(--space-3);
}

.xy-roster-pack-more {
  margin-left: auto;
}
</style>
