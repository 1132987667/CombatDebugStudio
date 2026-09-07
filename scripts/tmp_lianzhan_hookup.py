# -*- coding: utf-8 -*-
"""一次性：连战技能挂载 10 层树学习格 + 注入链路 + 存档还原 + 文档，用后即删"""
import json

# ── 1) schools.json：连战学习格挂 skillIds（组合被动为逗号分隔配置串） ──
path = 'configs/xiyou/schools.json'
d = json.load(open(path, encoding='utf-8'))
SKILL_IDS = {
    (1, 6): ['school_fengsuo_bounce,school_fengsuo_bind,school_fengsuo_fengzhu'],  # 风锁连环
    (1, 7): ['skill_school_fufengbian', 'skill_school_xunfengji'],  # 缚风鞭/迅风击
    (3, 5): ['school_lianzhan_fengshi_apply,school_lianzhan_fengshi_transform,school_fengshi_combo_rate',
             'school_lianzhan_liejia_apply,school_lianzhan_liejia_burst'],  # 风势缠身/裂甲刻印
    (3, 6): ['skill_school_fengliantanshe', 'skill_school_liejiaji'],  # 风链弹射/裂甲击
    (6, 5): ['school_fenghen_jiban_apply,school_fenghen_jiban_heal',
             'school_yufeng_hitdown,school_yufeng_attack'],  # 风痕羁绊/驭风之力
    (6, 6): ['skill_school_fengyibaofa', 'skill_school_liejiabaofa'],  # 风意爆发/裂甲爆发
    (6, 7): ['skill_school_fengsuotianwang', 'skill_school_kuangfengjuexi',
             'skill_school_liejiatianbeng'],  # 风锁天网/狂风绝息/裂甲天崩
    (8, 2): ['school_fengshiyong_apply', 'school_lianshi_qishi,school_fengshi_liejia_link',
             'school_liejia_tougu', 'school_lianzhan_liejia_burst'],  # 风势涌/连击气势/裂甲透骨/裂甲爆裂
}
n = 0
for layer in d['layers']:
    for idx, node in enumerate(layer['nodes']):
        if node.get('school') == 'lianzhan' and node.get('skillKind'):
            ids = SKILL_IDS.get((layer['layer'], idx))
            if ids:
                node['skillIds'] = ids
                n += 1
