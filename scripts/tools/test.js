const data = [
  {
    id: 'skill_enemy_001_small',
    name: '花粉迷雾',
    description:
      '对单个敌人造成80%攻击力的普通伤害，并使其命中率降低30%，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        target: 'enemy',
        scope: 'single',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_hit_reduction',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_002_small',
    name: '缠绕根须',
    description:
      '对单个敌人造成85%攻击力的普通伤害，并使其速度降低25%，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 1,
        effectId: 'buff_speed_reduction',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_003_small',
    name: '野性扑击',
    description: '对单个敌人造成90%攻击力的普通伤害，并恢复造成伤害15%的生命值',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'heal',
        formula: 'damage*0.15',
        target: 'self',
      },
    ],
  },
  {
    id: 'skill_enemy_004_small',
    name: '毒液喷射',
    description:
      '对单个敌人造成85%攻击力的普通伤害，并施加中毒效果，每回合造成攻击者攻击力10%的伤害，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_poison',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_005_small',
    name: '岩石投掷',
    description: '对单个敌人造成110%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_006_small',
    name: '狂怒连击',
    description:
      '对单个敌人进行两次连续攻击，每次造成60%攻击力的普通伤害，总计120%攻击力',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.6',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.6',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_004_passive',
    name: '坚韧表皮',
    description: '被动效果：永久降低受到的暴击伤害15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_crit_damage_reduction',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_005_passive',
    name: '石化皮肤',
    description: '被动效果：受到普通攻击时，伤害降低10%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_stone_skin',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_006_passive',
    name: '山林之子',
    description: '被动效果：免疫减速效果',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_mountain_child',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_007_small',
    name: '剧毒荆棘',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并施加强效中毒效果，每回合造成攻击者攻击力15%的伤害，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 2,
        effectId: 'buff_strong_poison',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_008_small',
    name: '碎石猛击',
    description:
      '对单个敌人造成110%攻击力的普通伤害，并有25%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_001_small',
    name: '守护之光',
    description:
      '对单个敌人造成95%攻击力的普通伤害，并为自身施加护盾，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 1,
        target: 'self',
        effectId: 'buff_shield',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_007_passive',
    name: '花之再生',
    description: '被动效果：每回合结束时，恢复自身最大生命值5%的生命值',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_flower_regeneration',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_008_passive',
    name: '首领威严',
    description: '被动效果：为所有友方单位施加光环，提升攻击力和防御力',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_leader_awe',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_001_passive',
    name: '山灵庇护',
    description:
      '被动效果：受到攻击时，有15%几率使攻击者减速，持续2回合；永久提升自身防御力20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_mountain_protection',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_007_ultimate',
    name: '万花齐放',
    description:
      '终极技能：对所有敌人造成120%攻击力的普通伤害，并使其受到30%额外伤害，持续2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.2',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_flower_bloom',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_008_ultimate',
    name: '山崩地裂',
    description:
      '终极技能：对眩晕状态的单个敌人造成180%攻击力的普通伤害（仅对眩晕目标有效）',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.8',
        attackType: 'normal',
      },
    ],
    condition: "target.hasBuff('buff_stun')",
  },
  {
    id: 'skill_boss_001_ultimate',
    name: '山神降临',
    description:
      '终极技能：使自身进入山神状态，攻击力和防御力大幅提升，持续2回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        stacks: 1,
        effectId: 'buff_mountain_god',
        effectParams: {
          duration: 2,
          stacks: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_009_small',
    name: '水枪射击',
    description:
      '对单个敌人造成85%攻击力的普通伤害，并使其防御力降低20%，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.2',
        duration: 1,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_010_small',
    name: '钳击',
    description: '对单个敌人造成95%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_011_small',
    name: '滑溜闪避',
    description:
      '对单个敌人造成80%攻击力的普通伤害，并为自身提升闪避率，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 1,
        target: 'self',
        effectId: 'buff_dodge_up',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_012_small',
    name: '水刃连斩',
    description:
      '对单个敌人进行两次连续攻击，每次造成65%攻击力的普通伤害，总计130%攻击力',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.65',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.65',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_013_small',
    name: '铁甲冲击',
    description:
      '对单个敌人造成100%攻击力的普通伤害，并为自身提升防御力，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 1,
        target: 'self',
        effectId: 'buff_def_up',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_014_small',
    name: '水泡困缚',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并使其速度降低30%，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_speed_reduction',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_012_passive',
    name: '队长指挥',
    description: '被动效果：为所有友方单位施加光环，提升暴击率',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_commander',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_013_passive',
    name: '甲壳防御',
    description: '被动效果：永久降低受到的物理伤害15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_shell_defense',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_014_passive',
    name: '鱼群之怒',
    description: '被动效果：每回合结束时，有30%几率清除自身一个负面状态',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_fish_rage',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_015_small',
    name: '统领之击',
    description: '对单个敌人造成105%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.05',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_016_small',
    name: '金甲护体',
    description:
      '对单个敌人造成95%攻击力的普通伤害，并为自身施加黄金护盾，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        target: 'self',
        effectId: 'buff_gold_shield',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_boss_002_small',
    name: '水疗波',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并为生命值最低的友方单位恢复50%攻击力的生命值',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'heal',
        formula: 'attack*0.5',
        target: 'lowest_ally',
      },
    ],
  },
  {
    id: 'skill_enemy_015_passive',
    name: '统御水域',
    description: '被动效果：为所有友方单位施加水元素共鸣光环，提升水属性攻击力',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_water_dominance',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_016_passive',
    name: '黄金甲壳',
    description: '被动效果：永久降低受到的魔法伤害20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_gold_shell',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_002_passive',
    name: '水之共鸣',
    description:
      '被动效果：每回合开始时，为生命值最低的友方单位恢复5%最大生命值；永久提升自身生命值15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_water_resonance',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_015_ultimate',
    name: '水军冲锋',
    description:
      '终极技能：对所有敌人造成110%攻击力的普通伤害，并使其速度降低40%，持续2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 2,
        effectId: 'buff_speed_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_016_ultimate',
    name: '甲壳风暴',
    description:
      '终极技能：对单个敌人造成190%攻击力的普通伤害，并使其防御力降低100%，持续2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_boss_002_ultimate',
    name: '涧水狂澜',
    description:
      '终极技能：对所有敌人造成130%攻击力的普通伤害，并施加潮湿效果，使其受到50%额外伤害，持续3回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 3,
        effectId: 'buff_wet',
        effectParams: {
          duration: 3,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_017_small',
    name: '岩刺突袭',
    description:
      '对单个敌人造成85%攻击力的普通伤害，并有20%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.2',
        duration: 2,
        effectId: 'buff_bleed',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_018_small',
    name: '碎石飞溅',
    description:
      '对单个敌人造成85%攻击力的普通伤害，并对随机相邻敌人造成50%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.5',
        attackType: 'normal',
        target: 'random_adjacent',
      },
    ],
  },
  {
    id: 'skill_enemy_019_small',
    name: '土遁偷袭',
    description:
      '对单个敌人造成95%攻击力的普通伤害，并为自身提升闪避率，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 1,
        target: 'self',
        effectId: 'buff_dodge_up',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_020_small',
    name: '巨石碾压',
    description:
      '对单个敌人造成110%攻击力的普通伤害，并有25%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_021_small',
    name: '铁石重击',
    description: '对单个敌人造成120%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.2',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_022_small',
    name: '地裂术',
    description:
      '对单个敌人造成100%攻击力的普通伤害，并使其速度降低100%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_speed_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_020_passive',
    name: '岩石肌肤',
    description: '被动效果：受到普通攻击时，伤害降低10%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_stone_flesh',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_021_passive',
    name: '金属化',
    description: '被动效果：受到魔法攻击时，有20%几率使攻击者受到30%反弹伤害',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_metallization',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_022_passive',
    name: '土灵加护',
    description: '被动效果：受到攻击时，有15%几率为自身施加护盾',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_earth_protection',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_023_small',
    name: '山崩',
    description:
      '对单个敌人造成130%攻击力的普通伤害，并有30%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_024_small',
    name: '金刚破',
    description: '对单个敌人造成115%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.15',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_boss_003_small',
    name: '地脉涌动',
    description:
      '对单个敌人造成100%攻击力的普通伤害，并为所有友方单位恢复30%攻击力的生命值',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'heal',
        formula: 'attack*0.3',
        target: 'all_allies',
      },
    ],
  },
  {
    id: 'skill_enemy_023_small',
    name: '不动如山',
    description: '被动效果：免疫眩晕和击退效果',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_unshakable',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_024_small',
    name: '金刚不坏',
    description:
      '被动效果：受到攻击时，有25%几率使自身防御力提升5%（可叠加5层）',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_indestructible',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_003_passive',
    name: '大地恩赐',
    description:
      '被动效果：生命值低于50%时，每回合结束时恢复10%最大生命值；永久提升自身生命值20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_earth_gift',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_023_small',
    name: '陨石天降',
    description:
      '终极技能：对所有敌人造成140%攻击力的普通伤害，并使其防御力降低40%，持续2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.4',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_024_small',
    name: '金刚怒',
    description:
      '终极技能：对单个敌人造成220%攻击力的普通伤害，并使其攻击力降低100%，持续2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*2.2',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_atk_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_boss_003_ultimate',
    name: '山神震怒',
    description:
      '终极技能：对所有敌人造成150%攻击力的普通伤害，并有50%几率使目标石化1回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.5',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 1,
        effectId: 'buff_petrify',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_025_small',
    name: '藤鞭抽打',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并施加中毒效果，每回合造成攻击者攻击力10%的伤害，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 2,
        effectId: 'buff_poison',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_026_small',
    name: '迷幻攻击',
    description:
      '对单个敌人造成85%攻击力的普通伤害，并有20%几率使目标混乱1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.2',
        duration: 1,
        effectId: 'buff_confusion',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_027_small',
    name: '野猪冲撞',
    description: '对单个敌人造成100%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_028_small',
    name: '根须缠绕',
    description:
      '对单个敌人造成95%攻击力的普通伤害，并有30%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_029_small',
    name: '迷魂阵',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并有35%几率使目标混乱1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.35',
        duration: 1,
        effectId: 'buff_confusion',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_030_small',
    name: '狂暴冲撞',
    description: '对单个敌人造成120%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.2',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_028_passive',
    name: '老树盘根',
    description: '被动效果：受到攻击时，有20%几率使攻击者减速，持续2回合',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_old_tree_roots',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_029_passive',
    name: '妖气弥漫',
    description: '被动效果：为所有友方单位施加光环，提升闪避率',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_demon_aura',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_030_passive',
    name: '厚皮',
    description: '被动效果：永久降低受到的暴击伤害25%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_thick_skin',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_031_small',
    name: '毒雾弥漫',
    description:
      '对所有敌人造成80%攻击力的普通伤害，并施加中毒效果，每回合造成攻击者攻击力10%的伤害，持续3回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 3,
        effectId: 'buff_poison',
        effectParams: {
          duration: 3,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_032_small',
    name: '妖术封印',
    description:
      '对单个敌人造成95%攻击力的普通伤害，并有30%几率封印目标技能1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_seal',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_004_small',
    name: '迷雾之护',
    description:
      '对单个敌人造成100%攻击力的普通伤害，并为自身施加迷雾护盾，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 1,
        target: 'self',
        effectId: 'buff_mist_shield',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_031_passive',
    name: '千年树龄',
    description: '被动效果：每回合结束时，恢复自身最大生命值5%的生命值',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_thousand_year',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_032_passive',
    name: '老谋深算',
    description: '被动效果：受到的负面状态持续时间减少1回合',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_scheming',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_004_passive',
    name: '迷雾笼罩',
    description:
      '被动效果：为所有友方单位施加光环，提升全体闪避率；永久提升自身速度20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_mist_coverage',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_031_ultimate',
    name: '森林之怒',
    description:
      '终极技能：对所有敌人造成130%攻击力的普通伤害，并为所有友方单位提升攻击力20%，持续2回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        target: 'all_allies',
        effectId: 'buff_forest_rage',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_032_ultimate',
    name: '妖气爆发',
    description:
      '终极技能：对所有敌人造成140%攻击力的普通伤害，并使其攻击力降低50%，持续2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.4',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 2,
        effectId: 'buff_atk_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_boss_004_ultimate',
    name: '迷雾幻境',
    description: '终极技能：使所有敌人有60%几率陷入混乱状态2回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'debuff',
        formula: '0.6',
        duration: 2,
        effectId: 'buff_confusion',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_033_small',
    name: '流沙陷阱',
    description:
      '对单个敌人造成90%攻击力的普通伤害,并有30%概率使其受到重度减速效果持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_slow_heavy',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_034_small',
    name: '毒牙撕咬',
    description:
      '对单个敌人造成95%攻击力的普通伤害,并有25%概率使其中毒持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 2,
        effectId: 'buff_poison',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_035_small',
    name: '水波冲击',
    description:
      '对单个敌人造成85%攻击力的普通伤害,并有50%概率对随机相邻敌人造成50%攻击力的溅射伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.5',
        attackType: 'normal',
        target: 'random_adjacent',
      },
    ],
  },
  {
    id: 'skill_enemy_036_small',
    name: '沙暴术',
    description:
      '对所有敌人造成70%攻击力的普通伤害,并有20%概率使敌人命中率降低持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.7',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.2',
        duration: 2,
        effectId: 'buff_hit_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_037_small',
    name: '缠绕绞杀',
    description:
      '对单个敌人造成110%攻击力的普通伤害,并有30%概率使其眩晕持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_038_small',
    name: '水刃连斩',
    description: '对单个敌人造成两次70%攻击力的普通伤害,总共140%攻击力的伤害',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.7',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.7',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_036_passive',
    name: '流沙之体',
    description: '被动技能,自身获得流沙之体效果,永久提升防御力和闪避率',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_quicksand_body',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_037_passive',
    name: '蛇皮',
    description: '被动技能,自身获得蛇皮效果,永久提升物理防御力和毒素抗性',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_snake_skin',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_038_passive',
    name: '水之加护',
    description: '被动技能,自身获得水之加护效果,永久提升魔法防御力和水属性抗性',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_water_protection',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_039_small',
    name: '沙尘暴',
    description:
      '对所有敌人造成90%攻击力的普通伤害,并有40%概率使敌人命中率降低持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 2,
        effectId: 'buff_hit_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_040_small',
    name: '剧毒喷射',
    description:
      '对所有敌人造成80%攻击力的普通伤害,并有50%概率使敌人受到强效中毒效果持续3回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 3,
        effectId: 'buff_strong_poison',
        effectParams: {
          duration: 3,
        },
      },
    ],
  },
  {
    id: 'skill_boss_005_small',
    name: '浊浪冲击',
    description:
      '对所有敌人造成100%攻击力的普通伤害,并有30%概率使敌人防御力降低持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_039_passive',
    name: '沙之化身',
    description:
      '被动技能,自身获得沙之化身效果,永久大幅提升防御力和闪避率,并对物理伤害有额外减免',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_sand_avatar',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_040_passive',
    name: '蛇王威严',
    description:
      '被动技能,自身获得蛇王威严效果,永久提升攻击力和毒素抗性,攻击时有概率使敌人中毒',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_snake_king_awe',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_005_passive',
    name: '水之守护',
    description:
      '被动技能,自身获得水之守护效果,永久提升魔法防御力和水属性抗性,受到攻击时有概率回复生命值;永久提升自身攻击力15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_water_guardian',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_039_ultimate',
    name: '流沙地狱',
    description:
      '终极技能,对所有敌人造成130%攻击力的普通伤害,并有50%概率使敌人受到重度减速效果持续2回合,最多使用2次',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 2,
        effectId: 'buff_slow_heavy',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_040_ultimate',
    name: '万蛇噬心',
    description: '终极技能,对单个敌人造成200%攻击力的普通伤害,最多使用2次',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*2.0',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_boss_005_ultimate',
    name: '河神之怒',
    description:
      '终极技能,对所有敌人造成150%攻击力的普通伤害,并有40%概率使敌人陷入溺水状态持续3回合,最多使用1次',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.5',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 3,
        effectId: 'buff_drowning',
        effectParams: {
          duration: 3,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_041_small',
    name: '火焰吐息',
    description:
      '对单个敌人造成95%攻击力的普通伤害,并有20%概率使其燃烧持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.2',
        duration: 2,
        effectId: 'buff_burn',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_042_small',
    name: '熔岩溅射',
    description:
      '对单个敌人造成90%攻击力的普通伤害,并有50%概率对随机相邻敌人造成50%攻击力的溅射伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.5',
        attackType: 'normal',
        target: 'random_adjacent',
      },
    ],
  },
  {
    id: 'skill_enemy_043_small',
    name: '火球术',
    description: '对单个敌人造成100%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_044_small',
    name: '烈焰爪击',
    description:
      '对单个敌人造成110%攻击力的普通伤害,并有30%概率使其燃烧持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_burn',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_045_small',
    name: '熔岩爆裂',
    description:
      '对所有敌人造成80%攻击力的普通伤害,并有25%概率使敌人燃烧持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 2,
        effectId: 'buff_burn',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_046_small',
    name: '火焰连斩',
    description: '对单个敌人造成两次75%攻击力的普通伤害,总共150%攻击力的伤害',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.75',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.75',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_044_passive',
    name: '熔岩皮肤',
    description:
      '被动技能,自身获得熔岩皮肤效果,永久提升物理防御力和火属性抗性,受到攻击时有概率反弹火属性伤害',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_lava_skin',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_045_passive',
    name: '火元素共鸣',
    description:
      '被动技能,自身获得火元素共鸣效果,永久提升火属性攻击力和火属性抗性',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_fire_resonance',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_046_passive',
    name: '火焰掌控',
    description: '被动技能,自身获得火焰掌控效果,永久提升暴击率和暴击伤害',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_fire_control',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_047_small',
    name: '火山喷发',
    description:
      '对所有敌人造成100%攻击力的普通伤害,并有40%概率使敌人燃烧持续3回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 3,
        effectId: 'buff_burn',
        effectParams: {
          duration: 3,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_048_small',
    name: '熔岩重击',
    description:
      '对单个敌人造成130%攻击力的普通伤害,并有25%概率使其眩晕持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_006_small',
    name: '岩浆护盾',
    description:
      '自身获得岩浆护盾效果持续2回合,大幅提升防御力,并对攻击者反弹火属性伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        target: 'self',
        effectId: 'buff_magma_shield',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_047_passive',
    name: '火焰领主',
    description:
      '被动技能,自身获得火焰领主效果,永久大幅提升火属性攻击力和火属性抗性,火属性技能伤害提升50%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_fire_lord',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_048_passive',
    name: '巨人之力',
    description:
      '被动技能,自身获得巨人之力效果,永久大幅提升攻击力和暴击伤害,物理技能伤害提升30%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_giant_power',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_006_passive',
    name: '地火之心',
    description:
      '被动技能,自身获得地火之心效果,永久提升所有属性,受到火属性伤害时回复生命值;永久提升自身攻击力20%和防御力15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_earth_fire_heart',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_047_ultimate',
    name: '炼狱火海',
    description:
      '终极技能,对所有敌人造成140%攻击力的普通伤害,并使敌人受到火属性易伤效果持续2回合,最多使用2次',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.4',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_fire_vulnerability',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_048_ultimate',
    name: '巨岩熔爆',
    description:
      '终极技能,对单个敌人造成220%攻击力的普通伤害,并使其防御力降低持续2回合,最多使用2次',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*2.2',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_boss_006_ultimate',
    name: '火山觉醒',
    description:
      '终极技能,对所有敌人造成160%攻击力的普通伤害,并有50%概率使敌人被熔岩束缚持续1回合,最多使用1次',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.6',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 1,
        effectId: 'buff_lava_bind',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_049_small',
    name: '蛛网缠绕',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并有30%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_050_small',
    name: '毒粉挥洒',
    description:
      '对单个敌人造成85%攻击力的普通伤害，并施加中毒效果，每回合造成攻击者攻击力10%的伤害，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 2,
        effectId: 'buff_poison',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_051_small',
    name: '啃噬',
    description:
      '对单个敌人造成100%攻击力的普通伤害，并恢复造成伤害20%的生命值',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'heal',
        formula: 'damage*0.2',
        target: 'self',
      },
    ],
  },
  {
    id: 'skill_enemy_052_small',
    name: '毒牙连刺',
    description:
      '对单个敌人进行两次连续攻击，每次造成70%攻击力的普通伤害，总计140%攻击力',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.7',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.7',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_053_small',
    name: '毒雾弥漫',
    description:
      '对所有敌人造成75%攻击力的普通伤害，并施加中毒效果，每回合造成攻击者攻击力10%的伤害，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.75',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_poison',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_054_small',
    name: '蛛丝束缚',
    description:
      '对单个敌人造成95%攻击力的普通伤害，并使其速度大幅降低，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 2,
        effectId: 'buff_slow_heavy',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_052_passive',
    name: '蛛网大师',
    description: '被动效果：提升自身控制技能的成功率20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_web_master',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_053_passive',
    name: '毒蛾粉',
    description:
      '被动效果：受到攻击时，有25%几率使攻击者中毒，每回合造成攻击者攻击力5%的伤害，持续2回合',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_moth_powder',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_054_passive',
    name: '亲卫之忠',
    description: '被动效果：当友方单位受到攻击时，有15%几率为其分担30%的伤害',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_guard_loyalty',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_055_small',
    name: '千丝万缕',
    description:
      '对所有敌人造成90%攻击力的普通伤害，并有40%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_056_small',
    name: '女王毒粉',
    description:
      '对所有敌人造成85%攻击力的普通伤害，并施加强效中毒效果，每回合造成攻击者攻击力15%的伤害，持续3回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.85',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 3,
        effectId: 'buff_strong_poison',
        effectParams: {
          duration: 3,
        },
      },
    ],
  },
  {
    id: 'skill_boss_007_small',
    name: '守护蛛网',
    description: '为所有友方单位施加蛛网护盾，提升防御力20%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_allies',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_guard_web',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_055_passive',
    name: '蛛后之母',
    description: '被动效果：每回合结束时，有30%几率召唤一只小蜘蛛协助战斗',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_spider_queen',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_056_passive',
    name: '女王威严',
    description: '被动效果：降低所有敌方单位的攻击力15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_queen_awe',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_007_passive',
    name: '谷中霸主',
    description:
      '被动效果：提升自身所有属性10%，并免疫所有控制效果;永久提升自身生命值25%与攻击力15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_valley_overlord',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_055_ultimate',
    name: '盘丝大阵',
    description:
      '终极技能：对所有敌人造成130%攻击力的普通伤害，并使其被束缚2回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.6',
        duration: 2,
        effectId: 'buff_bind',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_056_ultimate',
    name: '毒爆术',
    description: '终极技能：对所有敌人造成200%攻击力的普通伤害',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*2.0',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_boss_007_ultimate',
    name: '蛛谷天罗',
    description:
      '终极技能：对所有敌人造成150%攻击力的普通伤害，并降低其攻击力50%，持续2回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.5',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 2,
        effectId: 'buff_atk_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_057_small',
    name: '狮吼',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并降低其防御力20%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.2',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_058_small',
    name: '象鼻重击',
    description: '对单个敌人造成110%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_059_small',
    name: '疾风爪',
    description: '对单个敌人造成95%攻击力的普通伤害，并提升自身速度，持续1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 1,
        target: 'self',
        effectId: 'buff_speed_up',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_060_small',
    name: '统领之吼',
    description:
      '对单个敌人造成100%攻击力的普通伤害，并提升所有友方单位的攻击力，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        target: 'all_allies',
        effectId: 'buff_ally_atk_up',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_061_small',
    name: '铁甲冲撞',
    description: '对单个敌人造成130%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_062_small',
    name: '狂风之翼',
    description:
      '对所有敌人造成80%攻击力的普通伤害，并降低其速度30%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_speed_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_060_passive',
    name: '统领光环',
    description: '被动效果：提升所有友方单位的攻击力10%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_commander_aura',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_061_passive',
    name: '铁甲护体',
    description: '被动效果：提升自身防御力25%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_iron_armor',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_062_passive',
    name: '天空霸主',
    description: '被动效果：提升自身速度20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_sky_overlord',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_063_small',
    name: '近卫之怒',
    description: '对单个敌人造成120%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.2',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_064_small',
    name: '战争践踏',
    description:
      '对所有敌人造成100%攻击力的普通伤害，并降低其防御力30%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_boss_008_small',
    name: '风之护盾',
    description: '为所有友方单位施加风之护盾，提升防御力20%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_allies',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_wind_shield',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_063_passive',
    name: '近卫之盾',
    description:
      '被动效果：当友方单位受到致命伤害时，有30%几率为其抵挡50%的伤害',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_guard_shield',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_064_passive',
    name: '将军之威',
    description: '被动效果：提升所有友方单位的防御力15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_general_awe',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_008_passive',
    name: '风之灵',
    description:
      '被动效果：提升自身速度30%，并在每回合开始时恢复5%最大生命值;永久提升自身速度额外15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_wind_spirit',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_063_ultimate',
    name: '狮王咆哮',
    description:
      '终极技能：对所有敌人造成140%攻击力的普通伤害，并有40%几率使目标眩晕1回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.4',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_064_ultimate',
    name: '象阵冲锋',
    description: '终极技能：对单个敌人造成230%攻击力的普通伤害',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*2.3',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_boss_008_ultimate',
    name: '狂风绝息',
    description:
      '终极技能：对所有敌人造成160%攻击力的普通伤害，并使其窒息，持续3回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.6',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 3,
        effectId: 'buff_suffocation',
        effectParams: {
          duration: 3,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_065_small',
    name: '金刚拳',
    description:
      '对单个敌人造成100%攻击力的普通伤害，并有20%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.2',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_066_small',
    name: '禅音波',
    description:
      '对单个敌人造成90%攻击力的普通伤害，并降低其攻击力25%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.9',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 2,
        effectId: 'buff_atk_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_067_small',
    name: '护法杖击',
    description:
      '对单个敌人造成105%攻击力的普通伤害，并根据造成的伤害值为自身恢复10%的生命值',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.05',
        attackType: 'normal',
      },
      {
        type: 'heal',
        formula: 'damage*0.1',
        target: 'self',
      },
    ],
  },
  {
    id: 'skill_enemy_068_small',
    name: '力士之锤',
    description:
      '对单个敌人造成120%攻击力的普通伤害，并降低其防御力30%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.2',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_069_small',
    name: '罗汉掌',
    description: '对单个敌人造成两次75%攻击力的普通伤害，总共150%攻击力的伤害',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.75',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.75',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_070_small',
    name: '金刚护体',
    description:
      '对单个敌人造成95%攻击力的普通伤害，同时自身获得防御力提升效果持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        target: 'self',
        effectId: 'buff_def_up',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_068_passive',
    name: '力士之躯',
    description: '被动技能，自身获得力士之躯效果，永久提升攻击力和生命值上限',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_strong_body',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_069_passive',
    name: '尊者之威',
    description: '被动技能，自身获得尊者之威效果，永久提升防御力和闪避率',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_revered_awe',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_070_passive',
    name: '金刚之怒',
    description: '被动技能，自身获得金刚之怒效果，永久提升攻击力和暴击率',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_diamond_rage',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_071_small',
    name: '罗汉伏魔',
    description: '对单个敌人造成130%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_072_small',
    name: '降龙掌',
    description:
      '对单个敌人造成140%攻击力的普通伤害，并有25%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.4',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_009_small',
    name: '禅音护体',
    description: '为所有友方单位恢复50%攻击力的生命值',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_allies',
    steps: [
      {
        type: 'heal',
        formula: 'attack*0.5',
        target: 'all_allies',
      },
    ],
  },
  {
    id: 'skill_enemy_071_passive',
    name: '伏魔之力',
    description: '被动效果：对妖魔鬼怪类敌人造成的伤害提升20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_demon_subduing',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_072_passive',
    name: '龙威',
    description: '被动效果：提升自身暴击伤害20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_dragon_awe',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_009_passive',
    name: '禅心',
    description:
      '被动效果：每回合开始时，为生命值最低的友方单位恢复5%最大生命值;永久提升自身生命值20%与防御力15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_zen_heart',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_071_ultimate',
    name: '金刚伏魔阵',
    description:
      '终极技能：对所有敌人造成150%攻击力的普通伤害，并使其攻击力降低40%，持续2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.5',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 2,
        effectId: 'buff_atk_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_072_ultimate',
    name: '飞龙在天',
    description: '终极技能：对单个敌人造成240%攻击力的普通伤害',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*2.4',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_boss_009_ultimate',
    name: '雷音禅唱',
    description:
      '终极技能：对所有敌人造成170%攻击力的普通伤害，并封印所有技能2回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.7',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.6',
        duration: 2,
        effectId: 'buff_seal_all',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_073_small',
    name: '叛徒之击',
    description: '对单个敌人造成100%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_074_small',
    name: '护法之怒',
    description: '对单个敌人造成110%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.1',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_075_small',
    name: '使者之威',
    description: '对单个敌人造成95%攻击力的普通伤害，并降低其攻击力，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.95',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '1.0',
        duration: 2,
        effectId: 'buff_atk_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_076_small',
    name: '精英叛变',
    description: '对单个敌人造成120%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.2',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_077_small',
    name: '将领冲锋',
    description:
      '对单个敌人造成130%攻击力的普通伤害，并降低其防御力30%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.3',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.3',
        duration: 2,
        effectId: 'buff_def_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_078_small',
    name: '长老之杖',
    description: '对单个敌人连续造成两次80%攻击力的普通伤害',
    mpCost: 50,
    cooldown: 3,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
      {
        type: 'damage',
        formula: 'attack*0.8',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_enemy_076_passive',
    name: '叛徒之谋',
    description: '被动效果：对生命值低于50%的敌人造成的伤害提升30%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_traitor_scheme',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_077_passive',
    name: '将领之勇',
    description: '被动效果：提升自身攻击力20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_general_bravery',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_078_passive',
    name: '长老之智',
    description: '被动效果：提升自身技能暴击率20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_elder_wisdom',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_079_small',
    name: '首领之怒',
    description:
      '对所有敌人造成100%攻击力的普通伤害，并降低其攻击力40%，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.0',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.4',
        duration: 2,
        effectId: 'buff_atk_reduction',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_080_small',
    name: '统帅之击',
    description:
      '对单个敌人造成150%攻击力的普通伤害，并有25%几率使目标眩晕1回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.5',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.25',
        duration: 1,
        effectId: 'buff_stun',
        effectParams: {
          duration: 1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_010_small',
    name: '灵霄之光',
    description:
      '为所有友方单位恢复60%攻击力的生命值，并提升其攻击力，持续2回合',
    mpCost: 50,
    cooldown: 2,
    selector: 'all_allies',
    steps: [
      {
        type: 'heal',
        formula: 'attack*0.6',
        target: 'all_allies',
      },
      {
        type: 'buff',
        formula: '1.0',
        duration: 2,
        target: 'all_allies',
        effectId: 'buff_atk_up',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_079_passive',
    name: '首领光环',
    description: '被动效果：提升所有友方单位的攻击力15%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_leader_aura',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_080_passive',
    name: '统帅之威',
    description: '被动效果：提升自身防御力20%，并降低受到的控制效果持续时间50%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_commander_awe',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_boss_010_passive',
    name: '灵山祝福',
    description:
      '被动效果：每回合开始时，为所有友方单位恢复3%最大生命值;永久提升自身生命值30%与攻击力20%',
    mpCost: 0,
    cooldown: 0,
    selector: 'self',
    steps: [
      {
        type: 'buff',
        formula: '1.0',
        duration: -1,
        effectId: 'buff_sacred_blessing',
        effectParams: {
          duration: -1,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_079_ultimate',
    name: '叛变之潮',
    description:
      '终极技能：对所有敌人造成160%攻击力的普通伤害，并有50%几率使目标混乱2回合',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.6',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.5',
        duration: 2,
        effectId: 'buff_confusion',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
  {
    id: 'skill_enemy_080_ultimate',
    name: '护法天降',
    description: '终极技能：对单个敌人造成250%攻击力的普通伤害',
    mpCost: 150,
    cooldown: 3,
    maxUses: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'damage',
        formula: 'attack*2.5',
        attackType: 'normal',
      },
    ],
  },
  {
    id: 'skill_boss_010_ultimate',
    name: '灵山之巅',
    description:
      '终极技能：对所有敌人造成180%攻击力的普通伤害，并封印所有技能2回合',
    mpCost: 150,
    cooldown: 4,
    maxUses: 1,
    selector: 'all_enemies',
    steps: [
      {
        type: 'damage',
        formula: 'attack*1.8',
        attackType: 'normal',
      },
      {
        type: 'debuff',
        formula: '0.6',
        duration: 2,
        effectId: 'buff_seal_all',
        effectParams: {
          duration: 2,
        },
      },
    ],
  },
]

const data2 = [
  {
    id: 'enemy_001',
    name: '花妖',
    level: 1,
    stats: {
      health: 57,
      minAttack: 6,
      maxAttack: 9,
      defense: 3,
      speed: 11,
    },
    drops: [
      {
        itemId: 'mat_001',
        quantity: 2,
        chance: 0.8,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_001_small'],
    },
  },
  {
    id: 'enemy_002',
    name: '草精',
    level: 2,
    stats: {
      health: 68,
      minAttack: 7,
      maxAttack: 11,
      defense: 4,
      speed: 13,
    },
    drops: [
      {
        itemId: 'mat_001',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'mat_002',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_002_small'],
    },
  },
  {
    id: 'enemy_003',
    name: '幼年山魈',
    level: 2,
    stats: {
      health: 68,
      minAttack: 7,
      maxAttack: 11,
      defense: 4,
      speed: 13,
    },
    drops: [
      {
        itemId: 'mat_001',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'mat_004',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_003_small'],
    },
  },
  {
    id: 'enemy_004',
    name: '食人花妖',
    level: 4,
    stats: {
      health: 81,
      minAttack: 10,
      maxAttack: 15,
      defense: 7,
      speed: 16,
    },
    drops: [
      {
        itemId: 'mat_001',
        quantity: 3,
        chance: 0.75,
      },
      {
        itemId: 'mat_003',
        quantity: 1,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_004_small'],
      passive: ['skill_enemy_004_passive'],
    },
  },
  {
    id: 'enemy_005',
    name: '巨石精',
    level: 5,
    stats: {
      health: 92,
      minAttack: 12,
      maxAttack: 18,
      defense: 8,
      speed: 18,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 3,
        chance: 0.7,
      },
      {
        itemId: 'elix_003',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_005_small'],
      passive: ['skill_enemy_005_passive'],
    },
  },
  {
    id: 'enemy_006',
    name: '成年山魈',
    level: 5,
    stats: {
      health: 92,
      minAttack: 12,
      maxAttack: 18,
      defense: 8,
      speed: 18,
    },
    drops: [
      {
        itemId: 'mat_001',
        quantity: 4,
        chance: 0.65,
      },
      {
        itemId: 'crys_001',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_006_small'],
      passive: ['skill_enemy_006_passive'],
    },
  },
  {
    id: 'enemy_007',
    name: '花妖王',
    level: 8,
    stats: {
      health: 147,
      minAttack: 20,
      maxAttack: 30,
      defense: 14,
      speed: 23,
    },
    drops: [
      {
        itemId: 'mat_001',
        quantity: 5,
        chance: 0.7,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_007_small'],
      passive: ['skill_enemy_007_passive'],
      ultimate: ['skill_enemy_007_ultimate'],
    },
  },
  {
    id: 'enemy_008',
    name: '山魈首领',
    level: 9,
    stats: {
      health: 160,
      minAttack: 22,
      maxAttack: 33,
      defense: 15,
      speed: 25,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 5,
        chance: 0.65,
      },
      {
        itemId: 'mat_003',
        quantity: 2,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_008_small'],
      passive: ['skill_enemy_008_passive'],
      ultimate: ['skill_enemy_008_ultimate'],
    },
  },
  {
    id: 'boss_001',
    name: '小花山守护者',
    level: 9,
    stats: {
      health: 160,
      minAttack: 22,
      maxAttack: 33,
      defense: 15,
      speed: 25,
    },
    drops: [
      {
        itemId: 'mat_004',
        quantity: 3,
        chance: 0.6,
      },
      {
        itemId: 'crys_007',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_001_small'],
      passive: ['skill_boss_001_passive'],
      ultimate: ['skill_boss_001_ultimate'],
    },
  },
  {
    id: 'enemy_009',
    name: '小虾兵',
    level: 3,
    stats: {
      health: 80,
      minAttack: 9,
      maxAttack: 14,
      defense: 5,
      speed: 15,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 2,
        chance: 0.8,
      },
      {
        itemId: 'mat_004',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_009_small'],
    },
  },
  {
    id: 'enemy_010',
    name: '幼年蟹将',
    level: 4,
    stats: {
      health: 92,
      minAttack: 10,
      maxAttack: 16,
      defense: 7,
      speed: 18,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_010_small'],
    },
  },
  {
    id: 'enemy_011',
    name: '小青鱼精',
    level: 4,
    stats: {
      health: 92,
      minAttack: 10,
      maxAttack: 16,
      defense: 7,
      speed: 18,
    },
    drops: [
      {
        itemId: 'mat_004',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'elix_005',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_011_small'],
    },
  },
  {
    id: 'enemy_012',
    name: '虾兵队长',
    level: 6,
    stats: {
      health: 115,
      minAttack: 14,
      maxAttack: 22,
      defense: 10,
      speed: 22,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 3,
        chance: 0.75,
      },
      {
        itemId: 'mat_003',
        quantity: 1,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_012_small'],
      passive: ['skill_enemy_012_passive'],
    },
  },
  {
    id: 'enemy_013',
    name: '铁甲蟹将',
    level: 7,
    stats: {
      health: 128,
      minAttack: 16,
      maxAttack: 24,
      defense: 11,
      speed: 24,
    },
    drops: [
      {
        itemId: 'mat_004',
        quantity: 3,
        chance: 0.7,
      },
      {
        itemId: 'elix_003',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_013_small'],
      passive: ['skill_enemy_013_passive'],
    },
  },
  {
    id: 'enemy_014',
    name: '鱼精头目',
    level: 7,
    stats: {
      health: 128,
      minAttack: 16,
      maxAttack: 24,
      defense: 11,
      speed: 24,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 4,
        chance: 0.65,
      },
      {
        itemId: 'crys_004',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_014_small'],
      passive: ['skill_enemy_014_passive'],
    },
  },
  {
    id: 'enemy_015',
    name: '虾兵统领',
    level: 10,
    stats: {
      health: 184,
      minAttack: 26,
      maxAttack: 38,
      defense: 16,
      speed: 29,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 5,
        chance: 0.7,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_015_small'],
      passive: ['skill_enemy_015_passive'],
      ultimate: ['skill_enemy_015_ultimate'],
    },
  },
  {
    id: 'enemy_016',
    name: '金甲蟹将',
    level: 11,
    stats: {
      health: 198,
      minAttack: 28,
      maxAttack: 41,
      defense: 17,
      speed: 31,
    },
    drops: [
      {
        itemId: 'mat_004',
        quantity: 4,
        chance: 0.65,
      },
      {
        itemId: 'mat_003',
        quantity: 2,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_016_small'],
      passive: ['skill_enemy_016_passive'],
      ultimate: ['skill_enemy_016_ultimate'],
    },
  },
  {
    id: 'boss_002',
    name: '浅水涧守护者',
    level: 11,
    stats: {
      health: 198,
      minAttack: 28,
      maxAttack: 41,
      defense: 17,
      speed: 31,
    },
    drops: [
      {
        itemId: 'mat_021',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'crys_007',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_002_small'],
      passive: ['skill_boss_002_passive'],
      ultimate: ['skill_boss_002_ultimate'],
    },
  },
  {
    id: 'enemy_017',
    name: '小岩妖',
    level: 5,
    stats: {
      health: 92,
      minAttack: 12,
      maxAttack: 18,
      defense: 8,
      speed: 18,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 2,
        chance: 0.8,
      },
      {
        itemId: 'mat_006',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_017_small'],
    },
  },
  {
    id: 'enemy_018',
    name: '碎石精',
    level: 6,
    stats: {
      health: 104,
      minAttack: 14,
      maxAttack: 21,
      defense: 9,
      speed: 21,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'mat_003',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_018_small'],
    },
  },
  {
    id: 'enemy_019',
    name: '土行小妖',
    level: 6,
    stats: {
      health: 104,
      minAttack: 14,
      maxAttack: 21,
      defense: 9,
      speed: 21,
    },
    drops: [
      {
        itemId: 'mat_006',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_019_small'],
    },
  },
  {
    id: 'enemy_020',
    name: '岩妖头目',
    level: 8,
    stats: {
      health: 147,
      minAttack: 20,
      maxAttack: 30,
      defense: 14,
      speed: 23,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 4,
        chance: 0.75,
      },
      {
        itemId: 'mat_006',
        quantity: 2,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_020_small'],
      passive: ['skill_enemy_020_passive'],
    },
  },
  {
    id: 'enemy_021',
    name: '铁石精',
    level: 9,
    stats: {
      health: 160,
      minAttack: 22,
      maxAttack: 33,
      defense: 15,
      speed: 25,
    },
    drops: [
      {
        itemId: 'mat_003',
        quantity: 2,
        chance: 0.7,
      },
      {
        itemId: 'elix_003',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_021_small'],
      passive: ['skill_enemy_021_passive'],
    },
  },
  {
    id: 'enemy_022',
    name: '土行妖',
    level: 9,
    stats: {
      health: 160,
      minAttack: 22,
      maxAttack: 33,
      defense: 15,
      speed: 25,
    },
    drops: [
      {
        itemId: 'mat_006',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'crys_001',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_022_small'],
      passive: ['skill_enemy_022_passive'],
    },
  },
  {
    id: 'enemy_023',
    name: '巨岩妖',
    level: 12,
    stats: {
      health: 242,
      minAttack: 33,
      maxAttack: 49,
      defense: 21,
      speed: 34,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 6,
        chance: 0.7,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_023_small'],
      passive: ['skill_enemy_023_passive'],
      ultimate: ['skill_enemy_023_ultimate'],
    },
  },
  {
    id: 'enemy_024',
    name: '金刚石精',
    level: 13,
    stats: {
      health: 257,
      minAttack: 35,
      maxAttack: 52,
      defense: 22,
      speed: 36,
    },
    drops: [
      {
        itemId: 'mat_003',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'mat_006',
        quantity: 4,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_024_small'],
      passive: ['skill_enemy_024_passive'],
      ultimate: ['skill_enemy_024_ultimate'],
    },
  },
  {
    id: 'boss_003',
    name: '碎石坡守护者',
    level: 13,
    stats: {
      health: 257,
      minAttack: 35,
      maxAttack: 52,
      defense: 22,
      speed: 36,
    },
    drops: [
      {
        itemId: 'mat_007',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'crys_004',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_003_small'],
      passive: ['skill_boss_003_passive'],
      ultimate: ['skill_boss_003_ultimate'],
    },
  },
  {
    id: 'enemy_025',
    name: '小树精',
    level: 7,
    stats: {
      health: 128,
      minAttack: 16,
      maxAttack: 24,
      defense: 11,
      speed: 24,
    },
    drops: [
      {
        itemId: 'mat_006',
        quantity: 2,
        chance: 0.8,
      },
      {
        itemId: 'mat_009',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_025_small'],
    },
  },
  {
    id: 'enemy_026',
    name: '迷路家仆妖',
    level: 8,
    stats: {
      health: 142,
      minAttack: 18,
      maxAttack: 27,
      defense: 12,
      speed: 26,
    },
    drops: [
      {
        itemId: 'mat_010',
        quantity: 2,
        chance: 0.7,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_026_small'],
    },
  },
  {
    id: 'enemy_027',
    name: '幼年野猪精',
    level: 8,
    stats: {
      health: 142,
      minAttack: 18,
      maxAttack: 27,
      defense: 12,
      speed: 26,
    },
    drops: [
      {
        itemId: 'mat_009',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'mat_002',
        quantity: 2,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_027_small'],
    },
  },
  {
    id: 'enemy_028',
    name: '百年树精',
    level: 10,
    stats: {
      health: 184,
      minAttack: 26,
      maxAttack: 38,
      defense: 16,
      speed: 29,
    },
    drops: [
      {
        itemId: 'mat_006',
        quantity: 4,
        chance: 0.75,
      },
      {
        itemId: 'mat_008',
        quantity: 1,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_028_small'],
      passive: ['skill_enemy_028_passive'],
    },
  },
  {
    id: 'enemy_029',
    name: '家仆妖头目',
    level: 11,
    stats: {
      health: 198,
      minAttack: 28,
      maxAttack: 41,
      defense: 17,
      speed: 31,
    },
    drops: [
      {
        itemId: 'mat_010',
        quantity: 3,
        chance: 0.7,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_029_small'],
      passive: ['skill_enemy_029_passive'],
    },
  },
  {
    id: 'enemy_030',
    name: '野猪精头领',
    level: 11,
    stats: {
      health: 198,
      minAttack: 28,
      maxAttack: 41,
      defense: 17,
      speed: 31,
    },
    drops: [
      {
        itemId: 'mat_009',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'crys_002',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_030_small'],
      passive: ['skill_enemy_030_passive'],
    },
  },
  {
    id: 'enemy_031',
    name: '千年树妖',
    level: 14,
    stats: {
      health: 276,
      minAttack: 38,
      maxAttack: 56,
      defense: 23,
      speed: 39,
    },
    drops: [
      {
        itemId: 'mat_006',
        quantity: 5,
        chance: 0.7,
      },
      {
        itemId: 'mat_011',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_031_small'],
      passive: ['skill_enemy_031_passive'],
      ultimate: ['skill_enemy_031_ultimate'],
    },
  },
  {
    id: 'enemy_032',
    name: '管家妖',
    level: 15,
    stats: {
      health: 293,
      minAttack: 40,
      maxAttack: 59,
      defense: 24,
      speed: 41,
    },
    drops: [
      {
        itemId: 'mat_010',
        quantity: 4,
        chance: 0.65,
      },
      {
        itemId: 'mat_008',
        quantity: 2,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_032_small'],
      passive: ['skill_enemy_032_passive'],
      ultimate: ['skill_enemy_032_ultimate'],
    },
  },
  {
    id: 'boss_004',
    name: '迷雾林守护者',
    level: 15,
    stats: {
      health: 293,
      minAttack: 40,
      maxAttack: 59,
      defense: 24,
      speed: 41,
    },
    drops: [
      {
        itemId: 'mat_012',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'crys_005',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_004_small'],
      passive: ['skill_boss_004_passive'],
      ultimate: ['skill_boss_004_ultimate'],
    },
  },
  {
    id: 'enemy_033',
    name: '小沙妖',
    level: 9,
    stats: {
      health: 160,
      minAttack: 22,
      maxAttack: 33,
      defense: 15,
      speed: 25,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 3,
        chance: 0.8,
      },
      {
        itemId: 'mat_008',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_033_small'],
    },
  },
  {
    id: 'enemy_034',
    name: '水蛇幼体',
    level: 10,
    stats: {
      health: 175,
      minAttack: 24,
      maxAttack: 36,
      defense: 16,
      speed: 28,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 3,
        chance: 0.7,
      },
      {
        itemId: 'elix_005',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_034_small'],
    },
  },
  {
    id: 'enemy_035',
    name: '小河伯侍从',
    level: 10,
    stats: {
      health: 175,
      minAttack: 24,
      maxAttack: 36,
      defense: 16,
      speed: 28,
    },
    drops: [
      {
        itemId: 'mat_008',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_035_small'],
    },
  },
  {
    id: 'enemy_036',
    name: '沙妖头目',
    level: 12,
    stats: {
      health: 242,
      minAttack: 33,
      maxAttack: 49,
      defense: 21,
      speed: 34,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 5,
        chance: 0.75,
      },
      {
        itemId: 'mat_007',
        quantity: 1,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_036_small'],
      passive: ['skill_enemy_036_passive'],
    },
  },
  {
    id: 'enemy_037',
    name: '成年水蛇精',
    level: 13,
    stats: {
      health: 257,
      minAttack: 35,
      maxAttack: 52,
      defense: 22,
      speed: 36,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 4,
        chance: 0.7,
      },
      {
        itemId: 'elix_006',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_037_small'],
      passive: ['skill_enemy_037_passive'],
    },
  },
  {
    id: 'enemy_038',
    name: '河伯副官',
    level: 13,
    stats: {
      health: 257,
      minAttack: 35,
      maxAttack: 52,
      defense: 22,
      speed: 36,
    },
    drops: [
      {
        itemId: 'mat_008',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'crys_008',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_038_small'],
      passive: ['skill_enemy_038_passive'],
    },
  },
  {
    id: 'enemy_039',
    name: '沙妖王',
    level: 16,
    stats: {
      health: 340,
      minAttack: 46,
      maxAttack: 68,
      defense: 28,
      speed: 45,
    },
    drops: [
      {
        itemId: 'mat_002',
        quantity: 7,
        chance: 0.7,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_039_small'],
      passive: ['skill_enemy_039_passive'],
      ultimate: ['skill_enemy_039_ultimate'],
    },
  },
  {
    id: 'enemy_040',
    name: '水蛇精首领',
    level: 17,
    stats: {
      health: 357,
      minAttack: 48,
      maxAttack: 71,
      defense: 29,
      speed: 47,
    },
    drops: [
      {
        itemId: 'mat_005',
        quantity: 5,
        chance: 0.65,
      },
      {
        itemId: 'mat_007',
        quantity: 2,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_040_small'],
      passive: ['skill_enemy_040_passive'],
      ultimate: ['skill_enemy_040_ultimate'],
    },
  },
  {
    id: 'boss_005',
    name: '浊浪滩守护者',
    level: 17,
    stats: {
      health: 357,
      minAttack: 48,
      maxAttack: 71,
      defense: 29,
      speed: 47,
    },
    drops: [
      {
        itemId: 'mat_017',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'crys_002',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_005_small'],
      passive: ['skill_boss_005_passive'],
      ultimate: ['skill_boss_005_ultimate'],
    },
  },
  {
    id: 'enemy_041',
    name: '小火蜥蜴',
    level: 11,
    stats: {
      health: 198,
      minAttack: 28,
      maxAttack: 41,
      defense: 17,
      speed: 31,
    },
    drops: [
      {
        itemId: 'mat_013',
        quantity: 1,
        chance: 0.8,
      },
      {
        itemId: 'mat_007',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_041_small'],
    },
  },
  {
    id: 'enemy_042',
    name: '熔岩小精',
    level: 12,
    stats: {
      health: 213,
      minAttack: 30,
      maxAttack: 44,
      defense: 18,
      speed: 33,
    },
    drops: [
      {
        itemId: 'mat_014',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'elix_003',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_042_small'],
    },
  },
  {
    id: 'enemy_043',
    name: '火童侍者',
    level: 12,
    stats: {
      health: 213,
      minAttack: 30,
      maxAttack: 44,
      defense: 18,
      speed: 33,
    },
    drops: [
      {
        itemId: 'mat_013',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_043_small'],
    },
  },
  {
    id: 'enemy_044',
    name: '熔岩蜥蜴',
    level: 14,
    stats: {
      health: 276,
      minAttack: 38,
      maxAttack: 56,
      defense: 23,
      speed: 39,
    },
    drops: [
      {
        itemId: 'mat_013',
        quantity: 3,
        chance: 0.75,
      },
      {
        itemId: 'mat_007',
        quantity: 2,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_044_small'],
      passive: ['skill_enemy_044_passive'],
    },
  },
  {
    id: 'enemy_045',
    name: '熔岩精头目',
    level: 15,
    stats: {
      health: 293,
      minAttack: 40,
      maxAttack: 59,
      defense: 24,
      speed: 41,
    },
    drops: [
      {
        itemId: 'mat_014',
        quantity: 2,
        chance: 0.7,
      },
      {
        itemId: 'mat_011',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_045_small'],
      passive: ['skill_enemy_045_passive'],
    },
  },
  {
    id: 'enemy_046',
    name: '火童队长',
    level: 15,
    stats: {
      health: 293,
      minAttack: 40,
      maxAttack: 59,
      defense: 24,
      speed: 41,
    },
    drops: [
      {
        itemId: 'mat_015',
        quantity: 1,
        chance: 0.65,
      },
      {
        itemId: 'crys_003',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_046_small'],
      passive: ['skill_enemy_046_passive'],
    },
  },
  {
    id: 'enemy_047',
    name: '火焰蜥蜴王',
    level: 18,
    stats: {
      health: 414,
      minAttack: 56,
      maxAttack: 82,
      defense: 32,
      speed: 51,
    },
    drops: [
      {
        itemId: 'mat_013',
        quantity: 4,
        chance: 0.7,
      },
      {
        itemId: 'elix_006',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_047_small'],
      passive: ['skill_enemy_047_passive'],
      ultimate: ['skill_enemy_047_ultimate'],
    },
  },
  {
    id: 'enemy_048',
    name: '熔岩巨精',
    level: 19,
    stats: {
      health: 433,
      minAttack: 58,
      maxAttack: 85,
      defense: 33,
      speed: 53,
    },
    drops: [
      {
        itemId: 'mat_014',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'mat_007',
        quantity: 3,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_048_small'],
      passive: ['skill_enemy_048_passive'],
      ultimate: ['skill_enemy_048_ultimate'],
    },
  },
  {
    id: 'boss_006',
    name: '熔岩洞守护者',
    level: 19,
    stats: {
      health: 433,
      minAttack: 58,
      maxAttack: 85,
      defense: 33,
      speed: 53,
    },
    drops: [
      {
        itemId: 'mat_016',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'crys_006',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_006_small'],
      passive: ['skill_boss_006_passive'],
      ultimate: ['skill_boss_006_ultimate'],
    },
  },
  {
    id: 'enemy_049',
    name: '小蜘蛛精',
    level: 13,
    stats: {
      health: 257,
      minAttack: 35,
      maxAttack: 52,
      defense: 22,
      speed: 36,
    },
    drops: [
      {
        itemId: 'mat_012',
        quantity: 1,
        chance: 0.8,
      },
      {
        itemId: 'mat_023',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_049_small'],
    },
  },
  {
    id: 'enemy_050',
    name: '幼年毒蛾',
    level: 14,
    stats: {
      health: 276,
      minAttack: 38,
      maxAttack: 56,
      defense: 23,
      speed: 39,
    },
    drops: [
      {
        itemId: 'mat_022',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'elix_005',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_050_small'],
    },
  },
  {
    id: 'enemy_051',
    name: '蛛后幼虫',
    level: 14,
    stats: {
      health: 276,
      minAttack: 38,
      maxAttack: 56,
      defense: 23,
      speed: 39,
    },
    drops: [
      {
        itemId: 'mat_012',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_051_small'],
    },
  },
  {
    id: 'enemy_052',
    name: '蜘蛛精头目',
    level: 16,
    stats: {
      health: 340,
      minAttack: 46,
      maxAttack: 68,
      defense: 28,
      speed: 45,
    },
    drops: [
      {
        itemId: 'mat_012',
        quantity: 3,
        chance: 0.75,
      },
      {
        itemId: 'mat_018',
        quantity: 1,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_052_small'],
      passive: ['skill_enemy_052_passive'],
    },
  },
  {
    id: 'enemy_053',
    name: '成年毒蛾',
    level: 17,
    stats: {
      health: 357,
      minAttack: 48,
      maxAttack: 71,
      defense: 29,
      speed: 47,
    },
    drops: [
      {
        itemId: 'mat_022',
        quantity: 2,
        chance: 0.7,
      },
      {
        itemId: 'elix_006',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_053_small'],
      passive: ['skill_enemy_053_passive'],
    },
  },
  {
    id: 'enemy_054',
    name: '蛛后亲卫',
    level: 17,
    stats: {
      health: 357,
      minAttack: 48,
      maxAttack: 71,
      defense: 29,
      speed: 47,
    },
    drops: [
      {
        itemId: 'mat_018',
        quantity: 1,
        chance: 0.65,
      },
      {
        itemId: 'crys_009',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_054_small'],
      passive: ['skill_enemy_054_passive'],
    },
  },
  {
    id: 'enemy_055',
    name: '盘丝大仙',
    level: 20,
    stats: {
      health: 530,
      minAttack: 71,
      maxAttack: 105,
      defense: 38,
      speed: 59,
    },
    drops: [
      {
        itemId: 'mat_012',
        quantity: 4,
        chance: 0.7,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_055_small'],
      passive: ['skill_enemy_055_passive'],
      ultimate: ['skill_enemy_055_ultimate'],
    },
  },
  {
    id: 'enemy_056',
    name: '毒蛾女王',
    level: 21,
    stats: {
      health: 551,
      minAttack: 73,
      maxAttack: 108,
      defense: 39,
      speed: 61,
    },
    drops: [
      {
        itemId: 'mat_022',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'mat_018',
        quantity: 2,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_056_small'],
      passive: ['skill_enemy_056_passive'],
      ultimate: ['skill_enemy_056_ultimate'],
    },
  },
  {
    id: 'boss_007',
    name: '蛛丝谷守护者',
    level: 21,
    stats: {
      health: 551,
      minAttack: 73,
      maxAttack: 108,
      defense: 39,
      speed: 61,
    },
    drops: [
      {
        itemId: 'mat_019',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'crys_003',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_007_small'],
      passive: ['skill_boss_007_passive'],
      ultimate: ['skill_boss_007_ultimate'],
    },
  },
  {
    id: 'enemy_057',
    name: '小狮兵',
    level: 15,
    stats: {
      health: 293,
      minAttack: 40,
      maxAttack: 59,
      defense: 24,
      speed: 41,
    },
    drops: [
      {
        itemId: 'mat_020',
        quantity: 1,
        chance: 0.8,
      },
      {
        itemId: 'mat_016',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_057_small'],
    },
  },
  {
    id: 'enemy_058',
    name: '幼年象妖',
    level: 16,
    stats: {
      health: 312,
      minAttack: 42,
      maxAttack: 62,
      defense: 25,
      speed: 43,
    },
    drops: [
      {
        itemId: 'mat_024',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'elix_003',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_058_small'],
    },
  },
  {
    id: 'enemy_059',
    name: '小鹏怪',
    level: 16,
    stats: {
      health: 312,
      minAttack: 42,
      maxAttack: 62,
      defense: 25,
      speed: 43,
    },
    drops: [
      {
        itemId: 'mat_025',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'elix_005',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_059_small'],
    },
  },
  {
    id: 'enemy_060',
    name: '狮兵统领',
    level: 18,
    stats: {
      health: 414,
      minAttack: 56,
      maxAttack: 82,
      defense: 32,
      speed: 51,
    },
    drops: [
      {
        itemId: 'mat_020',
        quantity: 2,
        chance: 0.75,
      },
      {
        itemId: 'mat_016',
        quantity: 2,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_060_small'],
      passive: ['skill_enemy_060_passive'],
    },
  },
  {
    id: 'enemy_061',
    name: '铁甲象妖',
    level: 19,
    stats: {
      health: 433,
      minAttack: 58,
      maxAttack: 85,
      defense: 33,
      speed: 53,
    },
    drops: [
      {
        itemId: 'mat_024',
        quantity: 2,
        chance: 0.7,
      },
      {
        itemId: 'mat_011',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_061_small'],
      passive: ['skill_enemy_061_passive'],
    },
  },
  {
    id: 'enemy_062',
    name: '鹏怪头目',
    level: 19,
    stats: {
      health: 433,
      minAttack: 58,
      maxAttack: 85,
      defense: 33,
      speed: 53,
    },
    drops: [
      {
        itemId: 'mat_025',
        quantity: 2,
        chance: 0.65,
      },
      {
        itemId: 'crys_006',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_062_small'],
      passive: ['skill_enemy_062_passive'],
    },
  },
  {
    id: 'enemy_063',
    name: '狮王近卫',
    level: 22,
    stats: {
      health: 648,
      minAttack: 87,
      maxAttack: 128,
      defense: 44,
      speed: 69,
    },
    drops: [
      {
        itemId: 'mat_020',
        quantity: 3,
        chance: 0.7,
      },
      {
        itemId: 'elix_006',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_063_small'],
      passive: ['skill_enemy_063_passive'],
      ultimate: ['skill_enemy_063_ultimate'],
    },
  },
  {
    id: 'enemy_064',
    name: '象妖将军',
    level: 23,
    stats: {
      health: 670,
      minAttack: 89,
      maxAttack: 131,
      defense: 45,
      speed: 71,
    },
    drops: [
      {
        itemId: 'mat_024',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'mat_016',
        quantity: 3,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_064_small'],
      passive: ['skill_enemy_064_passive'],
      ultimate: ['skill_enemy_064_ultimate'],
    },
  },
  {
    id: 'boss_008',
    name: '狂风岭守护者',
    level: 23,
    stats: {
      health: 670,
      minAttack: 89,
      maxAttack: 131,
      defense: 45,
      speed: 71,
    },
    drops: [
      {
        itemId: 'mat_015',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'crys_009',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_008_small'],
      passive: ['skill_boss_008_passive'],
      ultimate: ['skill_boss_008_ultimate'],
    },
  },
  {
    id: 'enemy_065',
    name: '小金刚',
    level: 17,
    stats: {
      health: 357,
      minAttack: 48,
      maxAttack: 71,
      defense: 29,
      speed: 47,
    },
    drops: [
      {
        itemId: 'mat_019',
        quantity: 1,
        chance: 0.8,
      },
      {
        itemId: 'elix_002',
        quantity: 1,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_065_small'],
    },
  },
  {
    id: 'enemy_066',
    name: '罗汉侍者',
    level: 18,
    stats: {
      health: 377,
      minAttack: 50,
      maxAttack: 74,
      defense: 30,
      speed: 49,
    },
    drops: [
      {
        itemId: 'mat_017',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_066_small'],
    },
  },
  {
    id: 'enemy_067',
    name: '护法学徒',
    level: 18,
    stats: {
      health: 377,
      minAttack: 50,
      maxAttack: 74,
      defense: 30,
      speed: 49,
    },
    drops: [
      {
        itemId: 'frag_004',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'elix_003',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_067_small'],
    },
  },
  {
    id: 'enemy_068',
    name: '金刚力士',
    level: 20,
    stats: {
      health: 530,
      minAttack: 71,
      maxAttack: 105,
      defense: 38,
      speed: 59,
    },
    drops: [
      {
        itemId: 'mat_019',
        quantity: 2,
        chance: 0.75,
      },
      {
        itemId: 'ess_001',
        quantity: 1,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_068_small'],
      passive: ['skill_enemy_068_passive'],
    },
  },
  {
    id: 'enemy_069',
    name: '罗汉尊者',
    level: 21,
    stats: {
      health: 551,
      minAttack: 73,
      maxAttack: 108,
      defense: 39,
      speed: 61,
    },
    drops: [
      {
        itemId: 'mat_017',
        quantity: 2,
        chance: 0.7,
      },
      {
        itemId: 'elix_006',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_069_small'],
      passive: ['skill_enemy_069_passive'],
    },
  },
  {
    id: 'enemy_070',
    name: '护法金刚',
    level: 21,
    stats: {
      health: 551,
      minAttack: 73,
      maxAttack: 108,
      defense: 39,
      speed: 61,
    },
    drops: [
      {
        itemId: 'mat_026',
        quantity: 1,
        chance: 0.65,
      },
      {
        itemId: 'crys_003',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_070_small'],
      passive: ['skill_enemy_070_passive'],
    },
  },
  {
    id: 'enemy_071',
    name: '金刚罗汉',
    level: 24,
    stats: {
      health: 794,
      minAttack: 107,
      maxAttack: 158,
      defense: 50,
      speed: 81,
    },
    drops: [
      {
        itemId: 'mat_019',
        quantity: 3,
        chance: 0.7,
      },
      {
        itemId: 'elix_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_071_small'],
      passive: ['skill_enemy_071_passive'],
      ultimate: ['skill_enemy_071_ultimate'],
    },
  },
  {
    id: 'enemy_072',
    name: '降龙罗汉',
    level: 25,
    stats: {
      health: 819,
      minAttack: 109,
      maxAttack: 162,
      defense: 51,
      speed: 83,
    },
    drops: [
      {
        itemId: 'mat_017',
        quantity: 3,
        chance: 0.65,
      },
      {
        itemId: 'ess_001',
        quantity: 2,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_072_small'],
      passive: ['skill_enemy_072_passive'],
      ultimate: ['skill_enemy_072_ultimate'],
    },
  },
  {
    id: 'boss_009',
    name: '禅音崖守护者',
    level: 25,
    stats: {
      health: 819,
      minAttack: 109,
      maxAttack: 162,
      defense: 51,
      speed: 83,
    },
    drops: [
      {
        itemId: 'ess_002',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'crys_006',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_009_small'],
      passive: ['skill_boss_009_passive'],
      ultimate: ['skill_boss_009_ultimate'],
    },
  },
  {
    id: 'enemy_073',
    name: '佛门叛徒侍从',
    level: 19,
    stats: {
      health: 433,
      minAttack: 58,
      maxAttack: 85,
      defense: 33,
      speed: 53,
    },
    drops: [
      {
        itemId: 'frag_001',
        quantity: 1,
        chance: 0.8,
      },
      {
        itemId: 'elix_002',
        quantity: 2,
        chance: 0.2,
      },
    ],
    skills: {
      small: ['skill_enemy_073_small'],
    },
  },
  {
    id: 'enemy_074',
    name: '金刚护法随从',
    level: 20,
    stats: {
      health: 454,
      minAttack: 60,
      maxAttack: 88,
      defense: 34,
      speed: 55,
    },
    drops: [
      {
        itemId: 'frag_002',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'elix_001',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_074_small'],
    },
  },
  {
    id: 'enemy_075',
    name: '罗汉使者学徒',
    level: 20,
    stats: {
      health: 454,
      minAttack: 60,
      maxAttack: 88,
      defense: 34,
      speed: 55,
    },
    drops: [
      {
        itemId: 'frag_003',
        quantity: 1,
        chance: 0.6,
      },
      {
        itemId: 'elix_006',
        quantity: 1,
        chance: 0.4,
      },
    ],
    skills: {
      small: ['skill_enemy_075_small'],
    },
  },
  {
    id: 'enemy_076',
    name: '佛门叛徒精英',
    level: 22,
    stats: {
      health: 648,
      minAttack: 87,
      maxAttack: 128,
      defense: 44,
      speed: 69,
    },
    drops: [
      {
        itemId: 'ess_002',
        quantity: 1,
        chance: 0.75,
      },
      {
        itemId: 'crys_001',
        quantity: 1,
        chance: 0.25,
      },
    ],
    skills: {
      small: ['skill_enemy_076_small'],
      passive: ['skill_enemy_076_passive'],
    },
  },
  {
    id: 'enemy_077',
    name: '金刚护法将领',
    level: 23,
    stats: {
      health: 670,
      minAttack: 89,
      maxAttack: 131,
      defense: 45,
      speed: 71,
    },
    drops: [
      {
        itemId: 'ess_003',
        quantity: 1,
        chance: 0.7,
      },
      {
        itemId: 'crys_004',
        quantity: 1,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_077_small'],
      passive: ['skill_enemy_077_passive'],
    },
  },
  {
    id: 'enemy_078',
    name: '罗汉使者长老',
    level: 23,
    stats: {
      health: 670,
      minAttack: 89,
      maxAttack: 131,
      defense: 45,
      speed: 71,
    },
    drops: [
      {
        itemId: 'elix_007',
        quantity: 1,
        chance: 0.65,
      },
      {
        itemId: 'crys_007',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_enemy_078_small'],
      passive: ['skill_enemy_078_passive'],
    },
  },
  {
    id: 'enemy_079',
    name: '佛门叛徒首领',
    level: 26,
    stats: {
      health: 988,
      minAttack: 133,
      maxAttack: 196,
      defense: 56,
      speed: 91,
    },
    drops: [
      {
        itemId: 'ess_002',
        quantity: 2,
        chance: 0.7,
      },
      {
        itemId: 'crys_001',
        quantity: 2,
        chance: 0.3,
      },
    ],
    skills: {
      small: ['skill_enemy_079_small'],
      passive: ['skill_enemy_079_passive'],
      ultimate: ['skill_enemy_079_ultimate'],
    },
  },
  {
    id: 'enemy_080',
    name: '金刚护法统帅',
    level: 27,
    stats: {
      health: 1014,
      minAttack: 135,
      maxAttack: 200,
      defense: 57,
      speed: 93,
    },
    drops: [
      {
        itemId: 'ess_003',
        quantity: 2,
        chance: 0.65,
      },
      {
        itemId: 'crys_004',
        quantity: 2,
        chance: 0.35,
      },
    ],
    skills: {
      small: ['skill_enemy_080_small'],
      passive: ['skill_enemy_080_passive'],
      ultimate: ['skill_enemy_080_ultimate'],
    },
  },
  {
    id: 'boss_010',
    name: '灵霄台守护者',
    level: 27,
    stats: {
      health: 1014,
      minAttack: 135,
      maxAttack: 200,
      defense: 57,
      speed: 93,
    },
    drops: [
      {
        itemId: 'elix_007',
        quantity: 2,
        chance: 0.6,
      },
      {
        itemId: 'crys_003',
        quantity: 1,
        chance: 0.05,
      },
    ],
    skills: {
      small: ['skill_boss_010_small'],
      passive: ['skill_boss_010_passive'],
      ultimate: ['skill_boss_010_ultimate'],
    },
  },
]

// 遍历所有技能
for (const skill of data) {
  delete skill.mpCost
  if (skill.id.includes('small')) {
    skill.energyCost = 25
    skill.cooldown = 2
    skill.type = 'small'
  } else if (skill.id.includes('passive')) {
    skill.energyCost = 0
    skill.type = 'passive'
  } else if (skill.id.includes('ultimate')) {
    skill.energyCost = 150
    skill.cooldown = 5
    skill.type = 'ultimate'
  }
}
console.log(JSON.stringify(data, null, 2))
