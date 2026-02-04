// 快捷键动作类型
export type KeybindAction = 
  | 'attack'      // 普通攻击
  | 'skill'       // 技能
  | 'defend'      // 防御
  | 'item'        // 使用物品
  | 'escape'      // 取消/退出
  | 'menu'        // 打开菜单
  | 'pause'       // 暂停游戏
  | 'replay'      // 战斗回放
  | 'debug';      // 调试模式

// 快捷键配置接口
export interface KeybindConfig {
  [action: string]: string;
}

// 快捷键设置接口
export interface KeybindSetting {
  action: KeybindAction;
  key: string;
  defaultKey: string;
  description: string;
}

// 快捷键提示接口
export interface KeybindHint {
  action: string;
  key: string;
  description: string;
}
