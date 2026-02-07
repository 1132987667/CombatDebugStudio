/**
 * 通用战斗框架 - 配置管理器
 * 
 * 功能：
 * 1. 统一管理框架和业务配置
 * 2. 支持多环境配置（开发/测试/生产）
 * 3. 配置热更新和动态加载
 * 4. 配置验证和类型安全
 * 5. 配置变更监听和通知
 */

import type { IConfigManager } from './interfaces';
import { FrameworkLogger } from '@/utils/logging'

/**
 * 配置项定义
 */
interface ConfigItem<T = any> {
  value: T;
  defaultValue: T;
  validator?: (value: T) => boolean;
  description: string;
  lastModified: number;
}

/**
 * 配置管理器实现
 */
export class ConfigManager implements IConfigManager {
  private configs: Map<string, ConfigItem> = new Map();
  private changeListeners: Map<string, Array<(newValue: any) => void>> = new Map();
  private logger: Logger;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * 初始化配置管理器
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 加载默认配置
      await this.loadDefaultConfigs();
      
      // 加载环境特定配置
      await this.loadEnvironmentConfigs();
      
      // 加载用户自定义配置
      await this.loadUserConfigs();

      this.isInitialized = true;
      this.logger.info('ConfigManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize ConfigManager', { error });
      throw error;
    }
  }

  /**
   * 加载配置
   */
  public loadConfig<T>(key: string): T | undefined {
    const item = this.configs.get(key);
    return item ? (item.value as T) : undefined;
  }

  /**
   * 保存配置
   */
  public saveConfig<T>(key: string, config: T): void {
    const oldItem = this.configs.get(key);
    const newItem: ConfigItem<T> = {
      value: config,
      defaultValue: oldItem?.defaultValue || config,
      validator: oldItem?.validator,
      description: oldItem?.description || `Configuration for ${key}`,
      lastModified: Date.now()
    };

    // 配置验证
    if (newItem.validator && !newItem.validator(config)) {
      this.logger.warn(`Configuration validation failed for key: ${key}`);
      return;
    }

    this.configs.set(key, newItem);

    // 通知配置变更
    this.notifyConfigChange(key, config);

    this.logger.debug(`Configuration saved`, { key, config });
  }

  /**
   * 监听配置变化
   */
  public onConfigChange<T>(key: string, callback: (newConfig: T) => void): void {
    if (!this.changeListeners.has(key)) {
      this.changeListeners.set(key, []);
    }
    this.changeListeners.get(key)!.push(callback);
  }

  /**
   * 获取所有配置
   */
  public getAllConfigs(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, item] of this.configs.entries()) {
      result[key] = item.value;
    }
    return result;
  }

  /**
   * 重置配置到默认值
   */
  public resetConfig(key: string): boolean {
    const item = this.configs.get(key);
    if (!item) {
      return false;
    }

    this.saveConfig(key, item.defaultValue);
    this.logger.info(`Configuration reset to default`, { key });
    return true;
  }

  /**
   * 批量更新配置
   */
  public updateConfigs(configs: Record<string, any>): void {
    for (const [key, value] of Object.entries(configs)) {
      this.saveConfig(key, value);
    }
    this.logger.info('Batch configuration update completed', { 
      updatedCount: Object.keys(configs).length 
    });
  }

  /**
   * 检查配置是否存在
   */
  public hasConfig(key: string): boolean {
    return this.configs.has(key);
  }

  /**
   * 删除配置
   */
  public deleteConfig(key: string): boolean {
    const existed = this.configs.delete(key);
    if (existed) {
      this.changeListeners.delete(key);
      this.logger.info('Configuration deleted', { key });
    }
    return existed;
  }

  /**
   * 导出配置到文件
   */
  public async exportConfigs(format: 'json' | 'yaml' = 'json'): Promise<string> {
    const configs = this.getAllConfigs();
    
    if (format === 'json') {
      return JSON.stringify(configs, null, 2);
    } else {
      // 简单的YAML转换（实际项目中应使用yaml库）
      return this.convertToYaml(configs);
    }
  }

  /**
   * 从文件导入配置
   */
  public async importConfigs(configData: string, format: 'json' | 'yaml' = 'json'): Promise<void> {
    let configs: Record<string, any>;
    
    try {
      if (format === 'json') {
        configs = JSON.parse(configData);
      } else {
        configs = this.parseYaml(configData);
      }
      
      this.updateConfigs(configs);
      this.logger.info('Configuration import completed');
    } catch (error) {
      this.logger.error('Configuration import failed', { error });
      throw error;
    }
  }

  /**
   * 注册配置验证器
   */
  public registerValidator<T>(key: string, validator: (value: T) => boolean): void {
    const item = this.configs.get(key);
    if (item) {
      item.validator = validator;
      this.configs.set(key, item);
    }
  }

  /**
   * 获取配置元数据
   */
  public getConfigMetadata(key: string): ConfigMetadata | undefined {
    const item = this.configs.get(key);
    if (!item) {
      return undefined;
    }

    return {
      key,
      description: item.description,
      defaultValue: item.defaultValue,
      currentValue: item.value,
      lastModified: item.lastModified,
      hasValidator: !!item.validator
    };
  }

  /**
   * 加载默认配置
   */
  private async loadDefaultConfigs(): Promise<void> {
    const defaultConfigs: Record<string, any> = {
      // 框架配置
      'framework.version': '1.0.0',
      'framework.debug': false,
      'framework.performanceMonitoring': true,
      
      // 战斗系统配置
      'battle.maxTurns': 100,
      'battle.allowFlee': true,
      'battle.enableCritical': true,
      'battle.enableDodge': true,
      'battle.turnOrder': 'speed',
      
      // AI配置
      'ai.difficulty': 'normal',
      'ai.aggression': 0.5,
      'ai.skillUsageProbability': 0.7,
      
      // 性能配置
      'performance.maxBattles': 100,
      'performance.maxParticipants': 1000,
      'performance.maxActionsPerBattle': 1000
    };

    for (const [key, value] of Object.entries(defaultConfigs)) {
      this.configs.set(key, {
        value,
        defaultValue: value,
        description: `Default configuration for ${key}`,
        lastModified: Date.now()
      });
    }

    this.logger.debug('Default configurations loaded');
  }

  /**
   * 加载环境特定配置
   */
  private async loadEnvironmentConfigs(): Promise<void> {
    const env = process.env.NODE_ENV || 'development';
    
    const envConfigs: Record<string, Record<string, any>> = {
      development: {
        'framework.debug': true,
        'framework.performanceMonitoring': true,
        'battle.maxTurns': 50
      },
      production: {
        'framework.debug': false,
        'framework.performanceMonitoring': false,
        'performance.maxBattles': 50
      },
      test: {
        'framework.debug': true,
        'battle.maxTurns': 10
      }
    };

    const configs = envConfigs[env] || {};
    this.updateConfigs(configs);
    
    this.logger.debug(`Environment configurations loaded for: ${env}`);
  }

  /**
   * 加载用户自定义配置
   */
  private async loadUserConfigs(): Promise<void> {
    // 在实际项目中，这里会从文件系统或数据库加载用户配置
    // 目前使用空实现
    this.logger.debug('User configurations loading skipped (not implemented)');
  }

  /**
   * 通知配置变更
   */
  private notifyConfigChange<T>(key: string, newValue: T): void {
    const listeners = this.changeListeners.get(key);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(newValue);
        } catch (error) {
          this.logger.error('Config change listener error', { key, error });
        }
      });
    }
  }

  /**
   * 简单YAML转换（示例实现）
   */
  private convertToYaml(obj: any, indent = 0): string {
    let yaml = '';
    const spaces = ' '.repeat(indent);
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        yaml += `${spaces}${key}:\n${this.convertToYaml(value, indent + 2)}`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }
    
    return yaml;
  }

  /**
   * 简单YAML解析（示例实现）
   */
  private parseYaml(yaml: string): Record<string, any> {
    // 简化实现，实际项目应使用yaml库
    const lines = yaml.split('\n');
    const result: Record<string, any> = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, value] = trimmed.split(':').map(s => s.trim());
        if (key && value !== undefined) {
          result[key] = this.parseYamlValue(value);
        }
      }
    }
    
    return result;
  }

  private parseYamlValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (!isNaN(Number(value))) return Number(value);
    return value;
  }
}

/**
 * 配置元数据接口
 */
export interface ConfigMetadata {
  key: string;
  description: string;
  defaultValue: any;
  currentValue: any;
  lastModified: number;
  hasValidator: boolean;
}