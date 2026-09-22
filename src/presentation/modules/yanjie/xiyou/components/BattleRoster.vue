<template>
  <aside class="xy-roster xy-panel" aria-label="角色与行囊">
    <!-- 角色头：名字 / 等级 / 技能点 / 境界 / 流派 / 经验条 -->
    <div class="xy-row-card">
      <div class="xy-row-top">
        <span class="xy-row-name">{{ player.name }}</span>
      </div>
      <div class="xy-row-desc mt-2">
        <span class="xy-chip xy-chip--gold">金钱: {{ currency.money }}</span>
      </div>
      <div class="xy-row-desc mt-2">
        <span class="xy-chip xy-chip--gold">Lv.{{ player.level }}</span>
        <span class="xy-roster-exp-text ml-2">经验 {{ player.exp }} / {{ expNeedText }}</span>
      </div>
      <div class="xy-row-desc mt-2">
        <span class="xy-roster-sp">技能点 {{ statPoints.available }}</span>
      </div>
    </div>

    <!-- 角色属性 · 50%（与修行「角色」页同源同口径：characterAttrs 派生 + 基础/进阶分组 + 悬浮说明） -->
    <section class="xy-roster-half">
      <h4 class="xy-sec-title">
        角色属性<span class="xy-sec-count">已激活 {{ attrActiveCount }} / {{ attrTotal }} 项</span>
      </h4>
      <div class="xy-roster-scroll">
        <div class="xy-attr-group">
          <p class="xy-attr-sub">基础属性</p>
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
    </section>

    <!-- 行囊 · 50% -->
    <section class="xy-roster-half">
      <h4 class="xy-sec-title">行囊
        <Button size="small" variant="ghost" class="xy-roster-pack-more" @click="emit('open-pack')">打开完整行囊</Button>
      </h4>
      <div class="xy-roster-scroll">
        <div class="xy-roster-pack-list">
          <PackItemCard v-for="it in pack.ownedItems.slice(0, 10)" :key="it.id" :item="it"
            :count="pack.countOf(it.id)"
            @open="emit('open-pack')" @use="emit('open-pack')" @storage="emit('open-pack')"
            @discard="emit('open-pack')" @sell="emit('open-pack')" />
        </div>
      </div>
    </section>

    <AttributeTooltip :visible="attrTooltip.visible" :title="attrTooltip.title"
      :final-value="attrTooltip.finalValue" :value-type="attrTooltip.valueType"
      :trigger-rect="attrTooltip.triggerRect" :attribute-code="attrTooltip.attributeCode" />
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import AttributeTooltip from '@/presentation/components/AttributeTooltip.vue'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useCharacterAttrs } from '../characterAttrs'
import PackItemCard from './PackItemCard.vue'

const emit = defineEmits<{ 'open-pack': [] }>()

const { player, statPoints, currency } = storeToRefs(usePlayerStore())
const pack = usePackStore()

onMounted(() => {
  void pack.init()
})

const expNeedText = computed(() => (Number.isFinite(player.value.expNeed) ? player.value.expNeed : 'MAX'))

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

.xy-roster-sp {
  margin-left: auto;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-roster-realm {
  margin-left: var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-roster-exp-text {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-roster-half {
  flex: 1 1 50%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--xy-ink-line);
  padding: var(--space-2);
}

.xy-roster-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: var(--space-1);
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
