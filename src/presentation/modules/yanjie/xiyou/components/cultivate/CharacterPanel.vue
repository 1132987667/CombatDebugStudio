<template>
  <div class="xy-character-panel">
    <!-- 左列：属性面板（吃剩余宽度，属性网格双列铺开） -->
    <div class="xy-col xy-col--main">
      <section class="xy-section">
        <h4 class="xy-sec-title">
          属性面板<span class="xy-sec-count">已激活 {{ attrActiveCount }} / {{ attrTotal }} 项</span>
        </h4>

        <div class="xy-attr-group">
          <p class="xy-attr-sub">基础属性</p>
          <div class="xy-attr-grid" @mouseleave="hideAttrTooltip">
            <div class="xy-attr-item" @mouseenter="showAttrTooltip($event, ATTRIBUTE_CODE.maxHealth, attrVal(ATTRIBUTE_CODE.maxHealth))" @mousemove="updateTooltipPosition">
              <span class="xy-attr-label">气血</span>
              <span class="xy-attr-value">{{ hpText }}</span>
            </div>
            <div class="xy-attr-item" @mouseenter="showAttrTooltip($event, ATTRIBUTE_CODE.maxEnergy, attrVal(ATTRIBUTE_CODE.maxEnergy))" @mousemove="updateTooltipPosition">
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
              <button type="button" class="xy-attr-sub xy-attr-sub--minor xy-attr-sub--toggle" :aria-expanded="expandedGroups.has(group.key)"
                @click="toggleGroup(group.key)">
                <span class="xy-attr-caret xy-attr-caret--minor" :class="{ 'xy-attr-caret--open': expandedGroups.has(group.key) }" aria-hidden="true"></span>
                <span>{{ group.label }}</span>
                <span class="xy-sec-count">{{ group.attrs.length }} 项</span>
              </button>
              <div v-if="expandedGroups.has(group.key)" class="xy-attr-grid" @mouseleave="hideAttrTooltip">
                <div class="xy-attr-item" v-for="item in group.attrs" :key="item.code"
                  @mouseenter="showAttrTooltip($event, item.code, attrVal(item.code))" @mousemove="updateTooltipPosition">
                  <span class="xy-attr-label">{{ item.displayName }}</span>
                  <span class="xy-attr-value" :class="valueClass(item)">{{ attrText(item) }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>

    <!-- 右列：角色卡 + 加点 + 等级突破 -->
    <div class="xy-col xy-col--side">
      <section class="xy-section xy-char-header">
        <div class="xy-char-name-row">
          <span class="xy-char-name">{{ player.name }}</span>
          <span class="xy-char-level">Lv.{{ player.level }}</span>
        </div>
        <p class="xy-char-title">{{ player.title }}</p>
        <div class="xy-vital-bar" role="img" :aria-label="`气血 ${player.hp}/${player.maxHp}`">
          <div class="xy-vital-fill xy-vital-fill--hp" :style="{ width: hpPct + '%' }"></div>
          <span class="xy-vital-text">{{ player.hp }} / {{ player.maxHp }}</span>
        </div>
        <div class="xy-vital-bar" role="img" :aria-label="`法力 ${player.energy}/${player.maxEnergy}`">
          <div class="xy-vital-fill xy-vital-fill--energy" :style="{ width: energyPct + '%' }"></div>
          <span class="xy-vital-text">{{ player.energy }} / {{ player.maxEnergy }}</span>
        </div>
        <div class="xy-vital-bar xy-vital-bar--exp" role="img" :aria-label="`经验 ${player.exp}/${player.expNeed}`">
          <div class="xy-vital-fill xy-vital-fill--exp" :style="{ width: expPct + '%' }"></div>
          <span class="xy-vital-text">经验 {{ player.exp }} / {{ player.expNeed }}</span>
        </div>
        <div class="xy-char-meta">
          <span class="xy-coin">金钱 {{ currency.money }}</span>
          <span class="xy-coin">灵韵 {{ currency.xianyuan }}</span>
          <span class="xy-coin">流派 {{ currentSchoolName }}</span>
        </div>
      </section>

      <section class="xy-section">
        <h4 class="xy-sec-title">
          角色加点<span class="xy-sec-count" title="每次升级获得的自由属性点">可用属性点 <b class="xy-sec-count--num">{{ statPoints.available }}</b></span>
        </h4>
        <div class="xy-stat-list">
          <div class="xy-stat-row" v-for="stat in statList" :key="stat.key">
            <span class="xy-stat-label">{{ stat.label }}</span>
            <span class="xy-stat-desc">{{ stat.desc }}</span>
            <div class="xy-stat-ctrl">
              <button type="button" class="xy-stat-btn" :aria-label="`减少${stat.label}`" :disabled="statPoints[stat.key] <= 0" @click="decStat(stat.key)">−</button>
              <span class="xy-stat-val">{{ statPoints[stat.key] }}</span>
              <button type="button" class="xy-stat-btn xy-stat-btn--inc" :aria-label="`增加${stat.label}`" :disabled="statPoints.available <= 0" @click="incStat(stat.key)">＋</button>
            </div>
          </div>
        </div>
        <div class="xy-stat-actions">
          <button type="button" class="xy-btn xy-btn--primary" :disabled="usedPoints === 0" @click="applyStats">分配加点</button>
          <button type="button" class="xy-btn xy-btn--ghost" :disabled="usedPoints === 0" @click="resetStats">重置加点</button>
        </div>
      </section>

      <section class="xy-section">
        <h4 class="xy-sec-title">
          等级突破<span class="xy-sec-count">{{ breakNode ? `已完成 ${player.breakStage}/5 阶` : '五阶圆满' }}</span>
        </h4>
        <template v-if="breakNode">
          <p class="xy-break-desc">
            升至 <b>Lv.{{ breakNode.level }}</b> 需：突破丹·{{ breakNodeCn }} ×1（持有
            <span :class="{ 'xy-break-lack': breakPillCount < 1 }">{{ breakPillCount }}</span>）+ 金钱 {{ breakNode.money }}
          </p>
          <p v-if="!breakLevelReady" class="xy-break-desc">角色达到 Lv.{{ breakNode.level - 1 }} 且经验满溢后可突破。</p>
          <button type="button" class="xy-btn xy-btn--primary" :disabled="!canBreak" @click="doBreak">
            {{ breakLevelReady ? `突破·${breakNodeCn}` : '未达突破等级' }}
          </button>
        </template>
        <p v-else class="xy-break-desc">五阶突破已圆满，境界再无桎梏。</p>
      </section>
    </div>

    <AttributeTooltip :visible="attrTooltip.visible" :title="attrTooltip.title"
      :final-value="attrTooltip.finalValue" :value-type="attrTooltip.valueType"
      :trigger-rect="attrTooltip.triggerRect" :attribute-code="attrTooltip.attributeCode" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { playerConfig, BREAK_NODES, breakNodeLabel, nextBreakNode } from '../../playerProfile'
import { useCharacterAttrs } from '../../characterAttrs'
import { schools } from '../../xiyouData'

const notification = useNotificationStore()

const { player, currency, statPoints } = storeToRefs(usePlayerStore())
const pack = usePackStore()

const expPct = computed(() => (player.value.expNeed > 0 ? (player.value.exp / player.value.expNeed) * 100 : 0))
const hpPct = computed(() => (player.value.maxHp > 0 ? (player.value.hp / player.value.maxHp) * 100 : 0))
const energyPct = computed(() => (player.value.maxEnergy > 0 ? (player.value.energy / player.value.maxEnergy) * 100 : 0))

// 当前流派（schools 单例的 selected；新档未选流派时显式给出状态而非留白）
const currentSchoolName = computed(() => schools.find((s) => s.selected)?.name ?? '未选定')

/* ── 属性面板（对齐唤灵台「角色监控」：基础/进阶两层分组，元数据驱动 + 悬浮说明） ──
   派生逻辑抽至 characterAttrs.ts（与战斗侧栏 BattleRoster 共用同一口径） */
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
} = useCharacterAttrs({ expandAll: true })

