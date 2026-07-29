/**
 * 阵型系统类型定义
 */
export interface FormationSlot {
  index: number
  row: 'front' | 'back'
}

export interface FormationEffect {
  id: string
  condition: 'front' | 'back' | 'all'
  buffId: string
}

export interface FormationConfig {
  id: string
  name: string
  description: string
  maxSlots: number
  slots: FormationSlot[]
  effects: FormationEffect[]
  frontProtection?: boolean
}
