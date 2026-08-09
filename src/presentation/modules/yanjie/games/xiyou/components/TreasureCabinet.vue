<template>
  <section class="xy-cabinet xy-panel" aria-label="功能宝阁">
    <header class="xy-cabinet-head">
      <h2 class="xy-seal-title">{{ CURRENT_TAB.label }}</h2>
      <p class="xy-cabinet-sub">{{ CURRENT_TAB.sub }}</p>
    </header>

    <div class="xy-cabinet-body">
      <SceneMapPanel v-if="tab === 'map'" :regions="regions" :scenes="scenes" :current="current" @select="emit('select', $event)" />
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
import type { XiyouRegion, XiyouScene } from '../data/mock'
import CavePanel from './CavePanel.vue'
import CollectPanel from './CollectPanel.vue'
import CultivatePanel from './CultivatePanel.vue'
import EquipPanel from './EquipPanel.vue'
import MatePanel from './MatePanel.vue'
import PackPanel from './PackPanel.vue'
import QuestPanel from './QuestPanel.vue'
import SceneMapPanel from './SceneMapPanel.vue'

const props = defineProps<{
  tab: GroupTab
  regions: XiyouRegion[]
  scenes: XiyouScene[]
  current: XiyouScene | null
}>()
const emit = defineEmits<{ back: []; select: [scene: XiyouScene] }>()

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
</style>
