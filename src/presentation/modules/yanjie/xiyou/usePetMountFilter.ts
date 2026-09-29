/**
 * usePetMountFilter.ts — 宠物/坐骑列表的词条筛选状态（EquipPanel 与 MatePanel 共用）
 *
 * 宠物与坐骑的属性池不同（宠物=输出组、坐骑=防御组），故两处各自持有一套条件与排序，
 * 切 tab 不会互相串用条件。属性行口径统一为 flat（宠物/坐骑属性均为固定值加成）。
 */
import { computed, ref } from 'vue'

import { individualById, petMountStats, type PetMountInstance } from './petMount'
import {
  collectStatOptions,
  filterStatTargets,
  makeStatTarget,
  sortStatTargets,
  type StatCondition,
  type StatSortKey,
} from './statFilter'

/**
 * 构造一份宠物/坐骑列表的筛选状态
 * @param list 实例来源（返回 petMountState.mounts / petMountState.pets；在 computed 内求值以建立响应依赖）
 */
export function usePetMountFilter(list: () => readonly PetMountInstance[]) {
  /** 筛选条件（会话级，不落存档） */
  const conditions = ref<StatCondition[]>([])
  /** 排序键（下标 0 主键 / 1 次键） */
  const sorts = ref<StatSortKey[]>([])

  /** 实例 + 属性投影（筛选/排序数据源） */
  const entries = computed(() =>
    list().map((inst) => ({
      inst,
      target: makeStatTarget({
        id: inst.uid,
        name: individualById(inst.individualId)?.name ?? inst.individualId,
        quality: inst.quality,
        rows: petMountStats(inst).map((s) => ({ attribute: s.attr, modifierType: 'flat' as const, value: s.value })),
      }),
    })),
  )

  /** 候选属性（只收录当前持有实例真实出现的属性） */
  const options = computed(() => collectStatOptions(entries.value.map((e) => e.target)))

  /** 已筛选 + 排序的实例列表（条件为空、无排序时保持原顺序） */
  const visible = computed<PetMountInstance[]>(() => {
    const targets = filterStatTargets(entries.value.map((e) => e.target), conditions.value)
    const ordered = sortStatTargets(targets, sorts.value)
    const instById = new Map(entries.value.map((e) => [e.target.id, e.inst]))
    return ordered.map((t) => instById.get(t.id)).filter((i): i is PetMountInstance => i !== undefined)
  })

  return { conditions, sorts, options, visible }
}