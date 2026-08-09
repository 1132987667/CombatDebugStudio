/**
 * 战斗阵容预设 Store
 * 内置调试预设（configs/presets/battle_presets.json，不可改）；用户自定义预设经 localStorage 持久化，可在 UI 增删。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import builtinPresetsRaw from '@configs/presets/battle_presets.json'

export interface BattlePreset {
  id: string
  name: string
  description: string
  ally: string[]
  enemy: string[]
  /** 用户自定义（内置调试预设为 false） */
  custom?: boolean
}

const BUILTIN_PRESETS = builtinPresetsRaw as BattlePreset[]

const STORAGE_KEY = 'huanling.presets.custom.v1'

function loadCustom(): BattlePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const useBattlePresetStore = defineStore('battlePreset', () => {
  const customPresets = ref<BattlePreset[]>(loadCustom())

  const persist = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customPresets.value))
  }

  /** 将当前阵容保存为自定义预设 */
  const addPreset = (
    name: string,
    description: string,
    ally: string[],
    enemy: string[],
  ): BattlePreset | null => {
    if (!name.trim() || ally.length === 0 || enemy.length === 0) return null
    const preset: BattlePreset = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      ally,
      enemy,
      custom: true,
    }
    customPresets.value.push(preset)
    persist()
    return preset
  }

  const deletePreset = (id: string) => {
    const idx = customPresets.value.findIndex(p => p.id === id)
    if (idx >= 0) {
      customPresets.value.splice(idx, 1)
      persist()
    }
  }

  /** 全部预设（内置调试用例 + 用户自定义） */
  const allPresets = computed<BattlePreset[]>(() => [
    ...BUILTIN_PRESETS,
    ...customPresets.value,
  ])

  return { allPresets, customPresets, addPreset, deletePreset }
})
