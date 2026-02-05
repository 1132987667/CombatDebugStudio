import { describe, it, expect } from 'vitest'
import {
  formatNormalAttack,
  formatSkillAttack,
  formatHealSkill,
  formatBuffSkill,
  formatDebuffSkill,
  formatStatusEffect,
  formatControlEffect,
  formatCriticalHit,
  formatMissedAttack,
  formatBlockedAttack,
  formatDefenseAction,
  formatChargeAction,
  formatUnitDeath,
  formatBattleVictory,
  formatBattleDefeat,
  formatBattleStart,
  formatBattleEnd,
  formatBattleLog,
  createBattleLog,
  getLogLevelColor,
  formatNormalAttackHTML,
  formatSkillAttackHTML,
  formatHealSkillHTML,
  formatBuffSkillHTML,
  formatDebuffSkillHTML,
  formatStatusEffectHTML,
  formatControlEffectHTML,
  formatCriticalHitHTML,
  formatMissedAttackHTML,
  formatBlockedAttackHTML,
  formatDefenseActionHTML,
  formatChargeActionHTML,
  formatUnitDeathHTML,
  formatBattleVictoryHTML,
  formatBattleDefeatHTML,
  formatBattleStartHTML,
  formatBattleEndHTML,
  formatBattleLogHTML,
  createBattleLogHTML,
} from '@/utils/BattleLogFormatter'

