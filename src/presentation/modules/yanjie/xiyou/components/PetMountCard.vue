<template>
  <article
    class="xy-beast-card"
    :class="[`xy-beast-card--q${inst.quality}`, { 'is-active': inst.active }, cardSkinClass()]"
  >
    <header class="xy-beast-card__head">
      <span class="xy-beast-card__name" :class="equipQualityClass(inst.quality)">{{ name }}</span>
      <span class="xy-chip xy-beast-card__quality" :class="equipQualityClass(inst.quality)">{{ qualityName(inst.quality) }}</span>
      <span v-if="inst.active" class="xy-chip xy-chip--gold">出战</span>
      <span class="xy-beast-card__lv">Lv.{{ inst.level }}/{{ PET_MAX_LEVEL }}</span>
    </header>

    <div class="xy-beast-card__stats">
      <span v-for="s in stats" :key="s.attr" class="xy-beast-card__stat">
        <span class="xy-beast-card__stat-label">{{ s.label }}</span>
        <span class="xy-beast-card__stat-value">+{{ s.value }}</span>
      </span>
    </div>

    <div class="xy-beast-card__grow">
      <div class="xy-progress" :title="`经验 ${expText}`">
        <div class="xy-progress-fill" :style="{ width: expPercent }" />
      </div>
      <div class="xy-progress xy-progress--gold" :title="`资质 ${inst.aptitude}/${APTITUDE_CAP}`">
        <div class="xy-progress-fill" :style="{ width: aptPercent }" />
      </div>
      <div class="xy-beast-card__meta">
        <span>{{ expText }}</span>
        <span>资质 {{ inst.aptitude }}/{{ APTITUDE_CAP }}</span>
        <span class="xy-beast-card__dots" :title="`突破 ${inst.breakthroughs}/${BREAKTHROUGH_STAGES.length}`">
          <i v-for="n in BREAKTHROUGH_STAGES.length" :key="n" :class="{ on: n <= inst.breakthroughs }" />
        </span>
      </div>
    </div>

    <p v-if="inst.trait" class="xy-beast-card__trait">{{ inst.trait }}</p>

    <footer v-if="!preview" class="xy-beast-card__ops">
      <button type="button" class="xy-shop-buy" @click="toggle">
        {{ inst.active ? '歇战' : '出战' }}
      </button>
      <button v-if="inst.level < PET_MAX_LEVEL" type="button" class="xy-shop-buy" @click="feed">
        经验丹(+500)
      </button>
      <button v-if="inst.aptitude < APTITUDE_CAP" type="button" class="xy-shop-buy" @click="raiseApt">
        资质丹(+2)
      </button>
      <button v-if="inst.breakthroughs < BREAKTHROUGH_STAGES.length" type="button" class="xy-shop-buy" @click="brk">
        突破
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  APTITUDE_CAP,
  BREAKTHROUGH_STAGES,
  PET_MAX_LEVEL,
  breakthrough,
  feedExpPill,
  raiseAptitude,
  setPetMountActive,
  petExpNeed,
  petMountStats,
  individualById,
  type PetMountInstance,
  type PetMountKind,
} from '../petMount'
import { equipQualityClass, qualityName } from '../quality'
import { PLAYER_BASE_ATTR_LABELS } from '@/domain/fengshen/player-config'
import { cardSkinClass } from '../cardSkin'

const props = defineProps<{
  /** 实例（petMountState 权威数据；预览模式可传假实例） */
  inst: PetMountInstance
  /** 类别：宠物/坐骑（决定养成操作与掉落池分组） */
  kind: PetMountKind
  /** 预览模式：只展示不渲染养成操作（调试「样式」实验室用） */
  preview?: boolean
}>()

const name = computed(() => individualById(props.inst.individualId)?.name ?? props.inst.individualId)

