/**
 * check-craft-loop.cjs — 打造配方 / 图谱 / 装备 / 掉落 闭环检查
 *
 * 校验打造链路全部双向引用，输出五类报告：
 * - 无图谱的可打造装备      craftable 缺 blueprintId 或引用无效
 * - 无装备产出的配方        cave forgeRecipes.equipmentId 不存在 / 对应装备不可打造
 * - 无配方的图谱            items.json 图纸未被任何装备 / 配方引用
 * - 材料缺失的配方          equipment.materials（权威）或 cave recipe 内联材料引用不存在
 * - 掉落断裂引用            enemies / drops 引用不存在
 * - 装备配方断裂引用        equipment.recipeId 无对应 cave forgeRecipes.id
 *
 * 用法：node scripts/check-craft-loop.cjs
 */

const fs = require('fs')
const path = require('path')

const cfg = (...segments) => path.resolve(__dirname, '..', 'configs', ...segments)

const itemsDoc = JSON.parse(fs.readFileSync(cfg('xiyou', 'items.json'), 'utf8'))
const itemIds = new Set(itemsDoc.items.map((i) => i.id))
const nameToId = new Map()
for (const it of itemsDoc.items) if (!nameToId.has(it.name)) nameToId.set(it.name, it.id)

const equipment = JSON.parse(fs.readFileSync(cfg('equipment', 'equipment.json'), 'utf8'))
const eqIds = new Set(equipment.map((e) => e.id))
const craftableIds = new Set(equipment.filter((e) => e.craftable).map((e) => e.id))

const cave = JSON.parse(fs.readFileSync(cfg('xiyou', 'cave.json'), 'utf8'))
const recipes = cave.forgeRecipes || []
const recipeIds = new Set(recipes.map((r) => r.id))

/** 配方材料文本 "桃木×3 + 铜精×1" → 材料名列表 */
function materialNames(text) {
  if (!text) return []
  return text
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.*?)[×x](\d+)$/.exec(part)
      return (m ? m[1] : part).trim()
    })
}

const report = {
  noBlueprint: [], // 无图谱的可打造装备
  noEquipment: [], // 无装备产出的配方
  orphanBlueprint: [], // 无配方的图谱
  missingMaterials: [], // 材料缺失的配方
  brokenDrops: [], // 掉落断裂引用
  brokenRecipeRef: [], // 装备配方断裂引用
}

// 1. 无图谱的可打造装备：craftable 但无 blueprintId / blueprintId 未注册
for (const e of equipment) {
  if (e.craftable && (!e.blueprintId || !itemIds.has(e.blueprintId))) {
    report.noBlueprint.push(`${e.id} (${e.name})`)
  }
}

// 2. 无装备产出的配方：equipmentId 不存在，或对应装备不可打造
for (const r of recipes) {
  if (!eqIds.has(r.equipmentId) || !craftableIds.has(r.equipmentId)) {
    report.noEquipment.push(`${r.id} → ${r.equipmentId}`)
  }
}

// 3. 无配方的图谱：items 图纸未被任何装备 blueprintId 或配方 blueprintId 引用
//    NOTE: 图纸残页（bp_page）是合成素材而非解锁图谱，不参与打造闭环，跳过
const referencedBlueprints = new Set()
for (const e of equipment) if (e.blueprintId) referencedBlueprints.add(e.blueprintId)
for (const r of recipes) if (r.blueprintId) referencedBlueprints.add(r.blueprintId)
for (const it of itemsDoc.items) {
  if (it.type === '图纸' && !it.name.includes('残页') && !referencedBlueprints.has(it.id)) {
    report.orphanBlueprint.push(`${it.id} (${it.name})`)
  }
}

// 4. 材料缺失的配方：equipment.materials[].itemId 权威；cave recipe 材料经 equipmentId 关联
//    NOTE: forgeRecipes 不再内联材料，材料权威在 equipment.json（经 equipmentId 引用），
//          此处仅兼容旧格式内联材料（"桃木×3 + 铜精×1"）的残留检查
for (const e of equipment) {
  for (const m of e.materials || []) {
    if (!itemIds.has(m.itemId)) report.missingMaterials.push(`${e.id}.materials → ${m.itemId}`)
  }
}
for (const r of recipes) {
  for (const name of materialNames(r.materials)) {
    if (!nameToId.has(name)) report.missingMaterials.push(`${r.id}.materials → ${name}`)
  }
}

// 5. 掉落断裂引用：enemies / drops 的 itemId 须在 items ∪ equipment
const validDrops = new Set([...itemIds, ...eqIds])
for (const file of fs.readdirSync(cfg('enemies')).filter((f) => f.endsWith('.json'))) {
  const enemies = JSON.parse(fs.readFileSync(cfg('enemies', file), 'utf8'))
  for (const en of enemies) {
    for (const d of en.drops || []) {
      if (!validDrops.has(d.itemId)) report.brokenDrops.push(`${file}:${en.id}.drops → ${d.itemId}`)
    }
  }
}
const drops = JSON.parse(fs.readFileSync(cfg('drops', 'drops.json'), 'utf8'))
for (const g of drops) {
  for (const entry of g.entries || []) {
    if (!validDrops.has(entry.itemId)) report.brokenDrops.push(`drops.json:${g.id}.entries → ${entry.itemId}`)
  }
}

// 6. 装备配方断裂引用：recipeId 无对应 cave forgeRecipes.id
for (const e of equipment) {
  if (e.recipeId && !recipeIds.has(e.recipeId)) {
    report.brokenRecipeRef.push(`${e.id} → ${e.recipeId}`)
  }
}

const sections = [
  ['无图谱的可打造装备', report.noBlueprint],
  ['无装备产出的配方', report.noEquipment],
  ['无配方的图谱', report.orphanBlueprint],
  ['材料缺失的配方', report.missingMaterials],
  ['掉落断裂引用', report.brokenDrops],
  ['装备配方断裂引用', report.brokenRecipeRef],
]

let total = 0
for (const [title, items] of sections) total += items.length

console.log(`打造闭环检查：装备 ${equipment.length} / 图谱 ${itemsDoc.items.filter((i) => i.type === '图纸').length} / 配方 ${recipes.length} / 掉落组 ${drops.length}`)
console.log(`断裂引用：${total} 条`)

if (total === 0) {
  console.log('闭环检查通过 ✅')
  for (const [title] of sections) console.log(`  - ${title} ✅`)
  process.exit(0)
}

for (const [title, items] of sections) {
  if (items.length === 0) continue
  console.log(`\n✗ ${title}（${items.length}）`)
  for (const line of items) console.log(`  - ${line}`)
}
process.exit(1)
