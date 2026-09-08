/** Tabs 页签条目（独立 .ts：strict typecheck 不编译 .vue，类型导出需落在 ts 文件） */
export interface TabItem {
  /** 页签唯一标识，同时作为内容插槽名 */
  id: string
  /** 显示文本 */
  label: string
  /** 计数徽章（定义即显示，含 0）；数值变化时触发弹跳动画 */
  count?: number
  /** 禁用该页签（点击与键盘导航均跳过） */
  disabled?: boolean
}
