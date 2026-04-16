/**
 * 主题管理器
 * 管理深色/浅色模式的切换和全局应用
 */

const StorageManager = require('./storage-manager')

class ThemeManager {
  constructor() {
    this._darkMode = false
    this._listeners = []
  }

  /**
   * 初始化主题
   */
  init() {
    this._darkMode = this._getStoredDarkMode()
    this.apply()
    return this
  }

  /**
   * 从存储读取深色模式设置
   */
  _getStoredDarkMode() {
    const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
    return !!settings.darkMode
  }

  /**
   * 获取当前深色模式状态
   */
  isDarkMode() {
    return this._darkMode
  }

  /**
   * 设置深色模式
   */
  setDarkMode(enabled) {
    this._darkMode = !!enabled
    const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
    settings.darkMode = this._darkMode
    StorageManager.set(StorageManager.KEYS.SETTINGS, settings)
    this.apply()
    this._listeners.forEach(fn => {
      try { fn(this._darkMode) } catch (e) { /* ignore */ }
    })
    return this._darkMode
  }

  /**
   * 切换深色模式
   */
  toggle() {
    return this.setDarkMode(!this._darkMode)
  }

  /**
   * 应用主题到全局（导航栏、TabBar）
   */
  apply() {
    if (this._darkMode) {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: '#191919',
        animation: { duration: 200, timingFunc: 'easeIn' }
      }).catch(() => {})
      wx.setTabBarStyle({
        color: '#888888',
        selectedColor: '#07C160',
        backgroundColor: '#191919',
        borderStyle: 'white'
      }).catch(() => {})
    } else {
      wx.setNavigationBarColor({
        frontColor: '#000000',
        backgroundColor: '#ffffff',
        animation: { duration: 200, timingFunc: 'easeIn' }
      }).catch(() => {})
      wx.setTabBarStyle({
        color: '#999999',
        selectedColor: '#1296db',
        backgroundColor: '#ffffff',
        borderStyle: 'black'
      }).catch(() => {})
    }
  }

  /**
   * 应用主题到页面实例
   * 在页面的 onLoad / onShow 中调用
   */
  applyToPage(page) {
    if (page && page.setData) {
      page.setData({ darkMode: this._darkMode })
    }
  }

  /**
   * 注册主题变化监听器
   * @param {Function} callback 回调函数，接收 darkMode 参数
   * @returns {Function} 取消监听的函数
   */
  onThemeChange(callback) {
    if (typeof callback !== 'function') return () => {}
    this._listeners.push(callback)
    return () => {
      this._listeners = this._listeners.filter(fn => fn !== callback)
    }
  }
}

module.exports = new ThemeManager()
