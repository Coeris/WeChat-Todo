/**
 * 日历数据 LRU 缓存管理器
 * 按月缓存周数据的「结构部分」（日期、月份标签），不缓存动态属性（任务、选中）
 * 这样缓存永不失效，动态属性由调用方实时计算
 */
class CalendarDataCache {
  /**
   * @param {number} maxMonths 最大缓存月数，默认36个月
   */
  constructor(maxMonths = 36) {
    this.cache = new Map()      // key: "year-month" → value: weeks[]（结构数据）
    this.accessOrder = []        // LRU 访问顺序
    this.maxMonths = maxMonths
  }

  /**
   * 获取指定月份的周结构数据
   * @param {number} year
   * @param {number} month
   * @returns {Array|null}
   */
  get(year, month) {
    const key = this._key(year, month)
    const data = this.cache.get(key)
    if (data !== undefined) {
      this._touch(key)
      return data
    }
    return null
  }

  /**
   * 缓存指定月份的周结构数据
   * @param {number} year
   * @param {number} month
   * @param {Array} weeks
   */
  set(year, month, weeks) {
    const key = this._key(year, month)
    // 缓存满时淘汰最久未访问的
    if (!this.cache.has(key) && this.cache.size >= this.maxMonths) {
      this._evict()
    }
    this.cache.set(key, weeks)
    this._touch(key)
  }

  /**
   * 是否已缓存
   */
  has(year, month) {
    return this.cache.has(this._key(year, month))
  }

  /**
   * 删除指定月份缓存
   */
  delete(year, month) {
    const key = this._key(year, month)
    this.cache.delete(key)
    const idx = this.accessOrder.indexOf(key)
    if (idx !== -1) this.accessOrder.splice(idx, 1)
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear()
    this.accessOrder = []
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      size: this.cache.size,
      maxMonths: this.maxMonths,
      usage: `${(this.cache.size / this.maxMonths * 100).toFixed(1)}%`
    }
  }

  // ========== 内部方法 ==========

  _key(year, month) {
    return `${year}-${month}`
  }

  /** 更新访问顺序（移到队尾 = 最近使用） */
  _touch(key) {
    const idx = this.accessOrder.indexOf(key)
    if (idx !== -1) this.accessOrder.splice(idx, 1)
    this.accessOrder.push(key)
  }

  /** 淘汰最久未访问的缓存项 */
  _evict() {
    if (this.accessOrder.length === 0) return
    const oldest = this.accessOrder.shift()
    this.cache.delete(oldest)
  }
}

module.exports = CalendarDataCache