describe('BattleLogFormatter', () => {
  describe('标准格式测试', () => {
    it('普通攻击格式', () => {
      const result = formatNormalAttack({
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 50,
      })
      expect(result.result).toBe(
        '战士 对 哥布林 发动普通攻击，造成 50 点物理伤害。',
      )
      expect(result.level).toBe('damage')
    })

    it('技能攻击格式', () => {
      const result = formatSkillAttack({
        turn: 2,
        source: '法师',
        target: '哥布林',
        skillName: '火球术',
        damage: 100,
        damageType: '魔法',
      })
      expect(result.result).toBe(
        '法师 对 哥布林 发动终极技能【火球术】，造成 100 点魔法伤害。',
      )
      expect(result.level).toBe('damage')
    })

    it('治疗技能格式', () => {
      const result = formatHealSkill({
        turn: 3,
        source: '牧师',
        target: '战士',
        skillName: '治愈之光',
        heal: 80,
      })
      expect(result.result).toBe(
        '牧师 对 战士 施放【治愈之光】，为其恢复 80 点生命值。',
      )
      expect(result.level).toBe('heal')
    })

    it('增益技能格式', () => {
      const result = formatBuffSkill({
        turn: 4,
        source: '法师',
        targetScope: '全体队友',
        skillName: '力量祝福',
        effect: '攻击力提升20%',
        duration: 3,
      })
      expect(result.result).toBe(
        '法师 对 全体队友 施加【力量祝福】，使攻击力提升20%，持续3回合。',
      )
      expect(result.level).toBe('status')
    })

    it('减益技能格式', () => {
      const result = formatDebuffSkill({
        turn: 5,
        source: '巫师',
        target: '哥布林',
        skillName: '虚弱诅咒',
        effect: '防御力降低30%',
        duration: 2,
      })
      expect(result.result).toBe(
        '巫师 对 哥布林 施放【虚弱诅咒】，成功使防御力降低30%，持续2回合。',
      )
      expect(result.level).toBe('status')
    })

    it('状态效果格式', () => {
      const result = formatStatusEffect({
        triggerTime: '回合开始',
        source: '战士',
        target: '哥布林',
        statusName: '流血',
        damage: 15,
        damageType: '持续',
      })
      expect(result.result).toBe(
        '[回合开始] 战士的【流血】效果对 哥布林 生效，造成 15 点持续伤害。',
      )
      expect(result.level).toBe('damage')
    })

    it('控制效果格式', () => {
      const result = formatControlEffect({
        turn: 6,
        source: '法师',
        target: '哥布林',
        skillName: '冰冻术',
        statusName: '冰冻',
      })
      expect(result.result).toBe(
        '法师 对 哥布林 发动【冰冻术】，成功使目标陷入【冰冻】状态，无法行动。',
      )
      expect(result.level).toBe('status')
    })

    it('暴击效果格式', () => {
      const result = formatCriticalHit({
        turn: 7,
        source: '战士',
        target: '哥布林',
        skillName: '重击',
        damage: 150,
        damageType: '物理',
      })
      expect(result.result).toBe(
        '战士 对 哥布林 发动【重击】，触发会心一击，造成 150 点物理伤害。',
      )
      expect(result.level).toBe('crit')
    })

    it('未命中格式', () => {
      const result = formatMissedAttack({
        turn: 8,
        source: '弓箭手',
        target: '哥布林',
        skillName: '精准射击',
      })
      expect(result.result).toBe(
        '弓箭手 对 哥布林 发动【精准射击】，攻击被闪避，未命中。',
      )
      expect(result.level).toBe('status')
    })

    it('格挡格式', () => {
      const result = formatBlockedAttack({
        turn: 9,
        source: '战士',
        target: '哥布林',
        skillName: '猛击',
        damage: 30,
      })
      expect(result.result).toBe(
        '战士 对 哥布林 发动【猛击】，攻击被格挡，最终造成 30 点伤害。',
      )
      expect(result.level).toBe('damage')
    })

    it('防御动作格式', () => {
      const result = formatDefenseAction({
        turn: 10,
        source: '战士',
        stanceName: '防御',
        effect: '防御力提升50%',
      })
      expect(result.result).toBe('战士 采取了【防御】姿态，防御力提升50%。')
      expect(result.level).toBe('status')
    })

    it('蓄力动作格式', () => {
      const result = formatChargeAction({
        turn: 11,
        source: '法师',
        chargeDescription: '凝聚魔力',
        skillName: '陨石术',
      })
      expect(result.result).toBe(
        '法师 开始凝聚魔力，将在下回合释放【陨石术】。',
      )
      expect(result.level).toBe('status')
    })

    it('单位死亡格式', () => {
      const result = formatUnitDeath({
        turn: 12,
        source: '战士',
        target: '哥布林',
      })
      expect(result.result).toBe(
        '战士 对 哥布林 造成了致命一击，哥布林 被击败。',
      )
      expect(result.level).toBe('info')
    })

    it('战斗胜利格式', () => {
      const result = formatBattleVictory({
        exp: 1000,
        gold: 500,
      })
      expect(result.result).toBe(
        '【战斗结束】我方取得了胜利，获得经验值1000点，金币500枚。',
      )
      expect(result.level).toBe('info')
    })

    it('战斗失败格式', () => {
      const result = formatBattleDefeat({})
      expect(result.result).toBe('【战斗结束】我方已全军覆没，战斗失败。')
      expect(result.level).toBe('info')
    })

    it('战斗开始格式', () => {
      const result = formatBattleStart({
        source: '3',
        target: '2',
      })
      expect(result.result).toBe(
        '【战斗开始】战斗开始！参战角色: 3 人，参战敌人: 2 人',
      )
      expect(result.level).toBe('info')
    })

    it('战斗结束格式', () => {
      const result = formatBattleEnd({
        source: '我方',
      })
      expect(result.result).toBe('【战斗结束】战斗结束！胜利者: 我方')
      expect(result.level).toBe('info')
    })
  })

  describe('智能格式化函数', () => {
    it('自动选择正确的格式化方法', () => {
      const result = formatBattleLog('normal_attack', {
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 50,
      })
      expect(result.result).toBe(
        '战士 对 哥布林 发动普通攻击，造成 50 点物理伤害。',
      )
    })

    it('处理未知动作类型', () => {
      const result = formatBattleLog('unknown_action', {
        turn: 1,
        source: '战士',
        target: '哥布林',
      })
      expect(result.result).toBe('战士 对 哥布林 执行了未知动作。')
    })
  })

  describe('创建完整日志对象', () => {
    it('生成标准日志对象', () => {
      const log = createBattleLog('normal_attack', {
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 50,
      })

      expect(log.turn).toBe('回合1')
      expect(log.source).toBe('战士')
      expect(log.action).toBe('对')
      expect(log.target).toBe('哥布林')
      expect(log.result).toBe(
        '战士 对 哥布林 发动普通攻击，造成 50 点物理伤害。',
      )
      expect(log.level).toBe('damage')
    })

    it('支持自定义日志级别', () => {
      const log = createBattleLog(
        'normal_attack',
        {
          turn: 1,
          source: '战士',
          target: '哥布林',
          damage: 50,
        },
        'ally',
      )

      expect(log.level).toBe('ally')
    })
  })

  describe('日志颜色映射', () => {
    it('返回正确的颜色值', () => {
      expect(getLogLevelColor('damage')).toBe('#f44336')
      expect(getLogLevelColor('heal')).toBe('#4caf50')
      expect(getLogLevelColor('crit')).toBe('#ff9800')
      expect(getLogLevelColor('status')).toBe('#2196f3')
      expect(getLogLevelColor('info')).toBe('#9e9e9e')
      expect(getLogLevelColor('ally')).toBe('#4fc3f7')
      expect(getLogLevelColor('enemy')).toBe('#e94560')
    })

    it('处理未知级别返回默认颜色', () => {
      expect(getLogLevelColor('unknown' as any)).toBe('#9e9e9e')
    })
  })

  describe('HTML语义化格式测试', () => {
    it('普通攻击HTML格式（普通伤害）', () => {
      const result = formatNormalAttackHTML({
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 50,
      })
      expect(result.htmlResult).toBe(
        '战士 对 哥布林 发动普通攻击，造成 50 点物理伤害。',
      )
      expect(result.level).toBe('damage')
    })

    it('普通攻击HTML格式（暴击伤害）', () => {
      const result = formatNormalAttackHTML({
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 100,
        isCritical: true,
      })
      expect(result.htmlResult).toContain('<span class="crit-value">100</span>')
      expect(result.level).toBe('crit')
    })

    it('普通攻击HTML格式（指定敌方目标）', () => {
      const result = formatNormalAttackHTML({
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 50,
        targetIsAlly: false,
      })
      expect(result.htmlResult).toBe(
        '战士 对 <span class="source-enemy">哥布林</span> 发动普通攻击，造成 50 点物理伤害。',
      )
      expect(result.level).toBe('damage')
    })

    it('普通攻击HTML格式（指定友方目标）', () => {
      const result = formatNormalAttackHTML({
        turn: 1,
        source: '战士',
        target: '牧师',
        damage: 50,
        targetIsAlly: true,
      })
      expect(result.htmlResult).toBe(
        '战士 对 <span class="source-ally">牧师</span> 发动普通攻击，造成 50 点物理伤害。',
      )
      expect(result.level).toBe('damage')
    })

    it('技能攻击HTML格式', () => {
      const result = formatSkillAttackHTML({
        turn: 2,
        source: '法师',
        target: '哥布林',
        skillName: '火球术',
        damage: 100,
        damageType: '魔法',
      })
      expect(result.htmlResult).toContain('<span class="skill-attack">【火球术】</span>')
      expect(result.level).toBe('damage')
    })

    it('技能攻击HTML格式（暴击）', () => {
      const result = formatSkillAttackHTML({
        turn: 2,
        source: '法师',
        target: '哥布林',
        skillName: '火球术',
        damage: 200,
        damageType: '魔法',
        isCritical: true,
      })
      expect(result.htmlResult).toContain('<span class="skill-attack">【火球术】</span>')
      expect(result.htmlResult).toContain('<span class="crit-value">200</span>')
      expect(result.level).toBe('crit')
    })

    it('治疗技能HTML格式', () => {
      const result = formatHealSkillHTML({
        turn: 3,
        source: '牧师',
        target: '战士',
        skillName: '治愈之光',
        heal: 80,
      })
      expect(result.htmlResult).toContain('<span class="skill-heal">【治愈之光】</span>')
      expect(result.htmlResult).toContain('<span class="heal-value">80</span>')
      expect(result.level).toBe('heal')
    })

    it('增益技能HTML格式', () => {
      const result = formatBuffSkillHTML({
        turn: 4,
        source: '法师',
        targetScope: '全体队友',
        skillName: '力量祝福',
        effect: '攻击力提升20%',
        duration: 3,
      })
      expect(result.htmlResult).toContain('<span class="skill-heal">【力量祝福】</span>')
      expect(result.htmlResult).toContain('<span class="buff">攻击力提升20%</span>')
      expect(result.level).toBe('status')
    })

    it('减益技能HTML格式', () => {
      const result = formatDebuffSkillHTML({
        turn: 5,
        source: '巫师',
        target: '哥布林',
        skillName: '虚弱诅咒',
        effect: '防御力降低30%',
        duration: 2,
      })
      expect(result.htmlResult).toContain('<span class="skill-debuff">【虚弱诅咒】</span>')
      expect(result.htmlResult).toContain('<span class="debuff">防御力降低30%</span>')
      expect(result.level).toBe('status')
    })

    it('状态效果HTML格式', () => {
      const result = formatStatusEffectHTML({
        triggerTime: '回合开始',
        source: '战士',
        target: '哥布林',
        statusName: '流血',
        damage: 15,
        damageType: '持续',
      })
      expect(result.htmlResult).toContain('<span class="debuff">【流血】</span>')
      expect(result.level).toBe('damage')
    })

    it('控制效果HTML格式', () => {
      const result = formatControlEffectHTML({
        turn: 6,
        source: '法师',
        target: '哥布林',
        skillName: '冰冻术',
        statusName: '冰冻',
      })
      expect(result.htmlResult).toContain('<span class="skill-debuff">【冰冻术】</span>')
      expect(result.htmlResult).toContain('<span class="debuff">【冰冻】</span>')
      expect(result.level).toBe('status')
    })

    it('暴击效果HTML格式', () => {
      const result = formatCriticalHitHTML({
        turn: 7,
        source: '战士',
        target: '哥布林',
        skillName: '重击',
        damage: 150,
        damageType: '物理',
      })
      expect(result.htmlResult).toContain('<span class="skill-attack">【重击】</span>')
      expect(result.htmlResult).toContain('<span class="crit-value">150</span>')
      expect(result.level).toBe('crit')
    })

    it('闪避HTML格式', () => {
      const result = formatMissedAttackHTML({
        turn: 8,
        source: '弓箭手',
        target: '哥布林',
        skillName: '精准射击',
      })
      expect(result.htmlResult).toContain('<span class="skill-attack">【精准射击】</span>')
      expect(result.htmlResult).toContain('<span class="evade">闪避</span>')
      expect(result.level).toBe('status')
    })

    it('格挡HTML格式', () => {
      const result = formatBlockedAttackHTML({
        turn: 9,
        source: '战士',
        target: '哥布林',
        skillName: '猛击',
        damage: 30,
      })
      expect(result.htmlResult).toContain('<span class="skill-attack">【猛击】</span>')
      expect(result.htmlResult).toContain('<span class="evade">格挡</span>')
      expect(result.level).toBe('damage')
    })

    it('防御动作HTML格式', () => {
      const result = formatDefenseActionHTML({
        turn: 10,
        source: '战士',
        stanceName: '防御',
        effect: '防御力提升50%',
      })
      expect(result.htmlResult).toContain('<span class="skill-heal">【防御】</span>')
      expect(result.level).toBe('status')
    })

    it('蓄力动作HTML格式', () => {
      const result = formatChargeActionHTML({
        turn: 11,
        source: '法师',
        chargeDescription: '凝聚魔力',
        skillName: '陨石术',
      })
      expect(result.htmlResult).toContain('<span class="skill-attack">【陨石术】</span>')
      expect(result.level).toBe('status')
    })

    it('单位死亡HTML格式', () => {
      const result = formatUnitDeathHTML({
        turn: 12,
        source: '战士',
        target: '哥布林',
      })
      expect(result.htmlResult).toContain('哥布林')
      expect(result.level).toBe('info')
    })

    it('战斗胜利HTML格式', () => {
      const result = formatBattleVictoryHTML({
        exp: 1000,
        gold: 500,
      })
      expect(result.htmlResult).toContain('<span class="resource">1000</span>')
      expect(result.htmlResult).toContain('<span class="resource">500</span>')
      expect(result.level).toBe('info')
    })

    it('战斗失败HTML格式', () => {
      const result = formatBattleDefeatHTML({})
      expect(result.htmlResult).toBe('【战斗结束】我方已全军覆没，战斗失败。')
      expect(result.level).toBe('info')
    })

    it('战斗开始HTML格式', () => {
      const result = formatBattleStartHTML({
        source: '3',
        target: '2',
      })
      expect(result.htmlResult).toBe(
        '【战斗开始】战斗开始！参战角色: 3 人，参战敌人: 2 人',
      )
      expect(result.level).toBe('info')
    })

    it('战斗结束HTML格式', () => {
      const result = formatBattleEndHTML({
        source: '我方',
      })
      expect(result.htmlResult).toBe('【战斗结束】战斗结束！胜利者: 我方')
      expect(result.level).toBe('info')
    })
  })

  describe('智能HTML格式化函数', () => {
    it('自动选择正确的HTML格式化方法', () => {
      const result = formatBattleLogHTML('normal_attack', {
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 50,
      })
      expect(result.htmlResult).toBe(
        '战士 对 哥布林 发动普通攻击，造成 50 点物理伤害。',
      )
    })

    it('处理未知动作类型', () => {
      const result = formatBattleLogHTML('unknown_action', {
        turn: 1,
        source: '战士',
        target: '哥布林',
      })
      expect(result.htmlResult).toBe('战士 对 哥布林 执行了未知动作。')
    })
  })

  describe('创建完整HTML日志对象', () => {
    it('生成标准HTML日志对象', () => {
      const log = createBattleLogHTML('normal_attack', {
        turn: 1,
        source: '战士',
        target: '哥布林',
        damage: 50,
      })

      expect(log.turn).toBe('回合1')
      expect(log.htmlResult).toBe(
        '战士 对 哥布林 发动普通攻击，造成 50 点物理伤害。',
      )
      expect(log.level).toBe('damage')
    })

    it('生成暴击HTML日志对象', () => {
      const log = createBattleLogHTML('critical_hit', {
        turn: 1,
        source: '战士',
        target: '哥布林',
        skillName: '重击',
        damage: 150,
        damageType: '物理',
      })

      expect(log.htmlResult).toContain('<span class="skill-attack">【重击】</span>')
      expect(log.htmlResult).toContain('<span class="crit-value">150</span>')
      expect(log.level).toBe('crit')
    })

    it('支持自定义日志级别', () => {
      const log = createBattleLogHTML(
        'normal_attack',
        {
          turn: 1,
          source: '战士',
          target: '哥布林',
          damage: 50,
        },
        'ally',
      )

      expect(log.level).toBe('ally')
    })
  })
})