// SAP 六维自由点（《玩家数值体系构建计划.md》D1）：转化率读 player.json statBonuses，展示不硬编码
const STAT_DEFS = [
  { key: 'hp', label: '气血', attr: 'maxHealth' },
  { key: 'atk', label: '攻击', attr: 'attack' },
  { key: 'def', label: '防御', attr: 'defense' },
  { key: 'hit', label: '命中', attr: 'hitValue' },
  { key: 'dodge', label: '闪避', attr: 'dodgeValue' },
  { key: 'speed', label: '速度', attr: 'speed' },
] as const

type StatKey = (typeof STAT_DEFS)[number]['key']

/** 每级自由点（player.json freePointsPerLevel） */
const freePointsPerLevel = playerConfig.freePointsPerLevel ?? 4

const statList = STAT_DEFS.map(({ key, label, attr }) => ({
  key,
  label,
  desc: `+${playerConfig.statBonuses[key]?.[attr] ?? 0}/点`,
}))

const usedPoints = computed(() => statList.reduce((sum, s) => sum + statPoints.value[s.key], 0))

function incStat(key: StatKey) {
  if (statPoints.value.available <= 0) return
  statPoints.value.available--
  statPoints.value[key]++
}

function decStat(key: StatKey) {
  if (statPoints.value[key] <= 0) return
  statPoints.value[key]--
  statPoints.value.available++
}

