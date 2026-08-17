<template>
  <aside class="xy-roster xy-panel" aria-label="角色与行囊">
    <!-- 角色头：名字 / 等级 / 技能点 / 境界 / 流派 / 经验条 -->
    <div class="xy-row-card">
      <div class="xy-row-top">
        <span class="xy-row-name">{{ player.name }}</span>
      </div>
      <div class="xy-row-desc mt-2">
        <span class="xy-chip xy-chip--gold">金钱: {{ currency.copper }}</span>
      </div>
      <div class="xy-row-desc mt-2">
        <span class="xy-chip xy-chip--gold">Lv.{{ player.level }}</span>
        <span class="xy-roster-exp-text ml-2">经验 {{ player.exp }} / {{ expNeedText }}</span>
      </div>
      <div class="xy-row-desc mt-2">
        <span class="xy-roster-sp">技能点 {{ statPoints.available }}</span>
      </div>
    </div>

    <!-- 角色属性 · 50% -->
    <section class="xy-roster-half">
      <h4 class="xy-sec-title">角色属性</h4>
      <div class="xy-roster-scroll">
        <div class="xy-attr-grid">
          <div v-for="a in attrRows" :key="a.label" class="xy-attr-item">
            <span class="xy-attr-label">{{ a.label }}</span>
            <span class="xy-attr-value" :class="{ 'xy-attr-value--pct': a.pct }">{{ a.text }}</span>
          </div>
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
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { equipBonuses } from '../battle'
import { realms, schools } from '../xiyouData'
import PackItemCard from './PackItemCard.vue'

const emit = defineEmits<{ 'open-pack': [] }>()

const { player, statPoints, playerAttributes, battleSnapshot, currency } = storeToRefs(usePlayerStore())
const pack = usePackStore()

onMounted(() => {
  void pack.init()
})

/** 已穿戴装备加成（与 buildBattleTeams 注入战斗主角同口径，面板数值 = 基础 + 加点 + 装备） */
const gearBonus = computed(() => equipBonuses(pack.equippedStats(), battleSnapshot.value))

/** 当前境界 / 流派（首个解锁境界 / 已选流派，configs 配置驱动） */
const realm = computed(() => realms.find((r) => r.unlocked))
const school = computed(() => schools.find((s) => s.selected))

const expPct = computed(() => {
  const need = player.value.expNeed
  if (!need || !Number.isFinite(need)) return 100
  return Math.min(100, Math.round((player.value.exp / need) * 100))
})

const expNeedText = computed(() => (Number.isFinite(player.value.expNeed) ? player.value.expNeed : 'MAX'))

interface AttrRow {
  label: string
  text: string
  pct: boolean
}

/** 角色属性（playerStore 实时快照 + 已穿戴装备加成） */
const attrRows = computed<AttrRow[]>(() => {
  const val = (code: ATTRIBUTE_CODE): number =>
    (playerAttributes.value[code] ?? 0) + (gearBonus.value[code] ?? 0)
  const curHp = val(ATTRIBUTE_CODE.currentHealth)
  const maxHp = val(ATTRIBUTE_CODE.maxHealth)
  const curEn = val(ATTRIBUTE_CODE.currentEnergy)
  const maxEn = val(ATTRIBUTE_CODE.maxEnergy)
  const pct = (v: number): string => `${v}%`
  return [
    { label: '气血', text: `${curHp}/${maxHp}`, pct: false },
    { label: '能量', text: `${curEn}/${maxEn}`, pct: false },
    { label: '攻击', text: `${val(ATTRIBUTE_CODE.attack)}`, pct: false },
    { label: '防御', text: `${val(ATTRIBUTE_CODE.defense)}`, pct: false },
    { label: '速度', text: `${val(ATTRIBUTE_CODE.speed)}`, pct: false },
    { label: '暴击率', text: pct(val(ATTRIBUTE_CODE.critRate)), pct: true },
    { label: '暴击伤害', text: pct(val(ATTRIBUTE_CODE.critDamage)), pct: true },
    { label: '命中率', text: pct(val(ATTRIBUTE_CODE.hit)), pct: true },
    { label: '闪避率', text: pct(val(ATTRIBUTE_CODE.dodge)), pct: true },
  ]
})
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
