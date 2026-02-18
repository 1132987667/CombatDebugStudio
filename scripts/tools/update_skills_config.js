import fs from 'fs'
import path from 'path'

// 读取skills.json文件
const skillsPath = path.join('configs', 'skills', 'skills.json')
const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'))

// 修改buffId为effectId
function updateSkillsConfig(skills) {
  if (Array.isArray(skills)) {
    skills.forEach(skill => {
      if (skill.steps) {
        skill.steps.forEach(step => {
          if (step.buffId) {
            // 替换buffId为effectId
            step.effectId = step.buffId
            delete step.buffId
            
            // 添加effectParams（如果需要）
            if (!step.effectParams) {
              step.effectParams = {}
            }
            
            // 保留其他参数
            if (step.duration) {
              step.effectParams.duration = step.duration
            }
            if (step.stacks) {
              step.effectParams.stacks = step.stacks
            }
          }
        })
      }
    })
  }
  return skills
}

// 执行修改
const updatedSkillsData = updateSkillsConfig(skillsData)

// 写回文件
fs.writeFileSync(skillsPath, JSON.stringify(updatedSkillsData, null, 2), 'utf8')

console.log('Skills configuration updated successfully!')
console.log('All buffId fields have been replaced with effectId.')
