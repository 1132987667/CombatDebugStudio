<template>
  <section class="xy-cabinet xy-panel" aria-label="功能宝阁">
    <header class="xy-cabinet-head">
      <h2 class="xy-seal-title">{{ CURRENT_TAB.label }}</h2>
      <p class="xy-cabinet-sub">{{ CURRENT_TAB.sub }}</p>
    </header>

    <div class="xy-cabinet-body">
      <div v-if="tab === 'map'" class="xy-cabinet-scroll">
        <template v-if="current">
          <div class="xy-map-brief">
            <div class="xy-map-brief-top">
              <span class="xy-map-brief-name">{{ current.name }}</span>
              <span class="xy-map-brief-stars" aria-label="关卡星级">
                <svg v-for="i in current.maxStars" :key="i" viewBox="0 0 24 24" class="xy-star"
                  :class="{ on: i <= current.stars }" aria-hidden="true">
                  <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
                </svg>
              </span>
            </div>
            <div class="xy-map-brief-meta">
              <span class="xy-chip" :class="difficultyChip(current.difficulty)">{{ difficultyText(current.difficulty) }}</span>
              <span class="xy-map-brief-range">{{ current.range }}</span>
            </div>
            <p class="xy-map-brief-desc">{{ current.desc }}</p>
          </div>
        </template>
        <button type="button" class="xy-map-brief-open xy-ink-hover" @click="emit('open-map')">
          <svg viewBox="0 0 24 24" class="xy-map-brief-open-icon" aria-hidden="true">
            <path d="M5 3l7-2 7 2v18l-7 2-7-2V3zM12 1v20M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="xy-map-brief-open-text">展开降妖路引</span>
          <span class="xy-map-brief-open-sub">四域十六关 · 弹窗大地图</span>
        </button>
      </div>

      <PackPanel v-else-if="tab === 'pack'" />
      <CultivatePanel v-else-if="tab === 'cultivate'" />
      <EquipPanel v-else-if="tab === 'equip'" />
      <MatePanel v-else-if="tab === 'mate'" />
      <CollectPanel v-else-if="tab === 'collect'" />
      <QuestPanel v-else-if="tab === 'quest'" />
      <CavePanel v-else-if="tab === 'cave'" />

      <!-- 设置 -->
      <div v-else-if="tab === 'settings'" class="xy-cabinet-scroll xy-settings">
        <div class="xy-settings-group">
          <h3 class="xy-cabinet-cat-title">游戏</h3>
          <button type="button" class="xy-settings-row xy-ink-hover" @click="emit('back')">
            <span class="xy-settings-row-label">返回演劫台</span>
            <span class="xy-settings-row-hint">离开当前游戏，回到游戏大厅</span>
          </button>
        </div>
        <div class="xy-settings-group">
          <h3 class="xy-cabinet-cat-title">战斗</h3>
          <div class="xy-settings-row xy-settings-row--muted">
            <span class="xy-settings-row-label">自动战斗</span>
            <span class="xy-settings-row-hint">默认关闭</span>
          </div>
          <div class="xy-settings-row xy-settings-row--muted">
            <span class="xy-settings-row-label">战斗倍速</span>
            <span class="xy-settings-row-hint">1× / 2×</span>
          </div>
        </div>
        <div class="xy-settings-group">
          <h3 class="xy-cabinet-cat-title">音效</h3>
          <div class="xy-settings-row xy-settings-row--muted">
            <span class="xy-settings-row-label">音量</span>
            <span class="xy-settings-row-hint">框架占位，暂不可调</span>
          </div>
        </div>
        <div class="xy-settings-group">
          <h3 class="xy-cabinet-cat-title">关于</h3>
          <div class="xy-settings-row xy-settings-row--muted">
            <span class="xy-settings-row-label">版本</span>
            <span class="xy-settings-row-hint">斗战西游 0.2.0 · 框架展示</span>
          </div>
          <div class="xy-settings-row xy-settings-row--muted">
            <span class="xy-settings-row-label">养成系统</span>
            <span class="xy-settings-row-hint">25 个子系统 · 全部可点选</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GroupTab } from './FourAspectBar.vue'
