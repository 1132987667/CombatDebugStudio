import { IBuffScript } from '@/types/buff';
import { Logger } from '@/utils/logger'; 

type ScriptFactory<TParams = any> = () => IBuffScript<TParams>; 

interface RegistryEntry<TParams = any> { 
  factory: ScriptFactory<TParams>; 
  metadata: { 
    scriptId: string; 
    filePath: string; 
    loadTime: number; 
    version?: string; 
  }; 
} 

export class BuffScriptRegistry { 
  private static instance: BuffScriptRegistry;
  private registry = new Map<string, RegistryEntry>();
  private readonly logger = new Logger({ prefix: 'BuffScriptRegistry' });

  private constructor() {} 

  public static getInstance(): BuffScriptRegistry { 
    if (!BuffScriptRegistry.instance) { 
      BuffScriptRegistry.instance = new BuffScriptRegistry(); 
    } 
    return BuffScriptRegistry.instance; 
  } 

  // 手动注册（推荐方式） 
  public register<TParams = any>(scriptId: string, factory: ScriptFactory<TParams>, metadata?: Partial<RegistryEntry['metadata']>): void { 
    if (this.registry.has(scriptId)) { 
      this.logger.warn(`Script "${scriptId}" already registered, overwriting`); 
    } 

    this.registry.set(scriptId, { 
      factory, 
      metadata: { 
        scriptId, 
        filePath: metadata?.filePath ?? 'unknown', 
        loadTime: Date.now(), 
        version: metadata?.version 
      } 
    }); 

    this.logger.info(`Registered buff script: ${scriptId}`); 
  } 

  // 安全获取（带类型推断） 
  public get<TParams = any>(scriptId: string): IBuffScript<TParams> | null { 
    const entry = this.registry.get(scriptId); 
    if (!entry) { 
      this.logger.error(`Buff script not found: ${scriptId}`); 
      return null; 
    } 

    try { 
      return entry.factory(); 
    } catch (e) { 
      this.logger.error(`Failed to instantiate script "${scriptId}":`, e); 
      return null; 
    } 
  } 

  // 批量注册（用于自动加载） 
  public batchRegister(entries: { scriptId: string; factory: ScriptFactory; filePath: string }[]): void { 
    entries.forEach(entry => { 
      this.register(entry.scriptId, entry.factory, { filePath: entry.filePath }); 
    }); 
  } 

  public has(scriptId: string): boolean { 
    return this.registry.has(scriptId); 
  } 

  public list(): string[] { 
    return Array.from(this.registry.keys()); 
  } 

  // 热重载支持：卸载旧版本 
  public unregister(scriptId: string): boolean { 
    return this.registry.delete(scriptId); 
  } 
}