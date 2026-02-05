/**
 * 游戏数据处理工具类
 * 封装常用的数据操作方法，提高代码复用性和维护性
 */

export interface DataProcessorOptions {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存过期时间（毫秒） */
  cacheExpiry?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
}

export interface FilterOptions<T> {
  /** 过滤条件 */
  condition: (item: T) => boolean;
  /** 最大返回数量 */
  limit?: number;
  /** 排序字段 */
  sortBy?: keyof T;
  /** 排序方向 */
  sortDirection?: 'asc' | 'desc';
}

export interface SearchOptions<T> {
  /** 搜索字段 */
  fields: (keyof T)[];
  /** 搜索关键词 */
  keyword: string;
  /** 是否模糊匹配 */
  fuzzy?: boolean;
  /** 匹配阈值（仅模糊匹配时有效） */
  threshold?: number;
}

export interface TransformOptions<T, R> {
  /** 转换函数 */
  transform: (item: T) => R;
  /** 是否并行处理 */
  parallel?: boolean;
  /** 并行处理批次大小 */
  batchSize?: number;
}

export interface ValidationRule<T> {
  /** 验证字段 */
  field: keyof T;
  /** 验证类型 */
  type: 'required' | 'number' | 'string' | 'array' | 'object';
  /** 最小值（数字类型） */
  min?: number;
  /** 最大值（数字类型） */
  max?: number;
  /** 最小长度（字符串/数组类型） */
  minLength?: number;
  /** 最大长度（字符串/数组类型） */
  maxLength?: number;
  /** 正则表达式（字符串类型） */
  pattern?: RegExp;
  /** 自定义验证函数 */
  validator?: (value: any) => boolean;
  /** 错误消息 */
  message?: string;
}

export interface ValidationResult {
  /** 是否验证通过 */
  isValid: boolean;
  /** 错误信息 */
  errors: string[];
}

/**
 * 数据处理工具类
 */
export class DataProcessor {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private options: DataProcessorOptions;

  constructor(options: DataProcessorOptions = {}) {
    this.options = {
      enableCache: true,
      cacheExpiry: 300000, // 5分钟
      debug: false,
      ...options
    };
  }

  /**
   * 数据查找方法
   */
  static find<T>(data: T[], condition: (item: T) => boolean): T | undefined {
    return data.find(condition);
  }

  /**
   * 数据过滤方法
   */
  static filter<T>(data: T[], options: FilterOptions<T>): T[] {
    let result = data.filter(options.condition);

    if (options.sortBy) {
      result = result.sort((a, b) => {
        const aVal = a[options.sortBy!];
        const bVal = b[options.sortBy!];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return options.sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
        }
        
        const aStr = String(aVal);
        const bStr = String(bVal);
        return options.sortDirection === 'desc' 
          ? bStr.localeCompare(aStr) 
          : aStr.localeCompare(bStr);
      });
    }

