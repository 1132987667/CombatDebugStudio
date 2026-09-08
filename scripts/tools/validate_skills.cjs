/**
 * 文件: validate_skills.cjs
 * 功能: 技能与 Buff 配置验证工具
 * 描述: 检查全部技能配置中引用的 Buff ID 是否可解析——
 *       Buff 现为三轨体系（需求调整历史 #9 时代重构）：
 *       ① 配置轨 buffs/buffs.json + xiyou/enemy-buffs.json + effects/effects.json（effectPlan 原子效果）
 *       ② 脚本轨 src/domain/buff/scripts 的 BUFF_ID 静态类
 *       引用命中任一轨即合法。
 * 用法: npm run validate
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const SKILLS_DIR = path.join(ROOT, 'configs/skills');
const ENEMY_SKILLS_PATH = path.join(ROOT, 'configs/xiyou/enemy-skills.json');
const BUFFS_PATH = path.join(ROOT, 'configs/buffs/buffs.json');
const ENEMY_BUFFS_PATH = path.join(ROOT, 'configs/xiyou/enemy-buffs.json');
const EFFECTS_PATH = path.join(ROOT, 'configs/effects/effects.json');
const SCRIPTS_DIR = path.join(ROOT, 'src/domain/buff/scripts');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
    process.exit(1);
  }
}

function listIds(doc) {
  const entries = Array.isArray(doc) ? doc : doc.items || doc.buffs || doc.effects || [];
  return entries.filter((e) => e && typeof e.id === 'string').map((e) => e.id);
}

/** 已实现/已注册 Buff ID：配置三源 + 脚本 BUFF_ID */
function getImplementedBuffIds() {
  const ids = new Set();
  for (const p of [BUFFS_PATH, ENEMY_BUFFS_PATH, EFFECTS_PATH]) {
    for (const id of listIds(readJson(p))) ids.add(id);
  }
  // 脚本轨：src/domain/buff/scripts/*.ts 的静态 BUFF_ID
  if (fs.existsSync(SCRIPTS_DIR)) {
    for (const file of fs.readdirSync(SCRIPTS_DIR)) {
      if (!file.endsWith('.ts')) continue;
      const content = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf-8');
      const match = content.match(/BUFF_ID\s*=\s*['"]([^'"]+)['"]/);
      if (match) ids.add(match[1]);
    }
  }
  return ids;
}

/** 技能配置文件清单：configs/skills/*.json + 西游敌人技能 */
function skillDocs() {
  const docs = [];
  for (const file of fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.json'))) {
    docs.push([`skills/${file}`, readJson(path.join(SKILLS_DIR, file))]);
  }
  docs.push(['xiyou/enemy-skills.json', readJson(ENEMY_SKILLS_PATH)]);
  return docs;
}

/** 递归提取配置里的 buffId / effectId 引用 */
function getUsedBuffIds(doc) {
  const ids = new Set();
  function walk(obj) {
    if (!obj) return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (typeof obj === 'object') {
      if (typeof obj.effectId === 'string') ids.add(obj.effectId);
      if (typeof obj.buffId === 'string') ids.add(obj.buffId);
      for (const key in obj) walk(obj[key]);
    }
  }
  walk(doc);
  return ids;
}

function validate() {
  console.log('=== Skill & Buff Configuration Validator ===\n');

  const implemented = getImplementedBuffIds();
  console.log(`Registered/implemented Buff IDs: ${implemented.size}\n`);

  const missing = new Map();
  let skillCount = 0;
  let usedCount = 0;
  for (const [name, doc] of skillDocs()) {
    const entries = Array.isArray(doc) ? doc : [];
    skillCount += entries.length;
    for (const id of getUsedBuffIds(doc)) {
      usedCount++;
      if (!implemented.has(id) && !missing.has(id)) missing.set(id, name);
    }
  }
  console.log(`Skills scanned: ${skillCount}; buff references: ${usedCount}\n`);

  console.log('=== Validation Results ===\n');
  if (missing.size > 0) {
    console.log('❌ Unresolvable Buff references:');
    for (const [id, from] of missing) console.log(`   - ${id}  (first seen: ${from})`);
    console.log('');
    console.log(`Validation FAILED: ${missing.size} unresolvable reference(s)`);
    process.exit(1);
  }
  console.log('✅ All Buff references resolve to configs or scripts!');
  console.log('Validation PASSED');
  process.exit(0);
}

validate();
