import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 技能配置文件路径
const skillsConfigPath = path.join(__dirname, '../../configs/skills/skills.json');

// 读取技能配置文件
const skillsData = JSON.parse(fs.readFileSync(skillsConfigPath, 'utf8'));

// 更新技能能量消耗
const updatedSkillsData = skillsData.map(skill => {
  const skillId = skill.id;
  
  if (skillId.includes('small')) {
    // 小技能能量消耗改为50
    return { ...skill, mpCost: 50 };
  } else if (skillId.includes('ultimate')) {
    // 大技能能量消耗改为150
    return { ...skill, mpCost: 150 };
  } else if (skillId.includes('passive')) {
    // 被动技能能量消耗保持为0
    return { ...skill, mpCost: 0 };
  }
  
  return skill;
});

// 写入更新后的技能配置文件
fs.writeFileSync(skillsConfigPath, JSON.stringify(updatedSkillsData, null, 2), 'utf8');

console.log('技能能量消耗更新完成！');
console.log('小技能能量消耗已统一设置为50');
console.log('大技能能量消耗已统一设置为150');
console.log('被动技能能量消耗保持为0');