    if (options.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * 数据映射转换
   */
  static map<T, R>(data: T[], options: TransformOptions<T, R>): R[] {
    if (options.parallel && data.length > (options.batchSize || 1000)) {
      return this.parallelMap(data, options.transform, options.batchSize || 1000);
    }
    return data.map(options.transform);
  }

  /**
   * 并行映射处理
   */
  private static parallelMap<T, R>(data: T[], transform: (item: T) => R, batchSize: number): R[] {
    const result: R[] = [];
    const batches = Math.ceil(data.length / batchSize);

    for (let i = 0; i < batches; i++) {
      const batch = data.slice(i * batchSize, (i + 1) * batchSize);
      const batchResult = batch.map(transform);
      result.push(...batchResult);
    }

    return result;
  }

  /**
   * 数据搜索
   */
  static search<T>(data: T[], options: SearchOptions<T>): T[] {
    const { fields, keyword, fuzzy = false, threshold = 0.7 } = options;
    const lowerKeyword = keyword.toLowerCase();

    return data.filter(item => {
      return fields.some(field => {
        const value = String(item[field]).toLowerCase();
        
        if (fuzzy) {
          return this.calculateSimilarity(value, lowerKeyword) >= threshold;
        }
        
        return value.includes(lowerKeyword);
      });
    });
  }

  /**
   * 计算字符串相似度（Levenshtein距离）
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0 || len2 === 0) return 0;
    
    const matrix: number[][] = [];
    
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    const distance = matrix[len1][len2];
    return 1 - distance / Math.max(len1, len2);
  }

  /**
   * 数据分组
   */
  static groupBy<T, K extends keyof T>(data: T[], key: K): Map<T[K], T[]> {
    const groups = new Map<T[K], T[]>();
    
    data.forEach(item => {
      const groupKey = item[key];
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(item);
    });
    
    return groups;
  }

  /**
   * 数据去重
   */
  static unique<T>(data: T[], key?: keyof T): T[] {
    const seen = new Set();
    return data.filter(item => {
      const value = key ? item[key] : JSON.stringify(item);
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  /**
   * 数据验证
   */
  static validate<T>(data: T, rules: ValidationRule<T>[]): ValidationResult {
    const errors: string[] = [];

    rules.forEach(rule => {
      const value = data[rule.field];
      
      switch (rule.type) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            errors.push(rule.message || `${String(rule.field)} 是必填字段`);
          }
          break;
          
        case 'number':
          if (typeof value !== 'number') {
            errors.push(rule.message || `${String(rule.field)} 必须是数字`);
          } else {
            if (rule.min !== undefined && value < rule.min) {
              errors.push(rule.message || `${String(rule.field)} 不能小于 ${rule.min}`);
            }
            if (rule.max !== undefined && value > rule.max) {
              errors.push(rule.message || `${String(rule.field)} 不能大于 ${rule.max}`);
            }
          }
          break;
          
        case 'string':
          if (typeof value !== 'string') {
            errors.push(rule.message || `${String(rule.field)} 必须是字符串`);
          } else {
            if (rule.minLength !== undefined && value.length < rule.minLength) {
              errors.push(rule.message || `${String(rule.field)} 长度不能小于 ${rule.minLength}`);
            }
            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
              errors.push(rule.message || `${String(rule.field)} 长度不能大于 ${rule.maxLength}`);
            }
            if (rule.pattern && !rule.pattern.test(value)) {
              errors.push(rule.message || `${String(rule.field)} 格式不正确`);
            }
          }
          break;
          
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(rule.message || `${String(rule.field)} 必须是数组`);
          } else {
            if (rule.minLength !== undefined && value.length < rule.minLength) {
              errors.push(rule.message || `${String(rule.field)} 长度不能小于 ${rule.minLength}`);
            }
            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
              errors.push(rule.message || `${String(rule.field)} 长度不能大于 ${rule.maxLength}`);
            }
          }
          break;
          
        case 'object':
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            errors.push(rule.message || `${String(rule.field)} 必须是对象`);
          }
          break;
      }
      
      if (rule.validator && !rule.validator(value)) {
        errors.push(rule.message || `${String(rule.field)} 验证失败`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取缓存数据
   */
  getCachedData<T>(key: string): T | null {
    if (!this.options.enableCache) return null;
    
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > (this.options.cacheExpiry || 300000)) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * 设置缓存数据
   */
  setCachedData<T>(key: string, data: T): void {
    if (!this.options.enableCache) return;
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    if (this.options.debug) {
      console.log(`[DataProcessor] 缓存设置: ${key}`);
    }
  }

  /**
   * 清除缓存
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
    
    if (this.options.debug) {
      console.log(`[DataProcessor] 缓存清除: ${key || '全部'}`);
    }
  }

  /**
   * 批量处理数据
   */
  static batchProcess<T, R>(
    data: T[], 
    processor: (item: T) => R, 
    batchSize: number = 100,
    onProgress?: (processed: number, total: number) => void
  ): R[] {
    const result: R[] = [];
    const total = data.length;
    
    for (let i = 0; i < total; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const batchResult = batch.map(processor);
      result.push(...batchResult);
      
      if (onProgress) {
        onProgress(Math.min(i + batchSize, total), total);
      }
    }
    
    return result;
  }

  /**
   * 游戏特定数据操作方法
   */

  /**
   * 根据ID查找敌人数据
   */
  static findEnemyById(enemies: any[], enemyId: string): any | undefined {
    return this.find(enemies, enemy => enemy.id === enemyId);
  }

  /**
   * 根据名称搜索敌人数据
   */
  static searchEnemiesByName(enemies: any[], name: string): any[] {
    return this.search(enemies, {
      fields: ['name'],
      keyword: name,
      fuzzy: true
    });
  }

  /**
   * 过滤活跃的战斗角色
   */
  static filterActiveCharacters(characters: any[]): any[] {
    return this.filter(characters, {
      condition: char => char.enabled === true,
      sortBy: 'speed',
      sortDirection: 'desc'
    });
  }

  /**
   * 转换敌人数据为战斗角色
   */
  static transformEnemyToBattleCharacter(enemy: any, index: number): any {
    return {
      originalId: enemy.id,
      id: `char_${index + 1}`,
      name: enemy.name,
      level: enemy.level,
      maxHp: enemy.stats.health,
      currentHp: enemy.stats.health,
      maxMp: 100,
      currentMp: 100,
      currentEnergy: 0,
      maxEnergy: 150,
      attack: Math.floor((enemy.stats.minAttack + enemy.stats.maxAttack) / 2),
      defense: enemy.stats.defense,
      speed: enemy.stats.speed,
      enabled: index < 3,
      isFirst: index === 0,
      buffs: index === 0 ? [{
        id: "buff_1",
        name: "力量祝福",
        remainingTurns: 5,
        isPositive: true,
      }] : [],
    };
  }

  /**
   * 验证战斗角色数据
   */
  static validateBattleCharacter(character: any): ValidationResult {
    return this.validate(character, [
      { field: 'id', type: 'required', message: '角色ID是必填字段' },
      { field: 'name', type: 'required', message: '角色名称是必填字段' },
      { field: 'level', type: 'number', min: 1, max: 100, message: '等级必须在1-100之间' },
      { field: 'maxHp', type: 'number', min: 1, message: '最大生命值必须大于0' },
      { field: 'currentHp', type: 'number', min: 0, message: '当前生命值不能为负数' },
      { field: 'attack', type: 'number', min: 0, message: '攻击力不能为负数' },
      { field: 'defense', type: 'number', min: 0, message: '防御力不能为负数' },
      { field: 'speed', type: 'number', min: 0, message: '速度不能为负数' }
    ]);
  }

  /**
   * 获取角色技能信息
   */
  static getCharacterSkills(character: any, skillsData: any[]): any {
    if (!character.originalId) return {};
    
    const enemySkills = this.find(skillsData, skill => 
      skill.id.includes(character.originalId)
    );
    
    return enemySkills || {};
  }

  /**
   * 计算角色属性加成
   */
  static calculateStatBonus(character: any, stat: string): number {
    if (!character.buffs) return 0;
    
    const bonuses = character.buffs.filter((buff: any) => !buff.isPositive);
    if (stat === 'attack') return bonuses.length * 10;
    if (stat === 'defense') return bonuses.length * 5;
    return 0;
  }

  /**
   * 计算最终属性值
   */
  static calculateFinalStat(character: any, stat: string): number {
    const base = stat === 'attack' ? character.attack : character.defense;
    const bonus = this.calculateStatBonus(character, stat);
    return Math.floor(base * (1 + bonus / 100));
  }
}