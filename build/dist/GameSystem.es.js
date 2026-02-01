var L = Object.defineProperty;
var j = (c, e, t) => e in c ? L(c, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : c[e] = t;
var l = (c, e, t) => j(c, typeof e != "symbol" ? e + "" : e, t);
import { reactive as D } from "vue";
class V {
  constructor(e = {}) {
    l(this, "config");
    this.config = {
      level: e.level || "INFO",
      prefix: e.prefix || "BuffSystem",
      enableColors: e.enableColors ?? !0
    };
  }
  shouldLog(e) {
    const t = ["DEBUG", "INFO", "WARN", "ERROR"];
    return t.indexOf(e) >= t.indexOf(this.config.level);
  }
  formatMessage(e, t, r) {
    let i = `[${(/* @__PURE__ */ new Date()).toISOString()}] [${this.config.prefix}] [${e}] ${t}`;
    return r && (i += `
${JSON.stringify(r, null, 2)}`), i;
  }
  log(e, t, r) {
    if (!this.shouldLog(e)) return;
    const s = this.formatMessage(e, t, r);
    switch (e) {
      case "DEBUG":
        console.debug(s);
        break;
      case "INFO":
        console.info(s);
        break;
      case "WARN":
        console.warn(s);
        break;
      case "ERROR":
        console.error(s);
        break;
      default:
        console.log(s);
        break;
    }
  }
  debug(e, t) {
    this.log("DEBUG", e, t);
  }
  info(e, t) {
    this.log("INFO", e, t);
  }
  warn(e, t) {
    this.log("WARN", e, t);
  }
  error(e, t) {
    this.log("ERROR", e, t);
  }
  setLevel(e) {
    this.config.level = e;
  }
  setPrefix(e) {
    this.config.prefix = e;
  }
}
const u = new V(), g = class g {
  constructor() {
    l(this, "registry", /* @__PURE__ */ new Map());
    l(this, "logger", new V({ prefix: "BuffScriptRegistry" }));
  }
  static getInstance() {
    return g.instance || (g.instance = new g()), g.instance;
  }
  // 手动注册（推荐方式） 
  register(e, t, r) {
    this.registry.has(e) && this.logger.warn(`Script "${e}" already registered, overwriting`), this.registry.set(e, {
      factory: t,
      metadata: {
        scriptId: e,
        filePath: (r == null ? void 0 : r.filePath) ?? "unknown",
        loadTime: Date.now(),
        version: r == null ? void 0 : r.version
      }
    }), this.logger.info(`Registered buff script: ${e}`);
  }
  // 安全获取（带类型推断） 
  get(e) {
    const t = this.registry.get(e);
    if (!t)
      return this.logger.error(`Buff script not found: ${e}`), null;
    try {
      return t.factory();
    } catch (r) {
      return this.logger.error(`Failed to instantiate script "${e}":`, r), null;
    }
  }
  // 批量注册（用于自动加载） 
  batchRegister(e) {
    e.forEach((t) => {
      this.register(t.scriptId, t.factory, { filePath: t.filePath });
    });
  }
  has(e) {
    return this.registry.has(e);
  }
  list() {
    return Array.from(this.registry.keys());
  }
  // 热重载支持：卸载旧版本 
  unregister(e) {
    return this.registry.delete(e);
  }
};
l(g, "instance");
let v = g;
class z {
  constructor(e, t, r) {
    l(this, "characterId");
    l(this, "instanceId");
    l(this, "config");
    l(this, "startTime");
    l(this, "variables", /* @__PURE__ */ new Map());
    this.characterId = e, this.instanceId = t, this.config = r, this.startTime = Date.now();
  }
  getElapsedTime() {
    return Date.now() - this.startTime;
  }
  getRemainingTime() {
    return this.config.duration <= 0 ? -1 : Math.max(0, this.config.duration - this.getElapsedTime());
  }
  setVariable(e, t) {
    this.variables.set(e, t);
  }
  getVariable(e) {
    return this.variables.get(e);
  }
  removeVariable(e) {
    this.variables.delete(e);
  }
  addModifier(e, t, r) {
    k.getInstance().getModifierStack(this.characterId).addModifier(
      this.instanceId,
      e,
      t,
      r
    );
  }
  removeModifiers() {
    k.getInstance().getModifierStack(this.characterId).removeModifier(this.instanceId);
  }
  getCharacter() {
  }
  getAttributeValue(e) {
    const t = this.getCharacter();
    return t ? t.getAttribute(e) : 0;
  }
  triggerEvent(e, t) {
    console.log(`Buff event triggered: ${e}`, t);
  }
}
class _ {
  constructor() {
    l(this, "modifiers", /* @__PURE__ */ new Map());
  }
  addModifier(e, t, r, s) {
    const i = t;
    this.modifiers.has(i) || this.modifiers.set(i, []), this.modifiers.get(i).push({
      buffInstanceId: e,
      attribute: t,
      value: r,
      type: s
    });
  }
  removeModifier(e) {
    for (const [t, r] of this.modifiers.entries()) {
      const s = r.filter(
        (i) => i.buffInstanceId !== e
      );
      s.length === 0 ? this.modifiers.delete(t) : this.modifiers.set(t, s);
    }
  }
  calculate(e, t) {
    const r = this.modifiers.get(e);
    if (!r || r.length === 0)
      return t;
    let s = t, i = 0, a = 1;
    for (const n of r)
      switch (n.type) {
        case "ADDITIVE":
          i += n.value;
          break;
        case "MULTIPLICATIVE":
          a *= 1 + n.value;
          break;
        case "PERCENTAGE":
          i += t * n.value;
          break;
      }
    return s += i, s *= a, s;
  }
  getModifiers(e) {
    if (e)
      return this.modifiers.get(e) || [];
    const t = [];
    for (const r of this.modifiers.values())
      t.push(...r);
    return t;
  }
  clear() {
    this.modifiers.clear();
  }
  getModifierCount() {
    let e = 0;
    for (const t of this.modifiers.values())
      e += t.length;
    return e;
  }
}
class d {
  static wrap(e) {
    try {
      return e();
    } catch (t) {
      return d.handleError(t), null;
    }
  }
  static wrapAsync(e) {
    return e().catch((t) => (d.handleError(t), null));
  }
  static handleError(e) {
    e instanceof Error ? u.error("Buff script error:", {
      message: e.message,
      stack: e.stack
    }) : u.error("Unknown buff script error:", e);
  }
  static executeWithRetry(e, t = 3) {
    let r = 0;
    for (; r < t; )
      try {
        return e();
      } catch (s) {
        if (r++, r >= t)
          return d.handleError(s), null;
        u.warn(`Retrying buff script execution (${r}/${t})`);
      }
    return null;
  }
}
const m = class m {
  constructor() {
    l(this, "buffInstances", D(
      /* @__PURE__ */ new Map()
    ));
    l(this, "modifierStacks", D(
      /* @__PURE__ */ new Map()
    ));
  }
  static getInstance() {
    return m.instance || (m.instance = new m()), m.instance;
  }
  addBuff(e, t, r) {
    const s = v.getInstance().get(t);
    if (!s)
      throw new Error(`Buff script ${t} not found`);
    const i = `${e}_${t}_${Date.now()}`, a = new z(e, i, r), n = {
      id: i,
      characterId: e,
      buffId: t,
      script: s,
      context: a,
      startTime: Date.now(),
      duration: r.duration || -1,
      isActive: !0
    };
    return this.buffInstances.set(i, n), this.modifierStacks.has(e) || this.modifierStacks.set(e, new _()), d.wrap(() => {
      s.onApply(a);
    }), i;
  }
  removeBuff(e) {
    const t = this.buffInstances.get(e);
    return !t || !t.isActive ? !1 : (d.wrap(() => {
      t.script.onRemove(t.context);
    }), t.isActive = !1, this.buffInstances.delete(e), !0);
  }
  refreshBuff(e) {
    const t = this.buffInstances.get(e);
    return !t || !t.isActive ? !1 : (d.wrap(() => {
      t.script.onRefresh(t.context);
    }), t.startTime = Date.now(), !0);
  }
  update(e) {
    const t = [];
    this.buffInstances.forEach((r) => {
      r.isActive && (d.wrap(() => {
        r.script.onUpdate(r.context, e);
      }), r.duration > 0 && Date.now() - r.startTime >= r.duration && t.push(r.id));
    }), t.forEach((r) => this.removeBuff(r));
  }
  getBuffInstances(e) {
    const t = [];
    return this.buffInstances.forEach((r) => {
      r.characterId === e && r.isActive && t.push(r);
    }), t;
  }
  getModifierStack(e) {
    return this.modifierStacks.has(e) || this.modifierStacks.set(e, new _()), this.modifierStacks.get(e);
  }
  clearAllBuffs(e) {
    const t = [];
    this.buffInstances.forEach((r) => {
      r.characterId === e && t.push(r.id);
    }), t.forEach((r) => this.removeBuff(r)), this.modifierStacks.delete(e);
  }
};
l(m, "instance");
let k = m;
const p = class p {
  constructor() {
    l(this, "loadedScripts", /* @__PURE__ */ new Set());
  }
  static getInstance() {
    return p.instance || (p.instance = new p()), p.instance;
  }
  async loadScripts() {
    try {
      const { MountainGodBuff: e } = await Promise.resolve().then(() => P), { PoisonDebuff: t } = await Promise.resolve().then(() => R), { BerserkBuff: r } = await Promise.resolve().then(() => U), { HealOverTime: s } = await Promise.resolve().then(() => O), { ShieldBuff: i } = await Promise.resolve().then(() => x), a = v.getInstance();
      e.BUFF_ID && (a.register(e.BUFF_ID, () => new e(), {
        filePath: "@/scripts/combat/MountainGodBuff"
      }), this.loadedScripts.add("MountainGodBuff")), t.BUFF_ID && (a.register(t.BUFF_ID, () => new t(), {
        filePath: "@/scripts/combat/PoisonDebuff"
      }), this.loadedScripts.add("PoisonDebuff")), r.BUFF_ID && (a.register(r.BUFF_ID, () => new r(), {
        filePath: "@/scripts/combat/BerserkBuff"
      }), this.loadedScripts.add("BerserkBuff")), s.BUFF_ID && (a.register(s.BUFF_ID, () => new s(), {
        filePath: "@/scripts/support/HealOverTime"
      }), this.loadedScripts.add("HealOverTime")), i.BUFF_ID && (a.register(i.BUFF_ID, () => new i(), {
        filePath: "@/scripts/support/ShieldBuff"
      }), this.loadedScripts.add("ShieldBuff"));
    } catch (e) {
      console.error("Failed to load buff scripts:", e);
    }
  }
  async reloadScripts() {
    this.loadedScripts.clear();
    const e = v.getInstance();
    e.list().forEach((r) => e.unregister(r)), await this.loadScripts();
  }
  getLoadedScriptCount() {
    return this.loadedScripts.size;
  }
  clear() {
    this.loadedScripts.clear();
    const e = v.getInstance();
    e.list().forEach((r) => e.unregister(r));
  }
};
l(p, "instance");
let w = p;
const N = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BuffScriptLoader: w
}, Symbol.toStringTag, { value: "Module" }));
class F {
  constructor() {
    l(this, "skills", /* @__PURE__ */ new Map());
    this.initializeSkills();
  }
  initializeSkills() {
  }
  makeDecision(e, t) {
    try {
      if (!e || !t)
        return u.error("AI决策参数无效:", { battleState: e, participant: t }), this.selectAttack(t);
      const r = this.analyzeBattleState(e, t);
      if (r.shouldUseSkill) {
        const s = this.selectSkill(t, r);
        if (s)
          try {
            return this.createSkillAction(e, t, s);
          } catch (i) {
            return u.error("技能执行出错:", i), this.selectAttack(t);
          }
      }
      return this.selectAttack(t);
    } catch (r) {
      u.error("AI决策出错:", r);
      try {
        return this.selectAttack(t);
      } catch (s) {
        return u.error("攻击执行出错:", s), {
          id: `fallback_${Date.now()}`,
          type: "attack",
          sourceId: (t == null ? void 0 : t.id) || "unknown",
          targetId: "unknown",
          damage: 10,
          success: !0,
          timestamp: Date.now(),
          effects: [
            {
              type: "damage",
              value: 10,
              description: "默认攻击"
            }
          ]
        };
      }
    }
  }
  /**
   * 分析战场态势
   */
  analyzeBattleState(e, t) {
    const r = Array.from(e.participants.values()).filter(
      (h) => h.type === t.type && h.isAlive()
    ), s = Array.from(e.participants.values()).filter(
      (h) => h.type !== t.type && h.isAlive()
    ), i = r.reduce((h, b) => h + b.currentHealth, 0), a = r.reduce((h, b) => h + b.maxHealth, 0), n = a > 0 ? i / a : 0, o = s.reduce(
      (h, b) => {
        const T = this.calculateThreat(b, t, e);
        return T > h.threat ? { enemy: b, threat: T } : h;
      },
      { enemy: null, threat: 0 }
    ), f = r.some((h) => h.currentHealth / h.maxHealth < 0.3);
    return {
      allies: r,
      enemies: s,
      teamHealthPercent: n,
      highestThreatEnemy: o,
      needsHealing: f,
      shouldUseSkill: this.shouldUseSkill(t)
    };
  }
  selectTarget(e, t) {
    const r = Array.from(e.participants.values()).filter((i) => i.type !== t.type && i.isAlive()).map((i) => i);
    if (r.length === 0)
      throw new Error("No valid targets");
    const s = r.map((i) => ({
      target: i,
      threat: this.calculateThreat(i, t, e)
    }));
    return s.sort((i, a) => a.threat - i.threat), s[0].target.id;
  }
  /**
   * 计算目标的威胁值
   */
  calculateThreat(e, t, r) {
    let s = 0;
    const i = e.currentHealth / e.maxHealth;
    s += (1 - i) * 50;
    const a = e.currentEnergy / e.maxEnergy;
    return s += a * 30, e.type === "character" && t.type === "enemy" && (s += 20), e.buffs.length > 0 && (s += e.buffs.length * 10), s;
  }
  shouldUseSkill(e) {
    const t = e.getAttribute("energy") || e.currentEnergy || 0, r = e.getAttribute("max_energy") || e.maxEnergy || 150;
    return t >= r * 0.7;
  }
  selectSkill(e, t) {
    const r = Array.from(this.skills.values());
    if (r.length === 0)
      return null;
    if (t) {
      if (t.needsHealing) {
        const a = r.find((n) => n.heal && n.heal > 0);
        if (a)
          return a.id;
      }
      if (t.highestThreatEnemy.threat > 50) {
        const a = r.find((n) => n.damage && n.damage > 0);
        if (a)
          return a.id;
      }
    }
    const s = r.find(
      (a) => a.type === "small"
      /* SMALL */
    );
    if (s)
      return s.id;
    const i = r.find(
      (a) => a.type === "ultimate"
      /* ULTIMATE */
    );
    return i ? i.id : null;
  }
  selectAttack(e) {
    return {
      id: `attack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: "attack",
      sourceId: e.id,
      targetId: "",
      // 会在makeDecision中设置
      damage: Math.floor(Math.random() * 20) + 10,
      success: !0,
      timestamp: Date.now(),
      effects: [
        {
          type: "damage",
          value: Math.floor(Math.random() * 20) + 10,
          description: `${e.name} 普通攻击`
        }
      ]
    };
  }
  /**
   * 选择治疗目标
   */
  selectHealTarget(e, t) {
    const r = [];
    return e.participants.forEach((s) => {
      if (s.type === t.type && s.isAlive()) {
        const i = s.currentHealth / s.maxHealth;
        r.push({ target: s, healthPercent: i });
      }
    }), r.sort((s, i) => s.healthPercent - i.healthPercent), r.length > 0 ? r[0].target.id : t.id;
  }
  createSkillAction(e, t, r) {
    const s = this.skills.get(r);
    if (!s)
      throw new Error(`Skill not found: ${r}`);
    let i = "";
    s.heal ? i = this.selectHealTarget(e, t) : i = this.selectTarget(e, t);
    const a = {
      id: `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: "skill",
      sourceId: t.id,
      targetId: i,
      skillId: r,
      success: !0,
      timestamp: Date.now(),
      effects: [
        {
          type: "status",
          description: `${t.name} 使用 ${s.name}`
        }
      ]
    };
    return s.damage && (a.damage = s.damage, a.effects.push({
      type: "damage",
      value: s.damage,
      description: `造成 ${s.damage} 伤害`
    })), s.heal && (a.heal = s.heal, a.effects.push({
      type: "heal",
      value: s.heal,
      description: `恢复 ${s.heal} 生命值`
    })), s.buffId && (a.buffId = s.buffId, a.effects.push({
      type: "buff",
      buffId: s.buffId,
      description: `施加 ${s.name} 效果`
    })), a;
  }
  /**
   * 添加技能
   */
  addSkill(e) {
    this.skills.set(e.id, e);
  }
  /**
   * 获取技能
   */
  getSkill(e) {
    return this.skills.get(e);
  }
  /**
   * 获取所有技能
   */
  getSkills() {
    return Array.from(this.skills.values());
  }
}
class G extends F {
  initializeSkills() {
    this.addSkill({
      id: "skill_heal",
      name: "治疗术",
      type: "small",
      energyCost: 30,
      cooldown: 2e3,
      lastUsed: 0,
      description: "恢复生命值",
      heal: 50
    }), this.addSkill({
      id: "skill_attack",
      name: "强力攻击",
      type: "small",
      energyCost: 25,
      cooldown: 1500,
      lastUsed: 0,
      description: "造成额外伤害",
      damage: 35
    }), this.addSkill({
      id: "skill_ultimate",
      name: "终极技能",
      type: "ultimate",
      energyCost: 100,
      cooldown: 5e3,
      lastUsed: 0,
      description: "造成大量伤害",
      damage: 80
    });
  }
  shouldUseSkill(e) {
    return e.currentHealth / e.maxHealth < 0.5 ? !0 : super.shouldUseSkill(e);
  }
  selectSkill(e, t) {
    const r = e.currentHealth / e.maxHealth;
    if (r < 0.5) {
      const i = Array.from(this.skills.values()).find(
        (a) => a.heal && a.heal > 0
      );
      if (i)
        return i.id;
    }
    if (Array.from(this.skills.values()).find(
      (i) => i.heal && i.heal > 0
    ) && r >= 1) {
      const i = Array.from(this.skills.values()).filter(
        (a) => a.damage && a.damage > 0
      );
      if (i.length > 0)
        return i.sort((a, n) => (n.damage || 0) - (a.damage || 0)), i[0].id;
    }
    if (e.currentEnergy >= 100) {
      const i = Array.from(this.skills.values()).find(
        (a) => a.type === "ultimate"
        /* ULTIMATE */
      );
      if (i)
        return i.id;
    }
    return super.selectSkill(e, t);
  }
  selectTarget(e, t) {
    const r = Array.from(e.participants.values()).filter((s) => s.type === "enemy" && s.isAlive()).map((s) => s);
    if (r.length === 0)
      throw new Error("No enemies found");
    return r.sort((s, i) => s.currentHealth - i.currentHealth), r[0].id;
  }
}
class K extends F {
  initializeSkills() {
    this.addSkill({
      id: "enemy_skill_1",
      name: "爪击",
      type: "small",
      energyCost: 20,
      cooldown: 1e3,
      lastUsed: 0,
      description: "快速攻击",
      damage: 25
    }), this.addSkill({
      id: "enemy_skill_2",
      name: "狂暴",
      type: "ultimate",
      energyCost: 80,
      cooldown: 3e3,
      lastUsed: 0,
      description: "增加攻击力",
      damage: 60
    });
  }
  shouldUseSkill(e) {
    return e.currentEnergy >= 50;
  }
  selectSkill(e, t) {
    return super.selectSkill(e, t);
  }
  selectTarget(e, t) {
    const r = Array.from(e.participants.values()).filter((s) => s.type === "character" && s.isAlive()).map((s) => s);
    if (r.length === 0)
      throw new Error("No characters found");
    return r.sort((s, i) => s.currentHealth - i.currentHealth), r[0].id;
  }
}
class H {
  static createAI(e) {
    return e === "character" ? new G() : new K();
  }
}
class C {
  constructor(e) {
    l(this, "id");
    l(this, "name");
    l(this, "level");
    l(this, "currentHealth");
    l(this, "maxHealth");
    l(this, "currentEnergy");
    l(this, "maxEnergy");
    l(this, "buffs");
    l(this, "skills", /* @__PURE__ */ new Map());
    this.id = e.id, this.name = e.name, this.level = e.level, this.currentHealth = e.currentHealth, this.maxHealth = e.maxHealth, this.currentEnergy = e.currentEnergy || 0, this.maxEnergy = e.maxEnergy || 150, this.buffs = e.buffs || [], e.skills && e.skills.forEach((t) => {
      this.skills.set(t.id, t);
    });
  }
  getAttribute(e) {
    switch (e) {
      case "HP":
        return this.currentHealth;
      case "MAX_HP":
        return this.maxHealth;
      case "ATK":
        return this.level * 5;
      // Simplified attack calculation
      case "DEF":
        return this.level * 2;
      // Simplified defense calculation
      case "energy":
        return this.currentEnergy;
      case "max_energy":
        return this.maxEnergy;
      default:
        return 0;
    }
  }
  setAttribute(e, t) {
    e === "HP" ? this.currentHealth = Math.max(0, Math.min(t, this.maxHealth)) : e === "energy" && (this.currentEnergy = Math.max(0, Math.min(t, this.maxEnergy)));
  }
  addBuff(e) {
    this.buffs.includes(e) || this.buffs.push(e);
  }
  removeBuff(e) {
    this.buffs = this.buffs.filter((t) => t !== e);
  }
  hasBuff(e) {
    return this.buffs.some((t) => t.includes(e));
  }
  takeDamage(e) {
    const t = Math.max(0, e);
    return this.currentHealth = Math.max(0, this.currentHealth - t), this.gainEnergy(15), t;
  }
  heal(e) {
    const t = Math.max(0, e), r = this.currentHealth;
    return this.currentHealth = Math.min(
      this.currentHealth + t,
      this.maxHealth
    ), this.currentHealth - r;
  }
  gainEnergy(e) {
    this.currentEnergy = Math.min(this.currentEnergy + e, this.maxEnergy);
  }
  spendEnergy(e) {
    return this.currentEnergy >= e ? (this.currentEnergy -= e, !0) : !1;
  }
  isAlive() {
    return this.currentHealth > 0;
  }
  // 技能管理
  addSkill(e) {
    this.skills.set(e.id, e);
  }
  getSkill(e) {
    return this.skills.get(e);
  }
  getSkills() {
    return Array.from(this.skills.values());
  }
  hasSkill(e) {
    return this.skills.has(e);
  }
  // 行动后处理
  afterAction() {
    this.gainEnergy(10);
  }
  // 检查是否满血
  isFullHealth() {
    return this.currentHealth >= this.maxHealth;
  }
  // 检查是否需要治疗
  needsHealing() {
    return this.currentHealth / this.maxHealth < 0.5;
  }
}
class W extends C {
  constructor(t) {
    super(t);
    l(this, "type", "character");
    l(this, "character");
    this.character = t.character || this.createDefaultCharacter(t);
  }
  createDefaultCharacter(t) {
    const r = {
      HP: t.level * 10,
      MP: t.level * 5,
      ATK: t.level * 2,
      DEF: t.level,
      SPD: t.level,
      CRIT_RATE: 0.05,
      CRIT_DMG: 1.5,
      ACCURACY: 0.9,
      EVADE: 0.1,
      LIFESTEAL: 0,
      REGENERATION: 0,
      MANA_REGEN: 0,
      DAMAGE_BOOST: 0,
      DAMAGE_REDUCE: 0
    }, s = [];
    return {
      id: t.id,
      name: t.name,
      level: t.level,
      attributes: r,
      buffs: s,
      getAttribute: (i) => r[i] || 0,
      setAttribute: (i, a) => {
        r[i] = a;
      },
      addBuff: (i) => {
        s.includes(i) || s.push(i);
      },
      removeBuff: (i) => {
        const a = s.indexOf(i);
        a !== -1 && s.splice(a, 1);
      },
      hasBuff: (i) => s.some((a) => a.includes(i))
    };
  }
}
class q extends C {
  constructor(t) {
    super(t);
    l(this, "type", "enemy");
    l(this, "enemy");
    this.enemy = t.enemy || this.createDefaultEnemy(t);
  }
  createDefaultEnemy(t) {
    const r = {
      health: t.maxHealth,
      minAttack: t.level * 2,
      maxAttack: t.level * 4,
      defense: t.level,
      speed: t.level * 2
    }, s = [], i = /* @__PURE__ */ new Set();
    let a = t.currentHealth;
    const n = t.maxHealth;
    return {
      id: t.id,
      name: t.name,
      level: t.level,
      stats: r,
      drops: [],
      skills: {},
      get currentHealth() {
        return a;
      },
      set currentHealth(o) {
        a = Math.max(0, Math.min(o, n));
      },
      buffs: s,
      activeSkills: i,
      lastActionTime: Date.now(),
      get isDefeated() {
        return a <= 0;
      },
      getAttribute: (o) => {
        switch (o) {
          case "HP":
            return a;
          case "MAX_HP":
            return n;
          case "ATK":
            return r.minAttack + (r.maxAttack - r.minAttack) / 2;
          case "DEF":
            return r.defense;
          case "SPD":
            return r.speed;
          default:
            return 0;
        }
      },
      setAttribute: (o, f) => {
        o === "HP" && (a = Math.max(0, Math.min(f, n)));
      },
      addBuff: (o) => {
        s.includes(o) || s.push(o);
      },
      removeBuff: (o) => {
        const f = s.indexOf(o);
        f !== -1 && s.splice(f, 1);
      },
      hasBuff: (o) => s.some((f) => f.includes(o))
    };
  }
}
const y = class y {
  constructor() {
    l(this, "battles", /* @__PURE__ */ new Map());
    l(this, "battleLogger", u);
  }
  static getInstance() {
    return y.instance || (y.instance = new y()), y.instance;
  }
  createBattle(e) {
    const t = `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, r = /* @__PURE__ */ new Map(), s = [];
    e.forEach((n) => {
      if (n.type === "character") {
        const o = new W({
          id: `character_${n.id}`,
          name: n.name,
          level: 5,
          currentHealth: n.currentHealth,
          maxHealth: n.maxHealth,
          buffs: []
        });
        o.currentEnergy = n.currentEnergy, o.maxEnergy = n.maxEnergy, r.set(o.id, o), s.push(o.id);
      } else if (n.type === "enemy") {
        const o = new q({
          id: `enemy_${n.id}`,
          name: n.name,
          level: 5,
          currentHealth: n.currentHealth,
          maxHealth: n.maxHealth,
          buffs: []
        });
        o.currentEnergy = n.currentEnergy, o.maxEnergy = n.maxEnergy, r.set(o.id, o), s.push(o.id);
      }
    }), s.sort(() => Math.random() - 0.5);
    const i = /* @__PURE__ */ new Map();
    r.forEach((n) => {
      const o = H.createAI(n.type);
      i.set(n.id, o);
    });
    const a = {
      battleId: t,
      participants: r,
      actions: [],
      turnOrder: s,
      currentTurn: 0,
      isActive: !0,
      startTime: Date.now(),
      winner: void 0,
      aiInstances: i
    };
    return this.battles.set(t, a), this.battleLogger.info(`Battle created: ${t}`, {
      participantCount: e.length,
      characterCount: e.filter((n) => n.type === "character").length,
      enemyCount: e.filter((n) => n.type === "enemy").length
    }), this.addBattleAction(t, {
      id: `init_${Date.now()}`,
      type: "attack",
      sourceId: "system",
      targetId: "system",
      damage: 0,
      heal: 0,
      success: !0,
      timestamp: Date.now(),
      effects: [
        {
          type: "status",
          description: `战斗开始！参战角色: ${e.filter((n) => n.type === "character").length} 人，参战敌人: ${e.filter((n) => n.type === "enemy").length} 人`,
          duration: 0
        }
      ]
    }), this.convertToBattleState(a);
  }
  async processTurn(e) {
    const t = this.battles.get(e);
    if (!t || !t.isActive)
      return;
    t.participants.forEach((n) => {
      n.isAlive() && n.gainEnergy(25);
    }), t.currentTurn >= t.turnOrder.length && (t.currentTurn = 0);
    const r = t.turnOrder[t.currentTurn], s = t.participants.get(r);
    if (!s || !s.isAlive()) {
      t.currentTurn++;
      return;
    }
    try {
      const n = t.aiInstances.get(s.id);
      if (n) {
        const o = this.convertToBattleState(t), f = n.makeDecision(o, s);
        f.turn = t.currentTurn + 1;
        const h = t.participants.get(f.targetId);
        h && h.isAlive() ? await this.executeAction(f) : await this.executeDefaultAction(t, s);
      } else {
        const o = H.createAI(s.type);
        t.aiInstances.set(s.id, o), await this.executeDefaultAction(t, s);
      }
    } catch (n) {
      u.error("AI决策出错:", n), await this.executeDefaultAction(t, s);
    }
    t.currentTurn++;
    const i = Array.from(t.participants.values()).filter(
      (n) => n.type === "character" && n.isAlive()
    ), a = Array.from(t.participants.values()).filter(
      (n) => n.type === "enemy" && n.isAlive()
    );
    i.length === 0 ? this.endBattle(t.battleId, "enemy") : a.length === 0 && this.endBattle(t.battleId, "character");
  }
  // 执行默认行动
  async executeDefaultAction(e, t) {
    const r = Array.from(e.participants.values()).filter((n) => n.type === "enemy" && n.isAlive()).map((n) => n.id), s = Array.from(e.participants.values()).filter((n) => n.type === "character" && n.isAlive()).map((n) => n.id);
    let i, a;
    if (t.type === "character" && r.length > 0)
      i = r[Math.floor(Math.random() * r.length)], a = Math.floor(Math.random() * 20) + 10;
    else if (t.type === "enemy" && s.length > 0)
      i = s[Math.floor(Math.random() * s.length)], a = Math.floor(Math.random() * 15) + 8;
    else
      return;
    await this.executeAction({
      id: `action_${Date.now()}`,
      type: "attack",
      sourceId: t.id,
      targetId: i,
      damage: a,
      success: !0,
      timestamp: Date.now(),
      turn: e.currentTurn + 1,
      effects: [
        {
          type: "damage",
          value: a,
          description: `${t.name} 普通攻击 造成 ${a} 伤害`
        }
      ]
    });
  }
  async executeAction(e) {
    const t = this.findBattleByParticipant(e.sourceId);
    if (!t)
      throw new Error(
        `No active battle found for participant ${e.sourceId}`
      );
    const r = t.participants.get(e.sourceId), s = t.participants.get(e.targetId);
    if (!r || !s)
      throw new Error("Invalid source or target in action");
    if (e.type === "skill" && e.skillId) {
      const i = this.getSkillEnergyCost(e.skillId);
      i > 0 && (r.spendEnergy(i) ? e.effects.push({
        type: "status",
        description: `消耗 ${i} 能量`
      }) : (e.type = "attack", e.damage = Math.floor(Math.random() * 20) + 10, e.effects = [
        {
          type: "damage",
          value: e.damage,
          description: `${r.name} 普通攻击 (能量不足)`
        }
      ]));
    }
    if (e.damage && e.damage > 0) {
      const i = s.takeDamage(e.damage);
      e.damage = i, this.battleLogger.info(`Damage dealt: ${r.name} → ${s.name}`, {
        damage: i,
        targetHealth: s.currentHealth
      });
    }
    if (e.heal && e.heal > 0) {
      const i = s.heal(e.heal);
      e.heal = i, this.battleLogger.info(`Heal applied: ${r.name} → ${s.name}`, {
        heal: i,
        targetHealth: s.currentHealth
      });
    }
    if (e.buffId) {
      const i = `${s.id}_${e.buffId}_${Date.now()}`;
      s.addBuff(i), e.effects.push({
        type: "buff",
        buffId: e.buffId,
        description: `${e.buffId} applied to ${s.name}`
      });
    }
    return r.afterAction(), this.addBattleAction(t.battleId, e), e;
  }
  // 获取技能能量消耗
  getSkillEnergyCost(e) {
    return e.includes("ultimate") || e.includes("大招") ? 100 : e.includes("skill") || e.includes("技能") ? 50 : 0;
  }
  getBattleState(e) {
    const t = this.battles.get(e);
    if (t)
      return this.convertToBattleState(t);
  }
  endBattle(e, t) {
    const r = this.battles.get(e);
    r && (r.isActive = !1, r.winner = t, r.endTime = Date.now(), this.addBattleAction(e, {
      id: `end_${Date.now()}`,
      type: "skill",
      sourceId: "system",
      targetId: "system",
      success: !0,
      timestamp: Date.now(),
      turn: r.currentTurn + 1,
      effects: [
        {
          type: "status",
          description: `战斗结束！胜利者: ${t === "character" ? "角色方" : "敌方"}`,
          duration: 0
        }
      ]
    }), this.battleLogger.info(`Battle ended: ${e}`, { winner: t }));
  }
  addBattleAction(e, t) {
    const r = this.battles.get(e);
    r && (r.actions.push(t), r.actions.length > 100 && (r.actions = r.actions.slice(-100)));
  }
  findBattleByParticipant(e) {
    for (const t of this.battles.values())
      if (t.participants.has(e) && t.isActive)
        return t;
  }
  convertToBattleState(e) {
    return {
      battleId: e.battleId,
      participants: new Map(e.participants),
      actions: [...e.actions],
      turnOrder: [...e.turnOrder],
      currentTurn: e.currentTurn,
      isActive: e.isActive,
      startTime: e.startTime,
      endTime: e.endTime,
      winner: e.winner
    };
  }
  // Additional helper methods for UI integration
  getAllBattles() {
    return Array.from(this.battles.values()).map(
      (e) => this.convertToBattleState(e)
    );
  }
  getActiveBattles() {
    return Array.from(this.battles.values()).filter((e) => e.isActive).map((e) => this.convertToBattleState(e));
  }
  clearCompletedBattles() {
    for (const [e, t] of this.battles.entries())
      t.isActive || this.battles.delete(e);
  }
};
l(y, "instance");
let $ = y;
class X {
  constructor() {
    l(this, "metrics", /* @__PURE__ */ new Map());
    l(this, "enabled", !1);
  }
  enable() {
    this.enabled = !0, u.info("Performance monitoring enabled");
  }
  disable() {
    this.enabled = !1, u.info("Performance monitoring disabled");
  }
  measure(e, t) {
    if (!this.enabled)
      return t();
    const r = performance.now(), s = t(), a = performance.now() - r;
    return this.recordMetric(e, a), s;
  }
  recordMetric(e, t) {
    this.metrics.has(e) || this.metrics.set(e, {
      name: e,
      calls: 0,
      totalTime: 0,
      avgTime: 0,
      maxTime: 0,
      minTime: 1 / 0
    });
    const r = this.metrics.get(e);
    r.calls++, r.totalTime += t, r.avgTime = r.totalTime / r.calls, r.maxTime = Math.max(r.maxTime, t), r.minTime = Math.min(r.minTime, t);
  }
  getMetrics() {
    return Array.from(this.metrics.values());
  }
  getMetric(e) {
    return this.metrics.get(e);
  }
  reset() {
    this.metrics.clear(), u.info("Performance metrics reset");
  }
  printReport() {
    if (!this.enabled || this.metrics.size === 0) {
      u.info("No performance metrics to report");
      return;
    }
    u.info("=== Performance Report ==="), this.getMetrics().forEach((e) => {
      u.info(`${e.name}:`, {
        calls: e.calls,
        avgTime: `${e.avgTime.toFixed(2)}ms`,
        maxTime: `${e.maxTime.toFixed(2)}ms`,
        minTime: `${e.minTime.toFixed(2)}ms`,
        totalTime: `${e.totalTime.toFixed(2)}ms`
      });
    }), u.info("========================");
  }
}
const J = new X(), ne = (c, e) => J.measure(c, e);
class Y {
  constructor(e) {
    l(this, "pool", []);
    l(this, "options");
    l(this, "borrowedCount", 0);
    this.options = e;
  }
  borrow() {
    if (this.pool.length > 0) {
      const e = this.pool.pop();
      return this.options.validate && !this.options.validate(e) ? (u.warn("Object pool validation failed, creating new instance"), this.options.create()) : (this.borrowedCount++, e);
    }
    return this.borrowedCount >= this.options.maxSize && u.warn("Object pool max size reached, creating new instance"), this.borrowedCount++, this.options.create();
  }
  return(e) {
    if (this.pool.length >= this.options.maxSize) {
      u.debug("Object pool full, discarding instance");
      return;
    }
    try {
      this.options.reset(e), this.pool.push(e), this.borrowedCount = Math.max(0, this.borrowedCount - 1);
    } catch (t) {
      u.error("Failed to reset object in pool:", t);
    }
  }
  getPoolSize() {
    return this.pool.length;
  }
  getBorrowedCount() {
    return this.borrowedCount;
  }
  clear() {
    this.pool = [], this.borrowedCount = 0, u.info("Object pool cleared");
  }
  prewarm(e) {
    for (let t = 0; t < e && this.pool.length < this.options.maxSize; t++)
      this.pool.push(this.options.create());
    u.info(`Object pool prewarmed with ${e} instances`);
  }
}
const le = () => new Y({
  maxSize: 100,
  create: () => ({}),
  reset: (c) => {
    c.variables && c.variables.clear();
  }
});
class Q {
  validate(e, t) {
    const r = [];
    return this.validateValue("", e, t, r), {
      valid: r.length === 0,
      errors: r
    };
  }
  validateValue(e, t, r, s) {
    if (r.type === "string" && typeof t != "string") {
      s.push({
        field: e || "root",
        message: "Expected string"
      });
      return;
    }
    if (r.type === "number" && typeof t != "number") {
      s.push({
        field: e || "root",
        message: "Expected number"
      });
      return;
    }
    if (r.type === "boolean" && typeof t != "boolean") {
      s.push({
        field: e || "root",
        message: "Expected boolean"
      });
      return;
    }
    if (r.type === "array" && !Array.isArray(t)) {
      s.push({
        field: e || "root",
        message: "Expected array"
      });
      return;
    }
    if (r.type === "object" && typeof t != "object") {
      s.push({
        field: e || "root",
        message: "Expected object"
      });
      return;
    }
    if (r.type === "string" && (r.minLength !== void 0 && t.length < r.minLength && s.push({
      field: e || "root",
      message: `String length must be at least ${r.minLength}`
    }), r.maxLength !== void 0 && t.length > r.maxLength && s.push({
      field: e || "root",
      message: `String length must be at most ${r.maxLength}`
    })), r.type === "number" && (r.minimum !== void 0 && t < r.minimum && s.push({
      field: e || "root",
      message: `Number must be at least ${r.minimum}`
    }), r.maximum !== void 0 && t > r.maximum && s.push({
      field: e || "root",
      message: `Number must be at most ${r.maximum}`
    })), r.enum !== void 0 && !r.enum.includes(t) && s.push({
      field: e || "root",
      message: `Value must be one of: ${r.enum.join(", ")}`
    }), r.type === "object" && typeof t == "object" && t !== null) {
      if (r.required)
        for (const i of r.required)
          i in t || s.push({
            field: e ? `${e}.${i}` : i,
            message: "Required field"
          });
      if (r.properties)
        for (const [i, a] of Object.entries(r.properties))
          i in t && this.validateValue(
            e ? `${e}.${i}` : i,
            t[i],
            a,
            s
          );
    }
  }
  validateBuffConfig(e) {
    const t = {
      type: "object",
      required: ["id", "name", "description", "duration", "maxStacks", "cooldown"],
      properties: {
        id: {
          type: "string",
          minLength: 1
        },
        name: {
          type: "string",
          minLength: 1
        },
        description: {
          type: "string"
        },
        duration: {
          type: "number",
          minimum: -1
        },
        maxStacks: {
          type: "number",
          minimum: 1
        },
        cooldown: {
          type: "number",
          minimum: 0
        },
        isPermanent: {
          type: "boolean"
        },
        isDebuff: {
          type: "boolean"
        },
        parameters: {
          type: "object"
        }
      }
    }, r = this.validate(e, t);
    return r.valid ? !0 : (u.error("Invalid buff config:", r.errors), !1);
  }
}
const oe = new Q();
class A {
  constructor() {
    l(this, "params");
  }
  onApply(e) {
    d.wrap(() => {
      this._onApply(e);
    });
  }
  onRemove(e) {
    d.wrap(() => {
      this._onRemove(e), e.removeModifiers();
    });
  }
  onUpdate(e, t) {
    d.wrap(() => {
      this._onUpdate(e, t);
    });
  }
  onRefresh(e) {
    d.wrap(() => {
      this._onRefresh(e);
    });
  }
  addModifier(e, t, r, s) {
    e.addModifier(t, r, s);
  }
  getConfigValue(e, t, r) {
    var s;
    return ((s = e.config.parameters) == null ? void 0 : s[t]) ?? r;
  }
  log(e, t) {
    u.debug(`[${e.config.id}] ${t}`);
  }
  triggerEvent(e, t, r) {
    e.triggerEvent(t, r);
  }
}
class ce {
  static calculateDamage(e, t, r, s = !1) {
    const i = e.getAttribute("ATK"), a = t.getAttribute("DEF");
    let n = r * (i / (i + a * 0.8));
    if (s) {
      const o = e.getAttribute("CRIT_DMG");
      n *= 1 + o;
    }
    return Math.max(1, Math.floor(n));
  }
  static calculateHealing(e, t) {
    const r = e.level, s = e.getAttribute("HP");
    let i = t * (1 + r * 0.01);
    const a = s * 0.3;
    return Math.min(a, Math.floor(i));
  }
  static checkCondition(e, t) {
    var r, s;
    switch (t.type) {
      case "HP_BELOW":
        return e.getAttributeValue("HP") < t.value;
      case "MP_BELOW":
        return e.getAttributeValue("MP") < t.value;
      case "LEVEL_ABOVE":
        return (((r = e.getCharacter()) == null ? void 0 : r.level) || 0) > t.value;
      case "HAS_BUFF":
        return ((s = e.getCharacter()) == null ? void 0 : s.hasBuff(t.attribute)) ?? !1;
      default:
        return !0;
    }
  }
  static getRandomValue(e, t) {
    return Math.random() * (t - e) + e;
  }
  static getRandomInt(e, t) {
    return Math.floor(Math.random() * (t - e + 1)) + e;
  }
  static calculateDuration(e, t = 1, r = 1) {
    return e * t * (1 + r * 0.05);
  }
  static calculateEffectValue(e, t = 1, r = 1) {
    return e * t * (1 + r * 0.08);
  }
  static formatDuration(e) {
    if (e < 1e3)
      return `${e}ms`;
    if (e < 6e4)
      return `${(e / 1e3).toFixed(1)}s`;
    {
      const t = Math.floor(e / 6e4), r = Math.floor(e % 6e4 / 1e3);
      return `${t}m ${r}s`;
    }
  }
  static isExpired(e) {
    const t = e.getRemainingTime();
    return t >= 0 && t <= 0;
  }
  static canStack(e, t) {
    const r = e.getCharacter();
    if (!r) return !1;
    const s = e.config.id;
    return r.buffs.filter(
      (a) => a.includes(s)
    ).length < t;
  }
}
class S extends A {
  _onApply(e) {
    this.log(e, "山神降临！获得强大的力量");
    const t = this.getConfigValue(e, "attackBonus", 50), r = this.getConfigValue(e, "defenseBonus", 30);
    this.addModifier(e, "ATK", t, "ADDITIVE"), this.addModifier(e, "DEF", r, "ADDITIVE"), this.addModifier(e, "CRIT_RATE", 0.1, "ADDITIVE"), e.setVariable("initialAttackBonus", t);
  }
  _onRemove(e) {
    this.log(e, "山神之力消散");
  }
  _onUpdate(e, t) {
    const r = e.getElapsedTime();
    if (Math.floor(r / 1e3) > Math.floor((r - t) / 1e3)) {
      const s = this.getConfigValue(e, "regeneration", 5);
      this.log(e, `山神的祝福：恢复 ${s} 生命值`);
    }
  }
  _onRefresh(e) {
    this.log(e, "山神之力得到强化！");
    const t = this.getConfigValue(e, "refreshBonus", 10);
    this.addModifier(e, "ATK", t, "ADDITIVE"), this.log(e, `获得额外 ${t} 攻击力`);
  }
}
l(S, "BUFF_ID", "mountain_god");
const Z = S.BUFF_ID, P = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BUFF_ID: Z,
  MountainGodBuff: S
}, Symbol.toStringTag, { value: "Module" }));
class I extends A {
  _onApply(e) {
    this.log(e, "中毒了！毒素开始侵蚀身体"), this.addModifier(e, "SPD", -0.2, "MULTIPLICATIVE");
    const t = this.getConfigValue(e, "baseDamage", 10);
    e.setVariable("baseDamage", t), e.setVariable("lastDamageTime", 0);
  }
  _onRemove(e) {
    this.log(e, "毒素效果消失");
  }
  _onUpdate(e, t) {
    const r = e.getElapsedTime(), s = e.getVariable("lastDamageTime") || 0, i = this.getConfigValue(e, "damageInterval", 2e3);
    if (r - s >= i) {
      const a = e.getVariable("baseDamage") || 10, n = this.getConfigValue(e, "damageMultiplier", 1.2), o = Math.floor(r / i), f = Math.floor(a * Math.pow(n, o));
      this.log(e, `毒素伤害：${f}`), e.setVariable("lastDamageTime", r);
    }
  }
  _onRefresh(e) {
    this.log(e, "毒素效果增强！");
    const t = e.getVariable("baseDamage") || 10, r = this.getConfigValue(e, "refreshBonus", 5);
    e.setVariable("baseDamage", t + r), this.log(e, `毒素伤害提升至 ${t + r}`);
  }
}
l(I, "BUFF_ID", "poison");
const ee = I.BUFF_ID, R = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BUFF_ID: ee,
  PoisonDebuff: I
}, Symbol.toStringTag, { value: "Module" }));
class E extends A {
  _onApply(e) {
    this.log(e, "陷入狂暴状态！攻击力大幅提升，但防御力降低");
    const t = this.getConfigValue(e, "attackBonus", 100);
    this.addModifier(e, "ATK", t, "ADDITIVE"), this.addModifier(e, "CRIT_RATE", 0.2, "ADDITIVE"), this.addModifier(e, "CRIT_DMG", 0.5, "ADDITIVE"), this.addModifier(e, "DEF", -0.3, "MULTIPLICATIVE"), e.setVariable("attackBonus", t);
  }
  _onRemove(e) {
    this.log(e, "狂暴状态结束，恢复平静");
  }
  _onUpdate(e, t) {
    const r = e.getElapsedTime();
    if (Math.floor(r / 1e3) > Math.floor((r - t) / 1e3)) {
      const s = this.getConfigValue(e, "selfDamage", 5);
      this.log(e, `狂暴的代价：损失 ${s} 生命值`);
    }
  }
  _onRefresh(e) {
    this.log(e, "狂暴之力进一步增强！");
    const t = this.getConfigValue(e, "refreshAttackBonus", 20), r = this.getConfigValue(e, "refreshCritRateBonus", 0.05);
    this.addModifier(e, "ATK", t, "ADDITIVE"), this.addModifier(e, "CRIT_RATE", r, "ADDITIVE"), this.log(e, `获得额外 ${t} 攻击力和 ${(r * 100).toFixed(0)}% 暴击率`);
  }
}
l(E, "BUFF_ID", "berserk");
const te = E.BUFF_ID, U = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BUFF_ID: te,
  BerserkBuff: E
}, Symbol.toStringTag, { value: "Module" }));
class B extends A {
  _onApply(e) {
    this.log(e, "获得持续治疗效果");
    const t = this.getConfigValue(e, "baseHealing", 20), r = this.getConfigValue(e, "healInterval", 1e3);
    e.setVariable("baseHealing", t), e.setVariable("healInterval", r), e.setVariable("lastHealTime", 0);
  }
  _onRemove(e) {
    this.log(e, "持续治疗效果结束");
  }
  _onUpdate(e, t) {
    const r = e.getElapsedTime(), s = e.getVariable("lastHealTime") || 0, i = e.getVariable("healInterval") || 1e3;
    if (r - s >= i) {
      const a = e.getVariable("baseHealing") || 20, n = this.getConfigValue(e, "healingBonus", 0), o = a + n;
      this.log(e, `持续治疗：恢复 ${o} 生命值`), e.setVariable("lastHealTime", r);
    }
  }
  _onRefresh(e) {
    this.log(e, "持续治疗效果增强！");
    const t = e.getVariable("baseHealing") || 20, r = this.getConfigValue(e, "refreshBonus", 5);
    e.setVariable("baseHealing", t + r), this.log(e, `治疗量提升至 ${t + r}`);
  }
}
l(B, "BUFF_ID", "heal_over_time");
const re = B.BUFF_ID, O = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BUFF_ID: re,
  HealOverTime: B
}, Symbol.toStringTag, { value: "Module" }));
class M extends A {
  _onApply(e) {
    this.log(e, "获得护盾保护");
    const t = this.getConfigValue(e, "baseShield", 100), r = this.getConfigValue(e, "shieldScale", 1), s = e.getCharacter(), i = s ? s.getAttribute("HP") : 1e3, a = Math.floor(t * r + i * 0.1);
    e.setVariable("shieldValue", a), e.setVariable("maxShieldValue", a), e.setVariable("shieldRegen", this.getConfigValue(e, "shieldRegen", 0));
  }
  _onRemove(e) {
    const t = e.getVariable("shieldValue") || 0;
    this.log(e, `护盾效果消失，剩余护盾值：${t}`);
  }
  _onUpdate(e, t) {
    const r = e.getVariable("shieldRegen") || 0;
    if (r > 0) {
      const s = e.getElapsedTime();
      if (Math.floor(s / 1e3) > Math.floor((s - t) / 1e3)) {
        const i = e.getVariable("shieldValue") || 0, a = e.getVariable("maxShieldValue") || 100, n = Math.min(i + r, a);
        e.setVariable("shieldValue", n), this.log(e, `护盾恢复：${r}，当前护盾值：${n}`);
      }
    }
  }
  _onRefresh(e) {
    this.log(e, "护盾效果增强！");
    const t = e.getVariable("shieldValue") || 0, r = e.getVariable("maxShieldValue") || 100, s = this.getConfigValue(e, "refreshBonus", 20), i = r + s, a = t + s;
    e.setVariable("shieldValue", a), e.setVariable("maxShieldValue", i), this.log(e, `护盾值提升至 ${a}/${i}`);
  }
}
l(M, "BUFF_ID", "shield");
const se = M.BUFF_ID, x = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BUFF_ID: se,
  ShieldBuff: M
}, Symbol.toStringTag, { value: "Module" })), ue = {
  mountain_god: () => Promise.resolve().then(() => P),
  poison: () => Promise.resolve().then(() => R),
  berserk: () => Promise.resolve().then(() => U),
  heal_over_time: () => Promise.resolve().then(() => O),
  shield: () => Promise.resolve().then(() => x)
};
async function he() {
  try {
    const { BuffScriptLoader: c } = await Promise.resolve().then(() => N);
    await c.getInstance().loadScripts(), console.log("Buff system initialized successfully");
  } catch (c) {
    console.error("Failed to initialize buff system:", c);
  }
}
export {
  A as BaseBuffScript,
  $ as BattleSystem,
  E as BerserkBuff,
  z as BuffContext,
  d as BuffErrorBoundary,
  w as BuffScriptLoader,
  v as BuffScriptRegistry,
  ce as BuffScriptUtils,
  k as BuffSystem,
  B as HealOverTime,
  V as Logger,
  _ as ModifierStack,
  S as MountainGodBuff,
  Y as ObjectPool,
  I as PoisonDebuff,
  Q as SchemaValidator,
  M as ShieldBuff,
  ue as buffScripts,
  le as createBuffContextPool,
  he as initializeBuffSystem,
  u as logger,
  ne as measure,
  J as perfMonitor,
  oe as schemaValidator
};
//# sourceMappingURL=GameSystem.es.js.map
