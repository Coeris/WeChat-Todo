const StorageManager = require('../../utils/storage-manager')

Page({
  // 图标与标题的统一来源（与 calculator 页面 MODULE_META 一致）
  MODULE_META: {
    statistics: { icon: '📊', title: '统计计算' },
    basic: { icon: '🔢', title: '基础计算器' },
    percentage: { icon: '💯', title: '百分比计算' },
    price: { icon: '🥬', title: '单价换算' },
    stock: { icon: '📈', title: '股市计算' }
  },

  data: {
    darkMode: false,
    calculatorModules: [],
    thousandsSeparator: true
  },

  // 默认模块配置
  DEFAULT_MODULES: [
    { id: 'basic', name: '基础计算器', icon: '🔢', enabled: true, order: 0 },
    { id: 'price', name: '单价换算', icon: '🥬', enabled: true, order: 1 },
    { id: 'percentage', name: '百分比计算器', icon: '💯', enabled: true, order: 2 },
    { id: 'stock', name: '股市计算器', icon: '📈', enabled: true, order: 3 },
    { id: 'statistics', name: '统计计算器', icon: '📊', enabled: true, order: 4 }
  ],

  onLoad() {
    const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
    this.setData({ darkMode: !!settings.darkMode })
    this.loadCalculatorModules()
    this.loadGlobalSettings()
  },

  onShow() {
    const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
    this.setData({ darkMode: !!settings.darkMode })
  },

  loadCalculatorModules() {
    try {
      const saved = StorageManager.get('calculator_modules')
      let modules
      if (saved && Array.isArray(saved) && saved.length > 0) {
        modules = saved
      } else {
        modules = JSON.parse(JSON.stringify(this.DEFAULT_MODULES))
      }
      // 统一图标和标题，确保与 MODULE_META 一致
      const calcSettings = StorageManager.get('calc_settings', {})
      modules = modules.map(m => ({
        ...m,
        icon: this.MODULE_META[m.id] ? this.MODULE_META[m.id].icon : m.icon,
        name: this.MODULE_META[m.id] ? this.MODULE_META[m.id].title : m.name,
        defaultCollapsed: !!(calcSettings.defaultCollapsed && calcSettings.defaultCollapsed[m.id]),
        percentColorMode: m.id === 'percentage' ? (calcSettings.percentColorMode || 'red-up') : ''
      }))
      this.setData({ calculatorModules: modules })
    } catch (error) {
      console.error('加载计算器模块配置失败:', error)
      this.setData({ calculatorModules: JSON.parse(JSON.stringify(this.DEFAULT_MODULES)) })
    }
  },

  loadGlobalSettings() {
    try {
      const settings = StorageManager.get('calc_settings', {})
      this.setData({
        thousandsSeparator: settings.thousandsSeparator !== false   // 默认开启
      })
    } catch (e) { /* ignore */ }
  },

  saveCalculatorModules(modules) {
    try {
      const list = modules || this.data.calculatorModules
      const toSave = list.map(m => ({
        id: m.id,
        name: m.name,
        icon: m.icon,
        enabled: m.enabled,
        order: m.order
      }))
      StorageManager.set('calculator_modules', toSave)
    } catch (error) {
      console.error('保存计算器模块配置失败:', error)
    }
  },

  /** 切换模块开关 */
  toggleModule(e) {
    const { index } = e.currentTarget.dataset
    const item = this.data.calculatorModules[index]
    const newVal = !item.enabled
    const update = {}
    update['calculatorModules[' + index + '].enabled'] = newVal
    this.setData(update)
    this.saveCalculatorModules()
    wx.showToast({
      title: newVal ? '已开启' : '已关闭',
      icon: 'success'
    })
  },

  /** 展开/收起模块设置面板 */
  toggleExpand(e) {
    const { index } = e.currentTarget.dataset
    const newVal = !this.data.calculatorModules[index].expanded
    const update = {}
    update['calculatorModules[' + index + '].expanded'] = newVal
    this.setData(update)
  },

  /** 上移模块 */
  moveUp(e) {
    const { index } = e.currentTarget.dataset
    if (index <= 0) return
    const a = index - 1
    const b = index
    const modules = this.data.calculatorModules
    const tmp = modules[a]
    const itemA = Object.assign({}, modules[b], { order: a })
    const itemB = Object.assign({}, tmp, { order: b })
    const update = {}
    update['calculatorModules[' + a + ']'] = itemA
    update['calculatorModules[' + b + ']'] = itemB
    this.setData(update)
    this.saveCalculatorModules()
  },

  /** 下移模块 */
  moveDown(e) {
    const { index } = e.currentTarget.dataset
    if (index >= this.data.calculatorModules.length - 1) return
    const a = index
    const b = index + 1
    const modules = this.data.calculatorModules
    const tmp = modules[a]
    const itemA = Object.assign({}, modules[b], { order: a })
    const itemB = Object.assign({}, tmp, { order: b })
    const update = {}
    update['calculatorModules[' + a + ']'] = itemA
    update['calculatorModules[' + b + ']'] = itemB
    this.setData(update)
    this.saveCalculatorModules()
  },

  /** 切换默认折叠 */
  toggleCollapse(e) {
    const { index } = e.currentTarget.dataset
    const item = this.data.calculatorModules[index]
    const newVal = !item.defaultCollapsed
    const update = {}
    update['calculatorModules[' + index + '].defaultCollapsed'] = newVal
    this.setData(update)

    try {
      const settings = StorageManager.get('calc_settings', {})
      if (!settings.defaultCollapsed) settings.defaultCollapsed = {}
      settings.defaultCollapsed[item.id] = newVal
      StorageManager.set('calc_settings', settings)
    } catch (e) { /* ignore */ }

    wx.showToast({
      title: newVal ? '默认收起' : '默认展开',
      icon: 'success'
    })
  },

  /** 切换百分比涨跌颜色 */
  onPercentColorModeChange(e) {
    const mode = e.currentTarget.dataset.mode
    const idx = this.data.calculatorModules.findIndex(m => m.id === 'percentage')
    if (idx === -1 || mode === this.data.calculatorModules[idx].percentColorMode) return

    const update = {}
    update['calculatorModules[' + idx + '].percentColorMode'] = mode
    this.setData(update)

    try {
      const settings = StorageManager.get('calc_settings', {})
      settings.percentColorMode = mode
      StorageManager.set('calc_settings', settings)
    } catch (e) { /* ignore */ }
  },

  /** 切换千分位显示 */
  toggleThousandsSeparator() {
    const newVal = !this.data.thousandsSeparator
    this.setData({ thousandsSeparator: newVal })
    try {
      const settings = StorageManager.get('calc_settings', {})
      settings.thousandsSeparator = newVal
      StorageManager.set('calc_settings', settings)
    } catch (e) { /* ignore */ }
    wx.showToast({
      title: newVal ? '已开启千分位' : '已关闭千分位',
      icon: 'success'
    })
  },

  /** 恢复默认配置 */
  resetToDefault() {
    wx.showModal({
      title: '恢复默认',
      content: '确定要将所有模块恢复为默认状态吗？',
      success: (res) => {
        if (res.confirm) {
          const defaults = JSON.parse(JSON.stringify(this.DEFAULT_MODULES))
          defaults.forEach(m => {
            if (this.MODULE_META[m.id]) {
              m.icon = this.MODULE_META[m.id].icon
              m.name = this.MODULE_META[m.id].title
            }
            m.defaultCollapsed = false
            m.percentColorMode = m.id === 'percentage' ? 'red-up' : ''
          })
          try {
            StorageManager.set('calc_settings', { percentColorMode: 'red-up', defaultCollapsed: {}, thousandsSeparator: true })
          } catch (e) { /* ignore */ }

          this.setData({
            calculatorModules: defaults,
            thousandsSeparator: true
          })
          this.saveCalculatorModules()
          wx.showToast({ title: '已恢复默认', icon: 'success' })
        }
      }
    })
  }

})
