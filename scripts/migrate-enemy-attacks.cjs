/**
 * migrate-enemy-attacks.cjs — 一次性迁移脚本：minAttack/maxAttack → attack
 *
 * 攻击模型扁平化（v2.1.0）：废弃区间攻击模型，统一使用单一 attack 属性。
 * 转换规则：attack = Math.round((minAttack + maxAttack) / 2)，然后删除旧字段。
 *
 * 覆盖范围：configs/enemies/*.json（敌人）+ configs/materials/materials.json（装备属性）。
 * 幂等：已存在 attack 且无 min/max 的记录跳过；仅存在旧字段时才转换。
 *
 * 用法：node scripts/migrate-enemy-attacks.cjs
 */

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const GLOB_TARGETS = [
  path.join(PROJECT_ROOT, 'configs', 'enemies'),
  path.join(PROJECT_ROOT, 'configs', 'materials', 'materials.json'),
]

function collectJsonFiles(targets) {
  const files = []
  for (const target of targets) {
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target)
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(target)) {
          if (entry.endsWith('.json')) {
            files.push(path.join(target, entry))
          }
        }
      } else if (target.endsWith('.json')) {
        files.push(target)
      }
    }
  }
  return files
}

/** 递归将对象/数组中出现的 minAttack/maxAttack 合并为 attack，返回是否有改动 */
function migrateStats(value, context) {
  if (Array.isArray(value)) {
    let changed = false
    for (const item of value) {
      changed = migrateStats(item, context) || changed
    }
    return changed
  }
  if (value && typeof value === 'object') {
    let changed = false
    for (const key of Object.keys(value)) {
      if (key === 'minAttack' || key === 'maxAttack') {
        const min = value.minAttack
        const max = value.maxAttack
        if (typeof min === 'number' && typeof max === 'number' && typeof value.attack !== 'number') {
          value.attack = Math.round((min + max) / 2)
        }
        delete value.minAttack
        delete value.maxAttack
        changed = true
      } else {
        changed = migrateStats(value[key], context) || changed
      }
    }
    return changed
  }
  return false
}

function main() {
  const files = collectJsonFiles(GLOB_TARGETS)
  let totalChanged = 0

  for (const file of files) {
    let raw
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch (err) {
      console.warn(`[migrate-enemy-attacks] 读取失败，跳过: ${file}`, err.message)
      continue
    }

    let data
    try {
      data = JSON.parse(raw)
    } catch (err) {
      console.warn(`[migrate-enemy-attacks] JSON 解析失败，跳过: ${file}`, err.message)
      continue
    }

    const before = raw
    const changed = migrateStats(data)
    if (!changed) {
      console.log(`[migrate-enemy-attacks] 无 min/max 攻击字段，跳过: ${path.basename(file)}`)
      continue
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
    totalChanged++
    console.log(`[migrate-enemy-attacks] 已迁移: ${path.basename(file)}`)
  }

  console.log(`[migrate-enemy-attacks] 完成，共迁移 ${totalChanged} 个文件`)
}

main()
