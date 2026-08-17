/**
 * 公共组件 barrel 导出
 *
 * 统一导入入口，使用方通过 `import { Button, Tabs } from '@/presentation/components'` 引用，
 * 保留 tree-shaking 能力，避免全局注册带来的命名空间污染与隐式依赖。
 */

// ── 基础控件 ──
export { default as Button } from './Button.vue'
export { default as NumericStepper } from './NumericStepper.vue'
export { default as ToggleSwitch } from './ToggleSwitch.vue'
export { default as RadioButtonGroup } from './RadioButtonGroup.vue'
export { default as Tabs } from './Tabs.vue'
export { default as SpeedSelector } from './SpeedSelector.vue'

// ── 表单 / 输入 ──
export { default as TacticalInput } from './TacticalInput.vue'
export { default as TacticalSelect } from './TacticalSelect.vue'

// ── 弹窗 / 浮层 ──
export { default as Dialog } from './Dialog.vue'
export { default as ConfirmDialog } from './ConfirmDialog.vue'
export { default as CompendiumDialog } from './CompendiumDialog.vue'

// ── 状态 / 反馈 ──
export { default as EmptyState } from './EmptyState.vue'
export { default as GlobalNotifications } from './GlobalNotifications.vue'

// ── 布局 / 导航 ──
export { default as ModuleHeader } from './ModuleHeader.vue'
export type { TabItem } from './Tabs.vue'

// ── 详情 / Tooltip ──
export { default as AttributeTooltip } from './AttributeTooltip.vue'
export { default as EntityTooltip } from './EntityTooltip.vue'
export { default as EnemyDetail } from './EnemyDetail.vue'
export { default as ItemDetail } from './ItemDetail.vue'
