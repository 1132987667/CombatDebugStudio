<template>
  <div>
    <template v-if="gearInst && gearDef">
      <div class="xy-cave-star-info">
        <p class="xy-cave-card__desc">
          「{{ gearDisplayName(gearDef.name, star) }}」当前星级 {{ star }} / {{ STAR_MAX }}
          <span v-if="!maxed">· 升星后「{{ gearDef.name }} +{{ star + 1 }}」</span>
        </p>
        <div class="xy-cave-star-cost">
          <span class="xy-cave-mat" :class="{ 'is-low': fodderCount < fodderNeed }">
            同名装备 {{ fodderCount }} / {{ fodderNeed }}
            <span v-if="fodderCount < fodderNeed" class="xy-cave-mat__tag">不足</span>
          </span>
          <span class="xy-cave-card__desc">消耗背包内未穿戴的同名装备，1 件抵 1 点</span>
        </div>
        <div :class="{ 'xy-cave-ripple': rippling, 'xy-cave-shake': shaking }">
          <button type="button" class="xy-cave-action" :disabled="!canStar" @click="doStar">
            {{ maxed ? '已 满 星' : '升 星' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/** 升星操作区：选择由装备养成面板（CultivatePanel）共享，本组件只做升星（同名装备饲料消耗） */
import { computed, ref } from 'vue'
import { usePackStore } from '@/presentation/stores/packStore'
import { STAR_MAX, gearDisplayName, starCost } from '../../caveLogic'

const props = defineProps<{ instanceId: string | null }>()

const pack = usePackStore()

const rippling = ref(false)
const shaking = ref(false)

/** 养成目标实例 + 定义（星级持久化在实例；饲料按同名装备计，排除目标自身） */
const gearInst = computed(() => (props.instanceId ? pack.gearInstanceById(props.instanceId) : null))
const gearDef = computed(() => (gearInst.value ? pack.gearById(gearInst.value.itemId) : undefined))

const star = computed(() => gearInst.value?.star ?? 0)
const maxed = computed(() => gearInst.value !== null && star.value >= STAR_MAX)

const fodderNeed = computed(() => starCost(star.value + 1))
const fodderCount = computed(() =>
  gearInst.value ? pack.starFodderCount(gearInst.value.itemId, gearInst.value.instanceId) : 0,
)

const canStar = computed(() => gearInst.value !== null && !maxed.value && fodderCount.value >= fodderNeed.value)

function doStar(): void {
  const inst = gearInst.value
  if (!inst || !canStar.value) return

  if (!pack.starGear(inst.instanceId)) {
    shaking.value = true
    window.setTimeout(() => {
      shaking.value = false
    }, 400)
    return
  }
  rippling.value = true
  window.setTimeout(() => {
    rippling.value = false
  }, 700)
}
</script>