/** 主要 3 条伴战属性（§22.12 宠物=输出组 / 坐骑=防御组，weights 个体已分好） */
const stats = computed(() =>
  petMountStats(props.inst).map((s) => ({
    attr: s.attr,
    label: PLAYER_BASE_ATTR_LABELS[s.attr as keyof typeof PLAYER_BASE_ATTR_LABELS] ?? s.attr,
    value: s.value,
  })),
)

const expText = computed(() =>
  props.inst.level >= PET_MAX_LEVEL ? '已满级' : `经验 ${props.inst.exp}/${petExpNeed(props.inst.level)}`,
)

const expPercent = computed(() =>
  props.inst.level >= PET_MAX_LEVEL
    ? '100%'
    : `${Math.min(100, (props.inst.exp / petExpNeed(props.inst.level)) * 100).toFixed(1)}%`,
)

const aptPercent = computed(() => `${(props.inst.aptitude / APTITUDE_CAP) * 100}%`)

function toggle(): void {
  setPetMountActive(props.kind, props.inst.uid)
}

function feed(): void {
  feedExpPill(props.kind, props.inst.uid)
}

function raiseApt(): void {
  raiseAptitude(props.kind, props.inst.uid)
}

function brk(): void {
  breakthrough(props.kind, props.inst.uid)
}
</script>

<style scoped lang="scss">
@use '@/presentation/styles/mixins' as *;

/* 个体卡片：对齐 xy-gear-slot 视觉范式（品质色 2px 描边 + 双点底纹 + hover 上浮外圈） */
.xy-beast-card {
  --q-color: var(--xy-ink-line);
  --ring: var(--q-color);
  --glow: color-mix(in srgb, var(--q-color) 40%, transparent);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 2px solid var(--q-color);
  border-radius: 2px;
  color: var(--xy-ink-1);

  &::after {
    @include mixin-bg-dual-dots();
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 0 0 2px var(--xy-paper),
      0 0 0 4px var(--ring),
      0 0 34px var(--glow),
      0 22px 46px rgba(var(--rgb-black), 0.4);

    &::after {
      animation: dots-flow 6s linear infinite;
    }
  }

  /* 个体品质凡/精/超/绝/神 → 装备品质令牌（与品质字同源同色） */
  &--q1 { --q-color: var(--eq-q-1); }
  &--q2 { --q-color: var(--eq-q-2); }
  &--q3 { --q-color: var(--eq-q-3); }
  &--q4 { --q-color: var(--eq-q-4); }
  &--q5 { --q-color: var(--eq-q-5); }

  &.is-active {
    box-shadow:
      0 0 0 1px var(--xy-gold),
      0 0 18px color-mix(in srgb, var(--xy-gold) 30%, transparent);
  }
}

.xy-beast-card__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.xy-beast-card__name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
}

.xy-beast-card__quality {
  font-weight: var(--font-weight-bold);
}

.xy-beast-card__lv {
  margin-left: auto;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

/* 主要 3 条伴战属性：等宽三格，扫一眼即得成长重心 */
.xy-beast-card__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.xy-beast-card__stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
  font-size: var(--font-size-md);
}

.xy-beast-card__stat-label {
  color: var(--xy-ink-3);
}

.xy-beast-card__stat-value {
  font-weight: var(--font-weight-bold);
}

/* 成长区：经验（玉色）+ 资质（金色）双条 + 突破点 */
.xy-beast-card__grow {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.xy-beast-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);

  > span:last-child {
    margin-left: auto;
  }
}

/* 突破节点（10/30/50 级各 1 次）：实心=已完成 */
.xy-beast-card__dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;

  i {
    width: 7px;
    height: 7px;
    border: 1px solid var(--xy-gold);
    border-radius: 50%;

    &.on {
      background: var(--xy-gold);
    }
  }
}

.xy-beast-card__trait {
  margin: 0;
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--xy-seal);
}

.xy-beast-card__ops {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: auto;

  /* 卡内紧凑变体：四按钮尽量单行（全局 xy-shop-buy 的 space-3 横向内距在 360px 卡内放不下） */
  .xy-shop-buy {
    padding: var(--space-1) var(--space-2);
  }
}
</style>
