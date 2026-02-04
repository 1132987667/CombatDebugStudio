import type { KeybindSetting, KeybindProfile, KeybindConflict } from '@/types/input';

export class KeybindManager {
  private keybinds: Map<string, string>;
  private defaultKeybinds: Map<string, string>;
  private keybindListeners: Map<string, Set<() => void>>;
  private isListening: boolean;
  private profiles: Map<string, KeybindProfile>;
  private currentProfile: string;
  private keybindHistory: Array<{action: string, oldKey: string, newKey: string, timestamp: number}>;

  constructor() {
    // 初始化默认快捷键（符合行业通用操作习惯）
    this.defaultKeybinds = new Map([
      // 战斗操作
      ['attack', 'z'],
      ['skill', 'x'],
      ['defend', 'c'],
      ['item', 'v'],
      ['ultimate', 'q'],
      ['combo', 'e'],
      
      // 移动和选择
      ['move_up', 'w'],
      ['move_down', 's'],
      ['move_left', 'a'],
      ['move_right', 'd'],
      ['select_target', 'tab'],
      
      // 系统操作
      ['escape', 'escape'],
      ['menu', 'm'],
      ['pause', 'p'],
      ['replay', 'r'],
      ['debug', 'f12'],
      
      // 界面操作
      ['inventory', 'i'],
      ['skills', 'k'],
      ['map', 'm'],
      ['quests', 'j'],
      
      // 调试功能
      ['step_forward', 'f5'],
      ['step_back', 'f6'],
      ['toggle_replay', 'f7'],
      ['save_snapshot', 'f8']
    ]);

    // 加载用户自定义快捷键或使用默认值
    this.keybinds = this.loadKeybinds();
    this.keybindListeners = new Map();
    this.isListening = false;
    this.profiles = new Map();
    this.currentProfile = 'default';
    this.keybindHistory = [];
    
    // 初始化预设配置
    this.initializeProfiles();
  }

  // 开始监听键盘事件
  public startListening() {
    if (this.isListening) return;

    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.isListening = true;
  }

  // 停止监听键盘事件
  public stopListening() {
    if (!this.isListening) return;

    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.isListening = false;
  }

  // 处理键盘按下事件
  private handleKeyDown(event: KeyboardEvent) {
    // 忽略在输入框中的按键
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const key = event.key.toLowerCase();
    const action = this.getKeybindAction(key);

    if (action) {
      event.preventDefault();
      this.triggerAction(action);
    }
  }

  // 根据按键获取对应的动作
  private getKeybindAction(key: string): string | null {
    for (const [action, bindKey] of this.keybinds.entries()) {
      if (bindKey === key) {
        return action;
      }
    }
    return null;
  }

  // 触发动作
  private triggerAction(action: string) {
    if (this.keybindListeners.has(action)) {
      const listeners = this.keybindListeners.get(action);
      if (listeners) {
        listeners.forEach(listener => listener());
      }
    }
  }

  // 注册动作监听器
  public onAction(action: string, listener: () => void): void {
    if (!this.keybindListeners.has(action)) {
      this.keybindListeners.set(action, new Set());
    }
    this.keybindListeners.get(action)?.add(listener);
  }

  // 移除动作监听器
  public offAction(action: string, listener: () => void): void {
    if (this.keybindListeners.has(action)) {
      this.keybindListeners.get(action)?.delete(listener);
    }
  }

  // 获取当前快捷键配置
  public getKeybinds(): Map<string, string> {
    return new Map(this.keybinds);
  }

  // 获取默认快捷键配置
  public getDefaultKeybinds(): Map<string, string> {
    return new Map(this.defaultKeybinds);
  }

  // 设置快捷键
  public setKeybind(action: string, key: string): boolean {
    // 检查是否有冲突
    for (const [existingAction, existingKey] of this.keybinds.entries()) {
      if (existingKey === key && existingAction !== action) {
        return false; // 冲突，设置失败
      }
    }

    this.keybinds.set(action, key);
    this.saveKeybinds();
    return true;
  }

  // 重置为默认快捷键
  public resetToDefaults(): void {
    this.keybinds = new Map(this.defaultKeybinds);
    this.saveKeybinds();
  }

  // 保存快捷键到本地存储
  private saveKeybinds(): void {
    const keybindsObject = Object.fromEntries(this.keybinds);
    localStorage.setItem('keybinds', JSON.stringify(keybindsObject));
  }

  // 从本地存储加载快捷键
  private loadKeybinds(): Map<string, string> {
    try {
      const savedKeybinds = localStorage.getItem(`keybinds_${this.currentProfile}`);
      if (savedKeybinds) {
        const parsedKeybinds = JSON.parse(savedKeybinds);
        const keybindsMap = new Map<string, string>();

        // 合并默认值和保存的值，确保所有动作都有绑定
        for (const [action, key] of this.defaultKeybinds.entries()) {
          keybindsMap.set(action, parsedKeybinds[action] || key);
        }

        return keybindsMap;
      }
    } catch (error) {
      console.error('Failed to load keybinds:', error);
    }

    return new Map(this.defaultKeybinds);
  }