open(path, 'wb').write((json.dumps(d, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(f'1 schools.json skillIds: {n}/8 格')

# ── 2) types.ts：SchoolsNode 加 skillIds ──
path = 'src/presentation/modules/yanjie/xiyou/types.ts'
src = open(path, encoding='utf-8').read()
old = '''  /** 后缀（如 "%"） */
  suffix: string'''
new = '''  /** 后缀（如 "%"） */
  suffix: string
  /** 学习格点亮的技能配置 id（组合被动为逗号分隔串；预留格缺省） */
  skillIds?: string[]'''
assert old in src
open(path, 'wb').write(src.replace(old, new).encode('utf-8'))
print('2 types ok')

# ── 3) xiyouData.ts：schoolsLayers 构造透传 skillIds ──
path = 'src/presentation/modules/yanjie/xiyou/xiyouData.ts'
src = open(path, encoding='utf-8').read()
old = """      suffix: raw.suffix,
      description: raw.description,"""
new = """      suffix: raw.suffix,
      skillIds: raw.skillIds,
      description: raw.description,"""
assert old in src
open(path, 'wb').write(src.replace(old, new).encode('utf-8'))
print('3 xiyouData ok')

# ── 4) battle.ts：equippedPlayerSkills 追加 schoolsLayers 学习格来源 ──
path = 'src/presentation/modules/yanjie/xiyou/battle.ts'
src = open(path, encoding='utf-8').read()
old = """export function equippedPlayerSkills(): EnemySkills {
  const out: EnemySkills = { small: [], passive: [], ultimate: [] }
  // 组合被动：映射值为逗号分隔的多条配置 id，逐个展开注入
  const expand = (skillId: string): string[] =>
    skillId.split(',').map((s) => s.trim()).filter(Boolean)
"""
new = """export function equippedPlayerSkills(): EnemySkills {
  const out: EnemySkills = { small: [], passive: [], ultimate: [] }
  // 组合被动：映射值为逗号分隔的多条配置 id，逐个展开注入
  const expand = (skillId: string): string[] =>
    skillId.split(',').map((s) => s.trim()).filter(Boolean)
  // 天赋树（schools.json layers）学习格：点亮即解锁，skillIds 逐条展开注入
  for (const layer of schoolsLayers) {
    for (const node of layer.nodes) {
      if (!node.learned || !node.skillIds?.length) continue
      const bucket = node.skillKind === '被动' ? out.passive! : node.skillKind === '小技能' ? out.small! : out.ultimate!
      for (const skillId of node.skillIds) bucket.push(...expand(skillId))
    }
  }
"""
assert old in src
src = src.replace(old, new)
# import schoolsLayers
old_imp = "import { equippedSkills, pureSchoolBonus, schools, skillNodeMap } from './xiyouData'"
new_imp = "import { equippedSkills, pureSchoolBonus, schools, schoolsLayers, skillNodeMap } from './xiyouData'"
assert old_imp in src
src = src.replace(old_imp, new_imp)
open(path, 'wb').write(src.encode('utf-8'))
print('4 battle ok')

# ── 5) save-bridge.ts：restore 还原 schoolsLayers 学习格 ──
path = 'src/presentation/modules/yanjie/xiyou/save-bridge.ts'
src = open(path, encoding='utf-8').read()
old = """      const learnedSet = new Set(schoolState.learned ?? [])
      for (const s of schools) {
        for (const n of s.nodes) n.learned = learnedSet.has(n.id)
      }"""
new = """      const learnedSet = new Set(schoolState.learned ?? [])
      for (const s of schools) {
        for (const n of s.nodes) n.learned = learnedSet.has(n.id)
      }
      // 天赋树（schools.json layers）学习格还原：合成 id（layer_index）与技能树 id 同集存档
      for (const layer of schoolsLayers) {
        for (const n of layer.nodes) n.learned = learnedSet.has(n.id)
      }"""
assert old in src
src = src.replace(old, new)
old_imp = "import { schoolsLayers, syncXiyouData } from './xiyouData'"
if old_imp in src:
    pass
else:
    m = "from './xiyouData'"
    i = src.find(m)
    assert i > 0
    # 找到 xiyouData import 语句，追加 schoolsLayers
    stmt_start = src.rfind('import {', 0, i)
    stmt = src[stmt_start:src.find('}', i) + 1]
    assert 'schoolsLayers' not in stmt
    new_stmt = stmt.replace('} from', ', schoolsLayers } from') if stmt.rstrip().endswith('} from') else stmt
    # 更稳：直接在 {} 内插
    brace = stmt.find('{')
    new_stmt = stmt[:brace + 1] + ' schoolsLayers,' + stmt[brace + 1:]
    src = src[:stmt_start] + new_stmt + src[stmt_start + len(stmt):]
open(path, 'wb').write(src.encode('utf-8'))
print('5 save-bridge ok')

# ── 6) SchoolsPanel.vue：解锁后自动存档 ──
path = 'src/presentation/modules/yanjie/xiyou/components/SchoolsPanel.vue'
src = open(path, encoding='utf-8').read()
old = """  const cost = node.cost?.[0] ?? 1
  skillPoints.spent += cost
  node.learned = true
  notification.toast(`已解锁「${node.name}」`, 'success')
  drawCanvas()"""
new = """  const cost = node.cost?.[0] ?? 1
  skillPoints.spent += cost
  node.learned = true
  saveManager.autoSave()
  notification.toast(`已解锁「${node.name}」${node.skillIds?.length ? '，习得新技能' : ''}`, 'success')
  drawCanvas()"""
assert old in src
src = src.replace(old, new)
old_imp = "import { RESET_PRICE_PER_POINT } from '@/presentation/stores/cultivateStore'"
new_imp = "import { RESET_PRICE_PER_POINT } from '@/presentation/stores/cultivateStore'\nimport { saveManager } from '../save-bridge'"
assert old_imp in src
src = src.replace(old_imp, new_imp)
open(path, 'wb').write(src.encode('utf-8'))
print('6 SchoolsPanel ok')

# ── 7) 完整项目说明.md：§7 出战装备槽表述修正 ──
path = 'documents/新需求/完整项目说明.md'
raw = open(path, 'rb').read()
src = raw.decode('utf-8-sig')
old = '*   **出战装备槽**：被动 2 / 小技能 2 / 大招 1；在流派修行界面随时切换（战斗外），不消耗技能点。已解锁技能可超过槽位数，出战时取舍。'
new = '*   **学习格点亮即生效**：天赋树中「学习被动/小技能/大技能」格子点亮后，对应技能自动进入出战配置（无额外装备槽取舍；逐层点数门槛即节奏限制）。'
assert old in src
src = src.replace(old, new)
open(path, 'wb').write(b'\xef\xbb\xbf' + src.encode('utf-8'))
print('7 文档 ok, BOM kept:', open(path, 'rb').read()[:3] == b'\xef\xbb\xbf')