import type { XiyouScene } from '../data/mock'
import CavePanel from './CavePanel.vue'
import CollectPanel from './CollectPanel.vue'
import CultivatePanel from './CultivatePanel.vue'
import EquipPanel from './EquipPanel.vue'
import MatePanel from './MatePanel.vue'
import PackPanel from './PackPanel.vue'
import QuestPanel from './QuestPanel.vue'

const props = defineProps<{
  tab: GroupTab
  current: XiyouScene | null
}>()
const emit = defineEmits<{ back: []; select: [scene: XiyouScene]; 'open-map': [] }>()

function difficultyText(d: XiyouScene['difficulty']): string {
  return { easy: '简单', normal: '普通', hard: '困难', hell: '极难' }[d]
}

function difficultyChip(d: XiyouScene['difficulty']): string {
  return { easy: 'xy-chip--jade', normal: 'xy-chip--muted', hard: 'xy-chip--seal', hell: 'xy-chip--gold' }[d]
}

const CURRENT_TAB = computed<{ label: string; sub: string }>(() => {
  const map: Record<GroupTab, { label: string; sub: string }> = {
    map: { label: '降妖路引', sub: '西游大地图 · 四域十六关' },
    pack: { label: '行囊', sub: '乾坤袋 · 背包 / 仓库 / 坊市' },
    cultivate: { label: '修行', sub: '问道长生 · 修为 / 功法 / 经脉 / 流派 / 神通' },
    equip: { label: '装备', sub: '兵器法宝 · 装备 / 法宝 / 坐骑' },
    mate: { label: '伙伴', sub: '结伴同行 · 伙伴 / 灵宠 / 缘分' },
    collect: { label: '收集', sub: '志怪录 · 图鉴 / 成就 / 称号' },
    quest: { label: '历练', sub: '云游四海 · 任务 / 签到 / 活动' },
    cave: { label: '洞府', sub: '修炼洞 · 炼丹 / 炼器 / 闭关 / 药园 / 百艺' },
    settings: { label: '设置', sub: '游戏 · 战斗 · 音效 · 关于' },
  }
  return map[props.tab]
})
</script>

<style scoped lang="scss">
.xy-cabinet {
  grid-area: cabinet;
  margin: var(--space-3) 0 var(--space-3) var(--space-3);
  padding: var(--space-4);
}

.xy-cabinet-head {
  flex-shrink: 0;
}

.xy-cabinet-sub {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-cabinet-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.xy-cabinet-scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.xy-cabinet-cat-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

/* ── 设置 ── */
.xy-settings-group {
  margin-bottom: var(--space-4);
}

.xy-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  color: var(--xy-ink-1);
}

.xy-settings-row--muted {
  cursor: default;
  opacity: 0.75;
}

.xy-settings-row-label {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
  flex-shrink: 0;
}

.xy-settings-row-hint {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

/* ── 路引简报（map tab） ── */
.xy-map-brief {
  padding: var(--space-3);
  margin-bottom: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
}

.xy-map-brief-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.xy-map-brief-name {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-map-brief-stars {
  display: inline-flex;
  gap: 2px;
  flex-shrink: 0;
}

.xy-map-brief-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.xy-map-brief-range {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-map-brief-desc {
  margin: 0;
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--xy-ink-3);
}

.xy-map-brief-open {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--xy-seal);
  border-radius: 2px;
  background: var(--xy-seal-soft);
  color: var(--xy-seal);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--xy-seal);
    color: #fff;
  }
}

.xy-map-brief-open-icon {
  width: 20px;
  height: 20px;
  margin-bottom: 2px;
}

.xy-map-brief-open-text {
  font-size: var(--font-size-md);
  letter-spacing: 2px;
}

.xy-map-brief-open-sub {
  font-size: var(--font-size-xxs);
  letter-spacing: 1px;
  opacity: 0.75;
}

.xy-star {
  width: 12px;
  height: 12px;
  color: var(--xy-ink-4);
  opacity: 0.4;

  &.on {
    color: var(--xy-gold);
    opacity: 1;
  }
}
</style>
