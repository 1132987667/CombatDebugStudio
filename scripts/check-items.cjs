/**
 * check-items.cjs — 物品主键索引健康检查（开发计划 P0 行动 3）
 *
 * 确认 items.json 中的 ID 与各掉落表 / 制造表引用零断裂：
 * - enemies/*.json  drops[].itemId
 * - drops/drops.json  entries[].itemId
 * - xiyou/equipment.json  materials[].itemId
 * - items.json 内部 ID 唯一性
 *
 * 用法：node scripts/check-items.cjs
 */

const fs = require('fs')
const path = require('path')

const cfg = (...segments) => path.resolve(__dirname, '..', 'configs', ...segments)

const itemsDoc = JSON.parse(fs.readFileSync(cfg('xiyou', 'items.json'), 'utf8'))
const itemIds = new Set(itemsDoc.items.map((i) => i.id))

const issues = []
let totalRefs = 0

/** 收集引用并校验：refId 不在 items.json 时记入 issues */
function checkRef(origin, refId) {
  totalRefs++
  if (!itemIds.has(refId)) {
    issues.push({ origin, refId })
  }
}

// 内部 ID 唯一性
const dup = itemsDoc.items.map((i) => i.id).filter((id, idx, arr) => arr.indexOf(id) !== idx)
for (const id of new Set(dup)) {
  issues.push({ origin: 'items.json 内部重复 ID', refId: id })
}

// enemies 掉落
for (const file of fs.readdirSync(cfg('enemies')).filter((f) => f.endsWith('.json'))) {
  const enemies = JSON.parse(fs.readFileSync(cfg('enemies', file), 'utf8'))
  for (const e of enemies) {
    for (const d of e.drops || []) {
      checkRef(`${file}:${e.id}.drops`, d.itemId)
    }
  }
}

// drops 掉落组
const drops = JSON.parse(fs.readFileSync(cfg('drops', 'drops.json'), 'utf8'))
for (const g of drops) {
  for (const entry of g.entries || []) {
    checkRef(`drops.json:${g.id}.entries`, entry.itemId)
  }
}

// equipment 制造材料
const equipment = JSON.parse(fs.readFileSync(cfg('xiyou', 'equipment.json'), 'utf8'))
for (const eq of equipment) {
  for (const m of eq.materials || []) {
    checkRef(`xiyou/equipment.json:${eq.id}.materials`, m.itemId)
  }
}

console.log(`物品主键索引：${itemsDoc.items.length} 条`)
console.log(`引用总数：${totalRefs} 条`)
console.log(`断裂引用：${issues.length} 条`)

if (issues.length === 0) {
  console.log('健康检查通过：零断裂报告 ✅')
  console.log(`  - items.json ID 唯一 ✅`)
  console.log(`  - enemies/*.json drops 引用零断裂 ✅`)
  console.log(`  - drops.json entries 引用零断裂 ✅`)
  console.log(`  - xiyou/equipment.json materials 引用零断裂 ✅`)
  process.exit(0)
}

for (const { origin, refId } of issues) {
  console.log(`  ✗ ${origin} → ${refId} 未注册`)
}
process.exit(1)
