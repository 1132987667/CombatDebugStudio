import { defineStore } from 'pinia'

interface DebugState {
  /** 当前选中的命中爆炸动画样式 */
  impactStyle: string
}

export const useDebugStore = defineStore('debug', {
  state: (): DebugState => ({
    impactStyle: 'slash',
  }),

  actions: {
    /**
     * 设置命中爆炸动画样式
     */
    setImpactStyle(style: string) {
      this.impactStyle = style
    },
  },
})
