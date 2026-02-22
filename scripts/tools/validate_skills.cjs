/**
 * 文件: validate_skills.js
 * 功能: 技能与Buff配置验证工具
 * 描述: 检查 skills.json 中引用的 Buff ID 是否在已实现的脚本中存在
 * 用法: node scripts/tools/validate_skills.js
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const SKILLS_CONFIG_PATH = path.join(__dirname, '../../configs/skills/skills.json');
const SCRIPTS_DIR = path.join(__dirname, '../../src/scripts');

// 读取JSON文件
function readJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
    process.exit(1);
  }
}

// 扫描Buff脚本目录，获取所有已实现的Buff ID
function getImplementedBuffIds() {
  const buffIds = new Set();
  
  // 扫描所有子目录
  const subdirs = ['combat', 'support'];
  
  for (const subdir of subdirs) {
    const dirPath = path.join(SCRIPTS_DIR, subdir);
    if (!fs.existsSync(dirPath)) continue;
    
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith('.ts')) continue;
      
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // 查找 BUFF_ID 定义
      const match = content.match(/BUFF_ID\s*=\s*['"]([^'"]+)['"]/);
      if (match) {
        buffIds.add(match[1]);
      }
    }
  }
  
  return buffIds;
}

// 从skills.json中提取所有使用的Buff ID
function getUsedBuffIds(skills) {
  const buffIds = new Set();
  
  function extractBuffIds(obj) {
    if (!obj) return;
    
    if (Array.isArray(obj)) {
      obj.forEach(item => extractBuffIds(item));
    } else if (typeof obj === 'object') {
      // 检查 effectId 字段（技能配置中使用此字段）
      if (obj.effectId) {
        buffIds.add(obj.effectId);
      }
      // 也检查 buffId 字段（兼容）
      if (obj.buffId) {
        buffIds.add(obj.buffId);
      }
      // 递归检查所有属性
      for (const key in obj) {
        extractBuffIds(obj[key]);
      }
    }
  }
  
  extractBuffIds(skills);
  return buffIds;
}

// 主函数
function validate() {
  console.log('=== Skill & Buff Configuration Validator ===\n');
  
  // 读取技能配置
  console.log('Reading skills config...');
  const skills = readJson(SKILLS_CONFIG_PATH);
  console.log(`Found ${skills.length} skills\n`);
  
  // 获取已实现的Buff ID
  console.log('Scanning implemented Buff scripts...');
  const implementedBuffIds = getImplementedBuffIds();
  console.log(`Found ${implementedBuffIds.size} implemented Buff scripts\n`);
  
  // 获取使用的Buff ID
  console.log('Extracting used Buff IDs from skills config...');
  const usedBuffIds = getUsedBuffIds(skills);
  console.log(`Found ${usedBuffIds.size} Buff IDs referenced in skills\n`);
  
  // 检查未实现的Buff
  console.log('=== Validation Results ===\n');
  
  const missingBuffs = [];
  for (const buffId of usedBuffIds) {
    if (!implementedBuffIds.has(buffId)) {
      missingBuffs.push(buffId);
    }
  }
  
  if (missingBuffs.length > 0) {
    console.log('❌ Missing Buff implementations:');
    missingBuffs.forEach(id => console.log(`   - ${id}`));
    console.log('');
  } else {
    console.log('✅ All Buff IDs are properly implemented!\n');
  }
  
  // 列出已实现但未使用的Buff（可选信息）
  const unusedBuffs = [];
  for (const buffId of implementedBuffIds) {
    if (!usedBuffIds.has(buffId)) {
      unusedBuffs.push(buffId);
    }
  }
  
  if (unusedBuffs.length > 0) {
    console.log('ℹ️  Implemented but unused Buffs:');
    unusedBuffs.forEach(id => console.log(`   - ${id}`));
    console.log('');
  }
  
  // 返回状态码
  if (missingBuffs.length > 0) {
    console.log(`Validation FAILED: ${missingBuffs.length} missing Buff implementation(s)`);
    process.exit(1);
  } else {
    console.log('Validation PASSED');
    process.exit(0);
  }
}

validate();
