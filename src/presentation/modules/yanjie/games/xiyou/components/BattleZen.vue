<template>
  <main class="xy-battle xy-panel" aria-label="战斗禅台">
    <!-- 顶部：场景与敌情 -->
    <header class="xy-battle-head">
      <h2 class="xy-battle-scene">{{ scene.name }}</h2>
      <p class="xy-battle-meta">难度：{{ difficultyText(scene.difficulty) }} ｜ {{ scene.range }}</p>
      <div class="xy-battle-scale" aria-label="战斗规模">
        <span class="xy-battle-scale-tag xy-battle-scale-tag--player">我方 {{ partySize(playerParty) }} 人</span>
        <span class="xy-battle-scale-vs">斗</span>
        <span class="xy-battle-scale-tag xy-battle-scale-tag--enemy">敌方 {{ enemyParty.length }} 人</span>
      </div>
      <div class="xy-enemy-bubbles" role="list" aria-label="可能出现的敌人">
        <span v-for="e in scene.enemies" :key="e.name" class="xy-enemy-bubble xy-ink-hover" role="listitem">
          <span class="xy-enemy-name">{{ e.name }}</span>
          <span class="xy-enemy-level">[{{ e.level }}]</span>
        </span>
      </div>
    </header>

    <!-- 中上部：4v4 气血能量（敌方一行 / 我方一行） -->
    <div class="xy-vitals">
      <div class="xy-vitals-row xy-vitals-row--enemy" role="list" aria-label="敌方阵容">
        <VitalBar v-for="c in enemyParty" :key="c.id" :hp="c.hp" :max-hp="c.maxHp"
          :energy="c.energy" :max-energy="c.maxEnergy" side="enemy" :label="c.name"
          :class="{ 'xy-vital-card--down': c.down }" />
      </div>

      <span class="xy-vs" aria-hidden="true">斗</span>

      <div class="xy-vitals-row xy-vitals-row--player" role="list" aria-label="我方阵容">
        <VitalBar v-for="c in playerParty" :key="c.id" :hp="c.hp" :max-hp="c.maxHp"
          :energy="c.energy" :max-energy="c.maxEnergy" side="player" :label="c.name"
          :class="{ 'xy-vital-card--down': c.down }" />
      </div>
    </div>

    <!-- 战况状态行：回合 / 行动顺序 / 生效状态 -->
    <div class="xy-battle-status">
      <div class="xy-battle-status-row">
        <span class="xy-battle-round">第 3 回合</span>
        <span class="xy-chip xy-chip--gold">自动战斗 · 已开启</span>
      </div>
      <div class="xy-battle-order" role="img" aria-label="行动顺序">
        <span class="xy-order-tag xy-order-tag--player">我方先锋 {{ leadPlayer.name }} · 速 {{ leadPlayer.speed }}</span>
        <span class="xy-order-bar"><span class="xy-order-bar-fill" style="width: 82%"></span></span>
        <span class="xy-order-tag xy-order-tag--enemy">敌方先锋 {{ leadEnemy.name }} · 速 {{ leadEnemy.speed }}</span>
      </div>
      <div class="xy-battle-buffs">
        <span v-for="b in battleBuffs" :key="b.name" class="xy-buff-tag" :class="`xy-buff-tag--${b.kind}`">
          {{ b.name }}
        </span>
      </div>
    </div>

    <!-- 中部：技能灵台 -->
    <SkillAltar />

    <!-- 底部：战斗心经（战斗日志） -->
    <BattleSutra :logs="battleLogs" />
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { battleLogs, buildEnemyParty, playerParty, type XiyouScene } from '../data/mock'
import BattleSutra from './BattleSutra.vue'
import SkillAltar from './SkillAltar.vue'
import VitalBar from './VitalBar.vue'

const props = defineProps<{ scene: XiyouScene }>()

/** 敌方阵容：取场景敌人至多 4 个 */
const enemyParty = computed(() => buildEnemyParty(props.scene.enemies))

