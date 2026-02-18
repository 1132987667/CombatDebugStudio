/**
 * 类型安全的 localStorage 封装工具
 * 提供类型安全的 get/set 方法，支持类型推断和错误处理
 */

export class LocalStorage {
  /**
   * 存储数据到 localStorage
   * @param key 存储键名
   * @param value 存储值（支持任何可序列化的类型）
   * @returns 是否存储成功
   */
  static set<T>(key: string, value: T): boolean {
    try {
      const serializedValue = JSON.stringify(value);
      localStorage.setItem(key, serializedValue);
      return true;
    } catch (error) {
      console.error(`Error storing data to localStorage for key "${key}":`, error);
      return false;
    }
  }

  /**
   * 从 localStorage 获取数据
   * @param key 存储键名
   * @param defaultValue 默认值（当数据不存在或解析失败时返回）
   * @returns 存储的值或默认值
   */
  static get<T>(key: string, defaultValue: T): T;
  
  /**
   * 从 localStorage 获取数据（无默认值版本）
   * @param key 存储键名
   * @returns 存储的值或 null
   */
  static get<T>(key: string): T | null;
  
  /**
   * 从 localStorage 获取数据的实现
   */
  static get<T>(key: string, defaultValue?: T): T | null {
    try {
      const serializedValue = localStorage.getItem(key);
      
      if (serializedValue === null) {
        return defaultValue !== undefined ? defaultValue : null;
      }
      
      const parsedValue = JSON.parse(serializedValue);
      return parsedValue as T;
    } catch (error) {
      console.error(`Error retrieving data from localStorage for key "${key}":`, error);
      return defaultValue !== undefined ? defaultValue : null;
    }
  }

  /**
   * 从 localStorage 删除数据
   * @param key 存储键名
   * @returns 是否删除成功
   */
  static remove(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing data from localStorage for key "${key}":`, error);
      return false;
    }
  }

  /**
   * 清空 localStorage 中的所有数据
   * @returns 是否清空成功
   */
  static clear(): boolean {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }

  /**
   * 检查 localStorage 是否包含指定键名的数据
   * @param key 存储键名
   * @returns 是否包含该键名
   */
  static has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }

  /**
   * 获取 localStorage 中所有键名的数组
   * @returns 键名数组
   */
  static keys(): string[] {
    return Object.keys(localStorage);
  }

  /**
   * 获取 localStorage 中存储的数据项数量
   * @returns 数据项数量
   */
  static length(): number {
    return localStorage.length;
  }
}
