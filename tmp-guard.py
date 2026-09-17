import json, math

stats = json.load(open('tmp-guardian.json'))
KEYS = ('maxHealth','attack','defense','speed','hit','dodge','critRate','critDamage','maxEnergy','energyInit')

# 守护者 → 场景精准映射（等级逐一落入场景 levelRange）
ASSIGN = {
  'boss_001': ('scene_1_5', 9),  'boss_002': ('scene_2_1', 11), 'boss_003': ('scene_2_2', 13),
  'boss_004': ('scene_2_3', 15), 'boss_005': ('scene_2_4', 17), 'boss_006': ('scene_2_5', 19),
  'boss_007': ('scene_3_1', 21), 'boss_008': ('scene_3_2', 23), 'boss_009': ('scene_3_3', 25),
  'boss_010': ('scene_3_4', 27),
}
FACTION = {'boss_001': 'wood', 'boss_002': 'water', 'boss_003': 'earth', 'boss_004': 'wood',
           'boss_005': 'water', 'boss_006': 'fire', 'boss_007': 'neutral', 'boss_008': 'metal',
           'boss_009': 'neutral', 'boss_010': 'metal'}

def convert(e, sid):
    L = e['level']
    s = stats[f"L{L}"]
    sk = e.get('skills', {})
    item = {'id': e['id'], 'name': e['name'], 'level': L, 'faction': FACTION[e['id']], 'role': 'yaowang',
            'stats': {k: s[k] for k in KEYS}}
    sids = list(sk.get('small', [])) + list(sk.get('ultimate', []))
    pas = list(sk.get('passive', []))
    if sids: item['skillIds'] = sids
    if pas: item['passiveSkillIds'] = pas
    item['affixPool'] = {'buffTier': min(3, max(1, math.ceil(L/20))), 'count': 1}
    item['drops'] = [{'itemId': d['itemId'], 'quantity': d.get('quantity', 1), 'probability': d.get('chance', 1)} for d in e.get('drops', [])]
    if e.get('money'): item['money'] = e['money']
    if e.get('exp'): item['exp'] = e['exp']
    item['description'] = f"盘踞在{sid.replace('scene_', '').replace('_', '区域')}一带的旧时代守护者，妖王级的守关妖类。"
    return item

# ── 1. 救回 6 只（expired 旧结构转换+重算）追加 enemies.json ──
arch = json.load(open('configs/expired/enemies-old-expired.json', encoding='utf-8'))
p = 'configs/enemies/enemies.json'
raw = open(p, 'rb').read().decode('utf-8')
data = json.loads(raw)
BS = chr(92)
def entry_text(item):
    text = json.dumps(item, ensure_ascii=False, indent=2)
    return '\n'.join(('  ' + ln) if ln else ln for ln in text.split('\n'))
def replace_entry(raw, sid, item):
    anchor = '  {\n    "id": "' + sid + '",'
    start = raw.find(anchor)
    assert start >= 0, sid
    depth = 0; i = start; in_str = False; esc = False
    while i < len(raw):
        ch = raw[i]
        if esc: esc = False
        elif ch == BS: esc = True
        elif ch == '"': in_str = not in_str
        elif not in_str:
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0: break
        i += 1
    return raw[:start] + entry_text(item) + raw[i+1:]

rescued = []
for e in arch:
    if e['id'] in ASSIGN and e['id'] not in {x['id'] for x in data}:
        item = convert(e, ASSIGN[e['id']][0])
        item['description'] = item['description']  # 简述
        body = raw.rstrip()
        if body.endswith(','): body = body[:-1]
        raw = body + ',\n' + entry_text(item) + '\n]\n'
        rescued.append(e['id'])
open(p, 'wb').write(raw.encode('utf-8'))
print('救回:', rescued)

# ── 2. 4 只已保留守护者解冻重算 ──
raw = open(p, 'rb').read().decode('utf-8')
data = json.loads(raw)
byid = {e['id']: e for e in data}
for eid, (sid, L) in ASSIGN.items():
    if eid not in rescued:
        e = byid[eid]
        s = stats[f"L{L}"]
        e['role'] = 'yaowang'
        e['faction'] = FACTION[eid]
        e['stats'] = {k: s[k] for k in KEYS}
        e['affixPool'] = {'buffTier': min(3, max(1, math.ceil(L/20))), 'count': 1}
        if not e.get('money'):
            e['money'] = [round(3*L*1.4), round(5*L*1.4)]
            e['exp'] = [round(10*L*1.4), round(15*L*1.4)]
raw = json.dumps(data, ensure_ascii=False, indent=2)
open(p, 'wb').write(raw.encode('utf-8'))
print('解冻重算 OK')

# ── 3. 解冻重算后需要重新文本锚定？——dumps 已全量，改用 json round-trip 后插入场景池 ──
scenes_p = 'configs/xiyou/scenes.json'
sraw = open(scenes_p, 'rb').read().decode('utf-8')
scenes = json.loads(sraw)
for s in scenes:
    if s['id'] in ASSIGN.values() or True:
        pass
for sid, (eid, L) in ASSIGN.items():
    pass
# 插入场景池（index 3）
scene_by_id = {s['id']: s for s in scenes}
for eid, (sid, L) in ASSIGN.items():
    s = scene_by_id[sid]
    pool = s.setdefault('enemies', [])
    e = byid[eid]
    pool.insert(3, {'id': eid, 'name': e['name'], 'level': L})
sout = json.dumps(scenes, ensure_ascii=False, indent=2)
open(scenes_p, 'wb').write((sout + ('\n' if not sraw.endswith('\n') else '')).encode('utf-8'))
print('场景池插入完成')

# ── 4. 解冻：FROZEN_IDS 与脚本剥离名单移除 boss_0 ──
p = 'src/domain/fengshen/enemy-generate.ts'
raw = open(p, 'rb').read().decode('utf-8')
BS = chr(92)
old = " || /^boss_0" + BS + "d+$/.test(id)"
assert raw.count(old) == 1
raw = raw.replace(old, '')
raw = raw.replace(" *  boss_major_*（五大场景 BOSS）与 boss_0NN（章节守护者，唤灵台/预设实体）数值均为手调设计值——",
                  " *  boss_major_*（五大场景 BOSS）数值为场景设计值——")
raw = raw.replace(" *  重算会摧毁基准与场景平衡，一律跳过 */", " *  重算会摧毁基准，一律跳过 */")
open(p, 'wb').write(raw.encode('utf-8'))
p = 'scripts/generate-enemy-design.cjs'
raw = open(p, 'rb').read().decode('utf-8')
old = "const frozenPrefixes = ['yaotu_', 'boss_major_', 'test_', 'boss_0']"
new = "const frozenPrefixes = ['yaotu_', 'boss_major_', 'test_']"
assert raw.count(old) == 1
raw = raw.replace(old, new)
open(p, 'wb').write(raw.encode('utf-8'))
print('解冻 OK')

# ── 5. seed v40 ──
p = 'src/infrastructure/adapters/storage/seed.ts'
raw = open(p, 'rb').read().decode('utf-8')
assert 'fengshen-seed-v39' in raw
raw = raw.replace('fengshen-seed-v39', 'fengshen-seed-v40')
open(p, 'wb').write(raw.encode('utf-8'))
print('seed v40')