/** 我方先锋（速度最快） */
const leadPlayer = computed(() => [...playerParty].sort((a, b) => b.speed - a.speed)[0])

/** 敌方先锋（速度最快） */
const leadEnemy = computed(() => [...enemyParty.value].sort((a, b) => b.speed - a.speed)[0])

/** 生效状态（展示用，数据纯静态） */
const battleBuffs = computed(() => [
  { name: '全队攻击 +30%', kind: 'atk' },
  { name: '孙小圣 速度 +40%', kind: 'spd' },
  { name: `${leadEnemy.value.name} 减速 -20%`, kind: 'debuff' },
])

function difficultyText(d: XiyouScene['difficulty']): string {
  return { easy: '简单', normal: '普通', hard: '困难', hell: '极难' }[d]
}

function partySize(party: typeof playerParty): number {
  return party.length
}
</script>

<style scoped lang="scss">
.xy-battle {
  grid-area: zen;
  margin: var(--space-3);
  padding: var(--space-4);
}

.xy-battle-head {
  flex-shrink: 0;
  text-align: center;
  border-bottom: 1px solid var(--xy-ink-line);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-4);
}

.xy-battle-scene {
  margin: 0 0 var(--space-1);
  font-family: var(--xy-font-title);
  font-size: var(--font-size-xxl);
  letter-spacing: 6px;
  color: var(--xy-ink-1);
}

.xy-battle-meta {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-battle-scale {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.xy-battle-scale-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  font-size: var(--font-size-md);
  letter-spacing: 1px;

  &--player {
    color: var(--xy-jade);
    border-color: rgba(var(--rgb-success), var(--alpha-border));
  }

  &--enemy {
    color: var(--xy-seal);
    border-color: rgba(var(--rgb-brand-red), var(--alpha-border));
  }
}

.xy-battle-scale-vs {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  color: var(--xy-ink-4);
}

.xy-enemy-bubbles {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.xy-enemy-bubble {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 999px;
  background: var(--xy-paper-warm);
  cursor: pointer;
}

.xy-enemy-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-enemy-level {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

/* 4v4 双行阵容：敌方一行在上、我方一行在下 */
.xy-vitals {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.xy-vitals-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);

  &--enemy {
    grid-template-columns: repeat(4, 1fr);
  }
}

.xy-vs {
  align-self: center;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 4px;
  color: var(--xy-seal);
  line-height: 1;
}

.xy-vital-card--down {
  opacity: 0.4;
}

.xy-battle-status {
  flex-shrink: 0;
  padding: var(--space-3) 0;
  margin-bottom: var(--space-3);
  border-top: 1px dashed var(--xy-ink-line);
  border-bottom: 1px dashed var(--xy-ink-line);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-battle-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.xy-battle-round {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  letter-spacing: 3px;
  color: var(--xy-seal);
}

.xy-battle-order {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-order-tag {
  flex-shrink: 0;
  font-size: var(--font-size-md);
  white-space: nowrap;

  &--player {
    color: var(--xy-jade);
  }

  &--enemy {
    color: var(--xy-seal);
  }
}

.xy-order-bar {
  flex: 1;
  height: 6px;
  background: var(--color-bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.xy-order-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--xy-jade), var(--color-skill-active));
  border-radius: 3px;
}

.xy-battle-buffs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.xy-buff-tag {
  padding: 1px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: var(--radius-full);
  font-size: var(--font-size-md);

  &--atk {
    color: var(--color-skill-active);
    border-color: rgba(var(--rgb-skill-active), var(--alpha-border));
  }

  &--spd {
    color: var(--xy-jade);
    border-color: rgba(var(--rgb-success), var(--alpha-border));
  }

  &--debuff {
    color: var(--color-debuff);
    border-color: rgba(var(--rgb-debuff), var(--alpha-border));
  }
}
</style>
