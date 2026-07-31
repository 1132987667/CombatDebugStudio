import { describe, it, expect } from 'vitest'
import { BuffScriptLoader } from '@/domain/buff/BuffScriptLoader'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { buffScripts } from '@/domain/buff/scripts/index'

interface BuffScriptConstructor {
  new (...args: any[]): unknown
  BUFF_ID: string
}

/**
 * 映射键回归测试（追加-1）
 *
 * 背景：scripts/index.ts 的 buffScripts 映射键曾用短名（mountain_god/poison/berserk/shield），
 * 而脚本类的静态 BUFF_ID 均为 buff_* 全名，BuffScriptLoader 按 v.BUFF_ID === buffId 精确匹配
 * → 4 个脚本静默注册失败（buff_berserk 完全无法施加，其余静默回退 PATH B）。
 * 修复后映射键 == BUFF_ID，本测试锁定该不变量，防止回退。
 */
describe('BuffScriptLoader 映射键', () => {
  it('每个映射键都能在对应模块中找到 BUFF_ID 一致的脚本类', async () => {
    const mismatches: string[] = []
    for (const [key, moduleLoader] of Object.entries(buffScripts)) {
      const module = await moduleLoader()
      const found = Object.values(module).find(
        (v): v is BuffScriptConstructor =>
          typeof v === 'function' &&
          (v as BuffScriptConstructor).BUFF_ID === key,
      )
      if (!found) mismatches.push(key)
    }
    expect(mismatches, `映射键与 BUFF_ID 不一致（静默注册失败）: ${mismatches.join(', ')}`).toEqual([])
  })

  it('loadScripts 后四个此前失败的脚本已注册', async () => {
    const registry = new BuffScriptRegistry()
    const loader = new BuffScriptLoader(registry)
    await loader.loadScripts()

    const criticalIds = ['buff_berserk', 'buff_poison', 'buff_shield', 'buff_mountain_god']
    for (const buffId of criticalIds) {
      expect(registry.has(buffId), `registry 应包含 ${buffId}`).toBe(true)
    }
    expect(loader.getLoadedScriptCount()).toBe(Object.keys(buffScripts).length)
  })

  it('脚本可实例化且自包含 CONFIG 已注册（buff_berserk 无 JSON 配置依赖）', async () => {
    const registry = new BuffScriptRegistry()
    const loader = new BuffScriptLoader(registry)
    await loader.loadScripts()

    const script = registry.get('buff_berserk')
    expect(script).not.toBeNull()
    const config = registry.getDefaultConfig('buff_berserk')
    expect(config?.id).toBe('buff_berserk')
    expect(config?.name).toBe('狂暴')
  })
})
