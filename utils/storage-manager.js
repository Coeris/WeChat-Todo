/**
 * 统一的存储管理器
 * 封装所有本地存储操作，提高代码复用性和可维护性
 */

class StorageManager {
  /**
   * 存储键常量
   */
  static KEYS = {
    TASKS: 'tasks',
    ATTACHMENTS: 'attachments',
    CALENDAR_EVENTS: 'calendarEvents',
    NOTIFICATIONS: 'notifications',
    SETTINGS: 'settings',
    USER_INFO: 'userInfo',
    WEBDAV_CONFIG: 'webdav_config',
    SYNC_STATUS: 'sync_status',
    TASKS_BACKUP: 'tasks_backup'
  };

  // 缓存 keys 列表，避免频繁调用 getStorageInfoSync
  static _cachedKeys = null;
  static _keysCacheTime = 0;
  static _CACHE_TTL = 2000; // 2秒缓存有效期

  /**
   * 获取存储中的 keys 列表（带缓存）
   * @returns {string[]}
   */
  static _getStorageKeys() {
    const now = Date.now();
    if (this._cachedKeys && (now - this._keysCacheTime) < this._CACHE_TTL) {
      return this._cachedKeys;
    }
    try {
      const info = wx.getStorageInfoSync();
      this._cachedKeys = info.keys || [];
      this._keysCacheTime = now;
      return this._cachedKeys;
    } catch (error) {
      return this._cachedKeys || [];
    }
  }

  /**
   * 使 keys 缓存失效（在 set/remove/clear 后调用）
   */
  static _invalidateKeysCache() {
    this._cachedKeys = null;
    this._keysCacheTime = 0;
  }

  /**
   * 获取数据
   * @param {string} key 存储键
   * @param {any} defaultValue 默认值
   * @returns {any} 存储的数据
   */
  static get(key, defaultValue = null) {
    try {
      const value = wx.getStorageSync(key);
      // wx.getStorageSync 对不存在的 key 返回空字符串 ''
      // 通过检查 keys 列表来区分 key 不存在 vs key 存在但值为空字符串
      const keyExists = this._getStorageKeys().includes(key);
      return keyExists ? value : defaultValue;
    } catch (error) {
      console.error(`获取存储失败 [${key}]:`, error);
      return defaultValue;
    }
  }

  /**
   * 设置数据
   * @param {string} key 存储键
   * @param {any} value 要存储的值
   * @returns {boolean} 是否成功
   */
  static set(key, value) {
    try {
      wx.setStorageSync(key, value);
      this._invalidateKeysCache();
      return true;
    } catch (error) {
      console.error(`设置存储失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 检查 key 是否存在于本地存储中
   * @param {string} key 存储键
   * @returns {boolean}
   */
  static has(key) {
    try {
      return this._getStorageKeys().includes(key);
    } catch (error) {
      return false;
    }
  }

  /**
   * 删除数据
   * @param {string} key 存储键
   * @returns {boolean} 是否成功
   */
  static remove(key) {
    try {
      wx.removeStorageSync(key);
      this._invalidateKeysCache();
      return true;
    } catch (error) {
      console.error(`删除存储失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 清空所有数据
   * @returns {boolean} 是否成功
   */
  static clear() {
    try {
      wx.clearStorageSync();
      this._invalidateKeysCache();
      return true;
    } catch (error) {
      console.error('清空存储失败:', error);
      return false;
    }
  }

  /**
   * 获取存储信息
   * @returns {Object|null} 存储信息
   */
  static getInfo() {
    try {
      return wx.getStorageInfoSync();
    } catch (error) {
      console.error('获取存储信息失败:', error);
      return null;
    }
  }

  /**
   * 初始化默认数据
   * @param {Object} defaults 默认值对象
   */
  static initDefaults(defaults) {
    Object.keys(defaults).forEach(key => {
      if (this.get(key) === null) {
        this.set(key, defaults[key]);
      }
    });
  }

  /**
   * 获取存储使用情况
   * @returns {Object} 使用情况信息
   */
  static getUsage() {
    const info = this.getInfo();
    if (!info) return null;

    return {
      used: info.currentSize,
      limit: info.limitSize,
      percentage: ((info.currentSize / info.limitSize) * 100).toFixed(2)
    };
  }

}

module.exports = StorageManager;