function applyStats() {
  notification.toast('加点已生效，属性已实时更新')
}

function resetStats() {
  if (!confirm('确认重置所有加点？')) return
  statList.forEach((s) => {
    statPoints.value.available += statPoints.value[s.key]
    statPoints.value[s.key] = 0
  })
}

// ═══ 等级突破（§20）：节点丹+金钱扣减在组件层完成，playerStore 不反向依赖 packStore ═══
const breakNode = computed(() => nextBreakNode(player.value.breakStage ?? 0))
const breakNodeCn = computed(() => (breakNode.value ? breakNodeLabel(breakNode.value.stage) : ''))
const breakPillCount = computed(() => (breakNode.value ? pack.countOf(breakNode.value.pillId) : 0))
const breakLevelReady = computed(() => !!breakNode.value && player.value.level >= breakNode.value.level - 1)
const canBreak = computed(
  () => !!breakNode.value && breakLevelReady.value && breakPillCount.value >= 1 && currency.value.money >= (breakNode.value?.money ?? 0),
)

function doBreak(): void {
  const node = breakNode.value
  if (!node || !canBreak.value) return
  pack.removeItem(node.pillId, 1)
  currency.value.money -= node.money
  usePlayerStore().setBreakStage(node.stage)
  notification.toast(`突破·${breakNodeCn.value}成功！解锁 Lv.${node.level}`, 'success')
}
</script>

<style scoped lang="scss">
.xy-character-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: var(--space-4);
  align-items: start;
  max-width: 1440px;
}

@media (max-width: 1280px) {
  .xy-character-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}

.xy-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.xy-char-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-char-name-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.xy-char-name {
  font-size: var(--font-size-xl);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-char-level {
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-char-title {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

/* 气血/法力/经验通用条：填充色区分语义（朱砂=气血、青绿=法力、鎏金细条=经验） */
.xy-vital-bar {
  position: relative;
  height: 18px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.xy-vital-fill {
  height: 100%;
  transition: width var(--transition-base);
}

.xy-vital-fill--hp {
  background: linear-gradient(90deg, var(--xy-seal), var(--xy-seal-soft));
}

.xy-vital-fill--energy {
  background: linear-gradient(90deg, var(--xy-jade), var(--xy-jade-soft));
}

.xy-vital-fill--exp {
  background: linear-gradient(90deg, var(--xy-gold), var(--xy-gold-soft));
}

.xy-vital-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
  text-shadow: 0 0 2px var(--xy-paper);
}

.xy-char-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.xy-break-desc {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);

  b {
    color: var(--xy-gold);
  }
}

.xy-break-lack {
  color: var(--xy-seal);
  font-weight: var(--font-weight-bold);
}

.xy-section {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
}

.xy-sec-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-sec-count {
  margin-left: auto;
  font-weight: var(--font-weight-regular);
  color: var(--xy-ink-4);
}

.xy-sec-count--num {
  font-weight: var(--font-weight-bold);
  color: var(--xy-gold);
}

/* 属性网格/分组折叠样式已上移 xiyou.scss（战斗侧栏共用），此处不再重复定义 */

/* 修行页宽栏专属：仅改列数——78 项收进一屏靠 auto-fill 5 列密排（188px 下限 = 最宽词条
   「对低血量目标伤害加成」实测宽，按栏宽自适应列数）；间距/行高全部继承 xiyou.scss 共用标准值，
   与全项目节奏一致。nowrap 防窄列下文字换行撑破行高；侧栏窄栏不受影响（保持 2 列） */
.xy-col--main {
  .xy-attr-grid {
    grid-template-columns: repeat(auto-fill, minmax(188px, 1fr));
  }

  .xy-attr-item {
    white-space: nowrap;
  }
}

.xy-stat-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-stat-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
}

.xy-stat-label {
  width: 48px;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-stat-desc {
  flex: 1;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-stat-ctrl {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.xy-stat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper-light);
  color: var(--xy-ink-1);
  cursor: pointer;
  font-size: var(--font-size-md);
  line-height: 1;

  &:hover:not(:disabled) {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.xy-stat-btn--inc:hover:not(:disabled) {
  background: var(--xy-seal-soft);
}

.xy-stat-val {
  width: 26px;
  text-align: center;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-gold);
}

.xy-stat-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.xy-btn {
  padding: var(--space-1) var(--space-4);
  border-radius: 2px;
  font-size: var(--font-size-md);
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.xy-btn--primary {
  border: 1px solid var(--xy-seal);
  background: var(--xy-seal);
  color: var(--xy-on-seal);
}

.xy-btn--ghost {
  border: 1px solid var(--xy-ink-line);
  background: transparent;
  color: var(--xy-ink-2);
}
</style>
