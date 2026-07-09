/**
 * 鏂囦欢: KeybindManager.ts
 * 鍒涘缓鏃ユ湡: 2026-02-09
 * 浣滆€? CombatDebugStudio
 * 鍔熻兘: 蹇�嵎閿��鐞嗗櫒
 * 鎻忚堪: 绠＄悊娓告垙涓�殑蹇�嵎閿��缃�紝鏀�寔澶氶厤缃�枃浠躲€佸啿绐佹�娴嬨€佸揩鎹烽敭鐩戝惉鍜岄厤缃��鍏ュ�鍑? * 鐗堟湰: 1.0.0
 */

import type {
  KeybindSetting,
  KeybindProfile,
  KeybindConflict,
} from '@/shared/types/input'

export class KeybindManager {
  private keybinds: Map<string, string>
  private defaultKeybinds: Map<string, string>
  private keybindListeners: Map<string, Set<() => void>>
  private isListening: boolean
  private profiles: Map<string, KeybindProfile>
  private currentProfile: string
  private keybindHistory: Array<{
    action: string
    oldKey: string
    newKey: string
    timestamp: number
  }>

  constructor() {
    // 鍒濆�鍖栭粯璁ゅ揩鎹烽敭锛堢�鍚堣�涓氶€氱敤鎿嶄綔涔犳儻锛?
    this.defaultKeybinds = new Map([
      // 鎴樻枟鎿嶄綔
      ['attack', 'z'],
      ['skill', 'x'],
      ['defend', 'c'],
      ['item', 'v'],
      ['ultimate', 'q'],
      ['combo', 'e'],

      // 绉诲姩鍜岄€夋嫨
      ['move_up', 'w'],
      ['move_down', 's'],
      ['move_left', 'a'],
      ['move_right', 'd'],
      ['select_target', 'tab'],

      // 绯荤粺鎿嶄綔
      ['escape', 'escape'],
      ['menu', 'm'],
      ['pause', 'p'],
      ['replay', 'r'],
      ['debug', 'f12'],

      // 鐣岄潰鎿嶄綔
      ['inventory', 'i'],
      ['skills', 'k'],
      ['map', 'm'],
      ['quests', 'j'],

      // 璋冭瘯鍔熻兘
      ['step_forward', 'f5'],
      ['step_back', 'f6'],
      ['toggle_replay', 'f7'],
      ['save_snapshot', 'f8'],
    ])

    // 鍔犺浇鐢ㄦ埛鑷�畾涔夊揩鎹烽敭鎴栦娇鐢ㄩ粯璁ゅ€?
    this.keybinds = this.loadKeybinds()
    this.keybindListeners = new Map()
    this.isListening = false
    this.profiles = new Map()
    this.currentProfile = 'default'
    this.keybindHistory = []

    // 鍒濆�鍖栭�璁鹃厤缃?
    this.initializeProfiles()
  }

  // 寮€濮嬬洃鍚�敭鐩樹簨浠?
  public startListening() {
    if (this.isListening) return

    window.addEventListener('keydown', this.handleKeyDown.bind(this))
    this.isListening = true
  }

  // 鍋滄�鐩戝惉閿�洏浜嬩欢
  public stopListening() {
    if (!this.isListening) return

    window.removeEventListener('keydown', this.handleKeyDown.bind(this))
    this.isListening = false
  }

  // 澶勭悊閿�洏鎸変笅浜嬩欢
  private handleKeyDown(event: KeyboardEvent) {
    // 蹇界暐鍦ㄨ緭鍏ユ�涓�殑鎸夐敭
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return
    }

    const key = event.key.toLowerCase()
    const action = this.getKeybindAction(key)