  // 初始化预设配置
  private initializeProfiles(): void {
    // 默认配置（标准游戏操作）
    this.profiles.set('default', {
      id: 'default',
      name: '默认配置',
      description: '标准游戏操作配置，符合行业通用习惯',
      keybinds: new Map(this.defaultKeybinds),
      isDefault: true
    });

    // 专业玩家配置
    const proKeybinds = new Map(this.defaultKeybinds);
    proKeybinds.set('attack', 'mouse1');
    proKeybinds.set('skill', 'mouse2');
    proKeybinds.set('ultimate', 'space');
    proKeybinds.set('combo', 'shift');
    
    this.profiles.set('pro', {
      id: 'pro',
      name: '专业玩家配置',
      description: '优化操作效率，适合高级玩家',
      keybinds: proKeybinds,
      isDefault: false
    });

    // 左手配置
    const leftHandKeybinds = new Map(this.defaultKeybinds);
    leftHandKeybinds.set('move_up', 'i');
    leftHandKeybinds.set('move_down', 'k');
    leftHandKeybinds.set('move_left', 'j');
    leftHandKeybinds.set('move_right', 'l');
    leftHandKeybinds.set('attack', 'u');
    leftHandKeybinds.set('skill', 'o');
    
    this.profiles.set('left_hand', {
      id: 'left_hand',
      name: '左手配置',
      description: '适合左手操作的习惯',
      keybinds: leftHandKeybinds,
      isDefault: false
    });

    // 加载用户自定义配置
    this.loadUserProfiles();
  }

  // 加载用户自定义配置
  private loadUserProfiles(): void {
    try {
      const savedProfiles = localStorage.getItem('keybind_profiles');
      if (savedProfiles) {
        const parsedProfiles = JSON.parse(savedProfiles);
        parsedProfiles.forEach((profileData: any) => {
          const keybindsMap = new Map<string, string>(Object.entries(profileData.keybinds));
          this.profiles.set(profileData.id, {
            ...profileData,
            keybinds: keybindsMap
          });
        });
      }
    } catch (error) {
      console.error('Failed to load user profiles:', error);
    }
  }

  // 保存用户配置
  private saveUserProfiles(): void {
    const userProfiles = Array.from(this.profiles.values())
      .filter(profile => !profile.isDefault)
      .map(profile => ({
        ...profile,
        keybinds: Object.fromEntries(profile.keybinds)
      }));
    
    localStorage.setItem('keybind_profiles', JSON.stringify(userProfiles));
  }

  // 获取动作的快捷键
  public getKeybind(action: string): string {
    return this.keybinds.get(action) || this.defaultKeybinds.get(action) || '';
  }

  // 获取所有快捷键设置
  public getKeybindSettings(): KeybindSetting[] {
    const settings: KeybindSetting[] = [];
    
    for (const [action, key] of this.keybinds.entries()) {
      const defaultKey = this.defaultKeybinds.get(action) || '';
      settings.push({
        action,
        key,
        defaultKey,
        description: this.getActionDescription(action)
      });
    }
    
    return settings;
  }

  // 获取动作描述
  private getActionDescription(action: string): string {
    const descriptions: Record<string, string> = {
      'attack': '普通攻击',
      'skill': '释放技能',
      'defend': '防御',
      'item': '使用物品',
      'ultimate': '终极技能',
      'combo': '连击',
      'move_up': '向上移动',
      'move_down': '向下移动',
      'move_left': '向左移动',
      'move_right': '向右移动',
      'select_target': '选择目标',
      'escape': '取消/退出',
      'menu': '打开菜单',
      'pause': '暂停游戏',
      'replay': '战斗回放',
      'debug': '调试模式',
      'inventory': '打开背包',
      'skills': '技能面板',
      'map': '打开地图',
      'quests': '任务列表',
      'step_forward': '步进前进',
      'step_back': '步进后退',
      'toggle_replay': '切换回放',
      'save_snapshot': '保存快照'
    };
    
    return descriptions[action] || action;
  }

  // 检查快捷键冲突
  public checkKeybindConflict(key: string): KeybindConflict | null {
    for (const [existingAction, existingKey] of this.keybinds.entries()) {
      if (existingKey === key) {
        return {
          action: existingAction,
          key: existingKey,
          description: this.getActionDescription(existingAction)
        };
      }
    }
    return null;
  }

  // 获取快捷键历史
  public getKeybindHistory(): Array<{action: string, oldKey: string, newKey: string, timestamp: number}> {
    return [...this.keybindHistory].reverse(); // 返回最新的在前面
  }