    if (action) {
      // 鐗规畩澶勭悊F12閿�紝鍏佽�榛樿�鐨勬祻瑙堝櫒璋冭瘯鍔熻兘
      if (key !== 'f12') {
        event.preventDefault()
      }
      this.triggerAction(action)
    }
  }

  // 鏍规嵁鎸夐敭鑾峰彇瀵瑰簲鐨勫姩浣?
  private getKeybindAction(key: string): string | null {
    for (const [action, bindKey] of this.keybinds.entries()) {
      if (bindKey === key) {
        return action
      }
    }
    return null
  }

  // 瑙﹀彂鍔ㄤ綔
  private triggerAction(action: string) {
    if (this.keybindListeners.has(action)) {
      const listeners = this.keybindListeners.get(action)
      if (listeners) {
        listeners.forEach((listener) => listener())
      }
    }
  }

  // 娉ㄥ唽鍔ㄤ綔鐩戝惉鍣?
  public onAction(action: string, listener: () => void): void {
    if (!this.keybindListeners.has(action)) {
      this.keybindListeners.set(action, new Set())
    }
    this.keybindListeners.get(action)?.add(listener)
  }

  // 绉婚櫎鍔ㄤ綔鐩戝惉鍣?
  public offAction(action: string, listener: () => void): void {
    if (this.keybindListeners.has(action)) {
      this.keybindListeners.get(action)?.delete(listener)
    }
  }

  // 鑾峰彇褰撳墠蹇�嵎閿�厤缃?
  public getKeybinds(): Map<string, string> {
    return new Map(this.keybinds)
  }

  // 鑾峰彇榛樿�蹇�嵎閿�厤缃?
  public getDefaultKeybinds(): Map<string, string> {
    return new Map(this.defaultKeybinds)
  }

  // 璁剧疆蹇�嵎閿?
  public setKeybind(action: string, key: string): boolean {
    // 妫€鏌ユ槸鍚︽湁鍐茬獊
    for (const [existingAction, existingKey] of this.keybinds.entries()) {
      if (existingKey === key && existingAction !== action) {
        return false // 鍐茬獊锛岃�缃�け璐?
      }
    }

    this.keybinds.set(action, key)
    this.saveKeybinds()
    return true
  }

  // 閲嶇疆涓洪粯璁ゅ揩鎹烽敭
  public resetToDefaults(): void {
    this.keybinds = new Map(this.defaultKeybinds)
    this.saveKeybinds()
  }

  // 淇濆瓨蹇�嵎閿�埌鏈�湴瀛樺偍
  private saveKeybinds(): void {
    const keybindsObject = Object.fromEntries(this.keybinds)
    localStorage.setItem('keybinds', JSON.stringify(keybindsObject))
  }

  // 浠庢湰鍦板瓨鍌ㄥ姞杞藉揩鎹烽敭
  private loadKeybinds(): Map<string, string> {
    try {
      const savedKeybinds = localStorage.getItem(
        `keybinds_${this.currentProfile}`,
      )
      if (savedKeybinds) {
        const parsedKeybinds = JSON.parse(savedKeybinds)
        const keybindsMap = new Map<string, string>()

        // 鍚堝苟榛樿�鍊煎拰淇濆瓨鐨勫€硷紝纭�繚鎵€鏈夊姩浣滈兘鏈夌粦瀹?
        for (const [action, key] of this.defaultKeybinds.entries()) {
          keybindsMap.set(action, parsedKeybinds[action] || key)
        }

        return keybindsMap
      }
    } catch (error) {
      console.error('Failed to load keybinds:', error)
    }

    return new Map(this.defaultKeybinds)
  }

  // 鍒濆�鍖栭�璁鹃厤缃?
  private initializeProfiles(): void {
    // 榛樿�閰嶇疆锛堟爣鍑嗘父鎴忔搷浣滐級
    this.profiles.set('default', {
      id: 'default',
      name: '榛樿�閰嶇疆',
      description: '鏍囧噯娓告垙鎿嶄綔閰嶇疆锛岀�鍚堣�涓氶€氱敤涔犳儻',
      keybinds: new Map(this.defaultKeybinds),
      isDefault: true,
    })

    // 涓撲笟鐜╁�閰嶇疆
    const proKeybinds = new Map(this.defaultKeybinds)
    proKeybinds.set('attack', 'mouse1')
    proKeybinds.set('skill', 'mouse2')
    proKeybinds.set('ultimate', 'space')
    proKeybinds.set('combo', 'shift')

    this.profiles.set('pro', {
      id: 'pro',
      name: '涓撲笟鐜╁�閰嶇疆',
      description: '浼樺寲鎿嶄綔鏁堢巼锛岄€傚悎楂樼骇鐜╁�',
      keybinds: proKeybinds,
      isDefault: false,
    })

    // 宸︽墜閰嶇疆
    const leftHandKeybinds = new Map(this.defaultKeybinds)
    leftHandKeybinds.set('move_up', 'i')
    leftHandKeybinds.set('move_down', 'k')
    leftHandKeybinds.set('move_left', 'j')
    leftHandKeybinds.set('move_right', 'l')
    leftHandKeybinds.set('attack', 'u')
    leftHandKeybinds.set('skill', 'o')

    this.profiles.set('left_hand', {
      id: 'left_hand',
      name: '宸︽墜閰嶇疆',
      description: 'Left-handed configuration',
      keybinds: leftHandKeybinds,
      isDefault: false,
    })

    // 鍔犺浇鐢ㄦ埛鑷�畾涔夐厤缃?    this.loadUserProfiles()
  }

  // 鍔犺浇鐢ㄦ埛鑷�畾涔夐厤缃?
  private loadUserProfiles(): void {
    try {
      const savedProfiles = localStorage.getItem('keybind_profiles')
      if (savedProfiles) {
        const parsedProfiles = JSON.parse(savedProfiles)
        parsedProfiles.forEach((profileData: any) => {
          const keybindsMap = new Map<string, string>(
            Object.entries(profileData.keybinds),
          )
          this.profiles.set(profileData.id, {
            ...profileData,
            keybinds: keybindsMap,
          })
        })
      }
    } catch (error) {
      console.error('Failed to load user profiles:', error)
    }
  }

  // 淇濆瓨鐢ㄦ埛閰嶇疆
  private saveUserProfiles(): void {
    const userProfiles = Array.from(this.profiles.values())
      .filter((profile) => !profile.isDefault)
      .map((profile) => ({
        ...profile,
        keybinds: Object.fromEntries(profile.keybinds),
      }))

    localStorage.setItem('keybind_profiles', JSON.stringify(userProfiles))
  }

  // 鑾峰彇鍔ㄤ綔鐨勫揩鎹烽敭
  public getKeybind(action: string): string {
    return this.keybinds.get(action) || this.defaultKeybinds.get(action) || ''
  }

  // 鑾峰彇鎵€鏈夊揩鎹烽敭璁剧疆
  public getKeybindSettings(): KeybindSetting[] {
    const settings: KeybindSetting[] = []

    for (const [action, key] of this.keybinds.entries()) {
      const defaultKey = this.defaultKeybinds.get(action) || ''
      settings.push({
        action,
        key,
        defaultKey,
        description: this.getActionDescription(action),
      })
    }

    return settings
  }

  // 鑾峰彇鍔ㄤ綔鎻忚堪
  private getActionDescription(action: string): string {
    const descriptions: Record<string, string> = {
      attack: 'Normal Attack',
      skill: 'Release Skill',
      defend: '闃插尽',
      item: '浣跨敤鐗╁搧',
      ultimate: 'Ultimate Skill',
      combo: '杩炲嚮',
      move_up: '鍚戜笂绉诲姩',
      move_down: '鍚戜笅绉诲姩',
      move_left: '鍚戝乏绉诲姩',
      move_right: '鍚戝彸绉诲姩',
      select_target: '閫夋嫨鐩�爣',
      escape: 'Cancel/Exit',
      menu: '鎵撳紑鑿滃崟',
      pause: '鏆傚仠娓告垙',
      replay: '鎴樻枟鍥炴斁',
      debug: '璋冭瘯妯″紡',
      inventory: '鎵撳紑鑳屽寘',
      skills: 'Skill Panel',
      map: '鎵撳紑鍦板浘',
      quests: '浠诲姟鍒楄〃',
      step_forward: '姝ヨ繘鍓嶈繘',
      step_back: '姝ヨ繘鍚庨€€',
      toggle_replay: '鍒囨崲鍥炴斁',
      save_snapshot: '淇濆瓨蹇�収',
    }

    return descriptions[action] || action
  }

  // 妫€鏌ュ揩鎹烽敭鍐茬獊
  public checkKeybindConflict(key: string): KeybindConflict | null {
    for (const [existingAction, existingKey] of this.keybinds.entries()) {
      if (existingKey === key) {
        return {
          action: existingAction,
          key: existingKey,
          description: this.getActionDescription(existingAction),
        }
      }
    }
    return null
  }

  // 鑾峰彇蹇�嵎閿�巻鍙?
  public getKeybindHistory(): Array<{
    action: string
    oldKey: string
    newKey: string
    timestamp: number
  }> {
    return [...this.keybindHistory].reverse() // 杩斿洖鏈€鏂扮殑鍦ㄥ墠闈?
  }

  // 鑾峰彇鎵€鏈夐厤缃?
  public getProfiles(): KeybindProfile[] {
    return Array.from(this.profiles.values())
  }

  // 鑾峰彇褰撳墠閰嶇疆
  public getCurrentProfile(): KeybindProfile {
    return (
      this.profiles.get(this.currentProfile) || this.profiles.get('default')!
    )
  }

  // 鍒囨崲閰嶇疆
  public switchProfile(profileId: string): boolean {
    if (this.profiles.has(profileId)) {
      this.currentProfile = profileId
      this.keybinds = this.loadKeybinds()
      return true
    }
    return false
  }

  // 鍒涘缓鏂伴厤缃?
  public createProfile(
    name: string,
    description: string,
    keybinds?: Map<string, string>,
  ): string {
    const profileId = `custom_${Date.now()}`
    const newProfile: KeybindProfile = {
      id: profileId,
      name,
      description,
      keybinds: keybinds || new Map(this.keybinds),
      isDefault: false,
    }

    this.profiles.set(profileId, newProfile)
    this.saveUserProfiles()

    return profileId
  }

  // 鍒犻櫎閰嶇疆
  public deleteProfile(profileId: string): boolean {
    if (profileId === 'default' || !this.profiles.has(profileId)) {
      return false
    }

    this.profiles.delete(profileId)

    // 濡傛灉鍒犻櫎鐨勬槸褰撳墠閰嶇疆锛屽垏鎹㈠埌榛樿�閰嶇疆
    if (this.currentProfile === profileId) {
      this.currentProfile = 'default'
      this.keybinds = this.loadKeybinds()
    }

    this.saveUserProfiles()
    return true
  }

  // 瀵煎嚭閰嶇疆
  public exportProfile(profileId: string): string {
    const profile = this.profiles.get(profileId)
    if (!profile) throw new Error('Profile not found')

    const exportData = {
      ...profile,
      keybinds: Object.fromEntries(profile.keybinds),
      exportTime: new Date().toISOString(),
      version: '1.0',
    }

    return JSON.stringify(exportData, null, 2)
  }

  // 瀵煎叆閰嶇疆
  public importProfile(profileData: string): string {
    try {
      const parsedData = JSON.parse(profileData)
      const keybindsMap = new Map<string, string>(
        Object.entries(parsedData.keybinds),
      )

      const profileId = `imported_${Date.now()}`
      const newProfile: KeybindProfile = {
        id: profileId,
        name: parsedData.name || 'Imported Config',
        description: parsedData.description || '浠庢枃浠跺�鍏ョ殑閰嶇疆',
        keybinds: keybindsMap,
        isDefault: false,
      }

      this.profiles.set(profileId, newProfile)
      this.saveUserProfiles()

      return profileId
    } catch (error) {
      throw new Error('Invalid profile data')
    }
  }

  // 鑾峰彇蹇�嵎閿�彁绀?
  public getKeybindHints(): Array<{
    action: string
    key: string
    description: string
  }> {
    const hints: Array<{ action: string; key: string; description: string }> =
      []

    for (const [action, key] of this.keybinds.entries()) {
      hints.push({
        action,
        key,
        description: this.getActionDescription(action),
      })
    }

    return hints.sort((a, b) => a.description.localeCompare(b.description))
  }

  // 楠岃瘉蹇�嵎閿�牸寮?
  public validateKey(key: string): boolean {
    // 鍏佽�瀛楁瘝銆佹暟瀛椼€佸姛鑳介敭銆佹柟鍚戦敭绛?    const validKeys =
      /^[a-z0-9]$|^f[1-9][0-9]?$|^escape$|^tab$|^capslock$|^shift$|^control$|^alt$|^space$|^enter$|^backspace$|^delete$|^insert$|^home$|^end$|^pageup$|^pagedown$|^arrowup$|^arrowdown$|^arrowleft$|^arrowright$|^mouse[0-9]$/
    return validKeys.test(key.toLowerCase())
  }

  // 鏍煎紡鍖栧揩鎹烽敭鏄剧ず
  public formatKeyDisplay(key: string): string {
    const keyMap: Record<string, string> = {
      escape: 'Esc',
      tab: 'Tab',
      capslock: 'Caps',
      shift: 'Shift',
      control: 'Ctrl',
      alt: 'Alt',
      space: 'Space',
      enter: 'Enter',
      backspace: 'Backspace',
      delete: 'Del',
      insert: 'Ins',
      home: 'Home',
      end: 'End',
      pageup: 'PgUp',
      pagedown: 'PgDn',
      arrowup: 'Up',
      arrowdown: 'Down',
      arrowleft: 'Left',
      arrowright: 'Right',
      mouse1: '榧犳爣宸﹂敭',
      mouse2: '榧犳爣鍙抽敭',
      mouse3: '榧犳爣涓�敭',
    }

    // 澶勭悊鍔熻兘閿?
    if (key.startsWith('f')) {
      const fnNumber = key.slice(1)
      if (/^[1-9][0-9]?$/.test(fnNumber)) {
        return `F${fnNumber}`
      }
    }

    return keyMap[key] || key.toUpperCase()
  }

  // 妫€鏌ュ揩鎹烽敭鏄�惁鍙�敤锛堟棤鍐茬獊锛?
  public isKeyAvailable(key: string, excludeAction?: string): boolean {
    for (const [action, bindKey] of this.keybinds.entries()) {
      if (bindKey === key && action !== excludeAction) {
        return false
      }
    }
    return true
  }
}

// 瀵煎嚭鍗曚緥瀹炰緥
export const keybindManager = new KeybindManager()