  // 获取所有配置
  public getProfiles(): KeybindProfile[] {
    return Array.from(this.profiles.values());
  }

  // 获取当前配置
  public getCurrentProfile(): KeybindProfile {
    return this.profiles.get(this.currentProfile) || this.profiles.get('default')!;
  }

  // 切换配置
  public switchProfile(profileId: string): boolean {
    if (this.profiles.has(profileId)) {
      this.currentProfile = profileId;
      this.keybinds = this.loadKeybinds();
      return true;
    }
    return false;
  }

  // 创建新配置
  public createProfile(name: string, description: string, keybinds?: Map<string, string>): string {
    const profileId = `custom_${Date.now()}`;
    const newProfile: KeybindProfile = {
      id: profileId,
      name,
      description,
      keybinds: keybinds || new Map(this.keybinds),
      isDefault: false
    };
    
    this.profiles.set(profileId, newProfile);
    this.saveUserProfiles();
    
    return profileId;
  }

  // 删除配置
  public deleteProfile(profileId: string): boolean {
    if (profileId === 'default' || !this.profiles.has(profileId)) {
      return false;
    }
    
    this.profiles.delete(profileId);
    
    // 如果删除的是当前配置，切换到默认配置
    if (this.currentProfile === profileId) {
      this.currentProfile = 'default';
      this.keybinds = this.loadKeybinds();
    }
    
    this.saveUserProfiles();
    return true;
  }

  // 导出配置
  public exportProfile(profileId: string): string {
    const profile = this.profiles.get(profileId);
    if (!profile) throw new Error('Profile not found');
    
    const exportData = {
      ...profile,
      keybinds: Object.fromEntries(profile.keybinds),
      exportTime: new Date().toISOString(),
      version: '1.0'
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  // 导入配置
  public importProfile(profileData: string): string {
    try {
      const parsedData = JSON.parse(profileData);
      const keybindsMap = new Map<string, string>(Object.entries(parsedData.keybinds));
      
      const profileId = `imported_${Date.now()}`;
      const newProfile: KeybindProfile = {
        id: profileId,
        name: parsedData.name || '导入的配置',
        description: parsedData.description || '从文件导入的配置',
        keybinds: keybindsMap,
        isDefault: false
      };
      
      this.profiles.set(profileId, newProfile);
      this.saveUserProfiles();
      
      return profileId;
    } catch (error) {
      throw new Error('Invalid profile data');
    }
  }

  // 获取快捷键提示
  public getKeybindHints(): Array<{action: string, key: string, description: string}> {
    const hints: Array<{action: string, key: string, description: string}> = [];
    
    for (const [action, key] of this.keybinds.entries()) {
      hints.push({
        action,
        key,
        description: this.getActionDescription(action)
      });
    }
    
    return hints.sort((a, b) => a.description.localeCompare(b.description));
  }

  // 验证快捷键格式
  public validateKey(key: string): boolean {
    // 允许字母、数字、功能键、方向键等
    const validKeys = /^[a-z0-9]$|^f[1-9][0-9]?$|^escape$|^tab$|^capslock$|^shift$|^control$|^alt$|^space$|^enter$|^backspace$|^delete$|^insert$|^home$|^end$|^pageup$|^pagedown$|^arrowup$|^arrowdown$|^arrowleft$|^arrowright$|^mouse[0-9]$/;
    return validKeys.test(key.toLowerCase());
  }

  // 格式化快捷键显示
  public formatKeyDisplay(key: string): string {
    const keyMap: Record<string, string> = {
      'escape': 'Esc',
      'tab': 'Tab',
      'capslock': 'Caps',
      'shift': 'Shift',
      'control': 'Ctrl',
      'alt': 'Alt',
      'space': 'Space',
      'enter': 'Enter',
      'backspace': 'Backspace',
      'delete': 'Del',
      'insert': 'Ins',
      'home': 'Home',
      'end': 'End',
      'pageup': 'PgUp',
      'pagedown': 'PgDn',
      'arrowup': '↑',
      'arrowdown': '↓',
      'arrowleft': '←',
      'arrowright': '→',
      'mouse1': '鼠标左键',
      'mouse2': '鼠标右键',
      'mouse3': '鼠标中键'
    };
    
    // 处理功能键
    if (key.startsWith('f')) {
      const fnNumber = key.slice(1);
      if (/^[1-9][0-9]?$/.test(fnNumber)) {
        return `F${fnNumber}`;
      }
    }
    
    return keyMap[key] || key.toUpperCase();
  }

  // 检查快捷键是否可用（无冲突）
  public isKeyAvailable(key: string, excludeAction?: string): boolean {
    for (const [action, bindKey] of this.keybinds.entries()) {
      if (bindKey === key && action !== excludeAction) {
        return false;
      }
    }
    return true;
  }
}

// 导出单例实例
export const keybindManager = new KeybindManager();
