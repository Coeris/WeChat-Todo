// pages/calculator/index.js
const ThemeManager = require('../../utils/theme')
const StorageManager = require('../../utils/storage-manager')

// 模块元信息
const MODULE_META = {
  statistics: { icon: '📊', title: '统计计算' },
  basic: { icon: '🔢', title: '基础计算器' },
  percentage: { icon: '💯', title: '百分比计算' },
  price: { icon: '🥬', title: '单价换算' },
  stock: { icon: '📈', title: '股市计算' }
}

// 默认模块列表
const DEFAULT_MODULES = [
  { id: 'basic', name: '基础计算器', icon: '🔢', enabled: true, order: 0 },
  { id: 'price', name: '看懂单价', icon: '🥬', enabled: true, order: 1 },
  { id: 'percentage', name: '百分比计算器', icon: '💯', enabled: true, order: 2 },
  { id: 'stock', name: '股市计算器', icon: '📈', enabled: true, order: 3 },
  { id: 'statistics', name: '统计计算器', icon: '📊', enabled: true, order: 4 }
]

// 单价换算 - 分类配置
// rate 含义：1个基准单位 = rate 个该单位（如重量基准千克：1kg = 1000g → rate=1000）
// 单价换算：pricePerUnit = pricePerBase / rate
// 数量换算：qtyInBase = qty / rate
const PRICE_CATEGORIES = {
  weight: {
    label: '千克',
    quantityUnits: [
      // 快捷按钮（前2个）
      { name: '克', rate: 1000 },
      { name: '千克', rate: 1 },
      // picker 更多单位（分组）
      { name: '吨', rate: 0.001, group: '公制' },
      { name: '毫克', rate: 1000000, group: '公制' },
      { name: '微克', rate: 1000000000, group: '公制' },
      { name: '公担', rate: 0.01, group: '公制' },
      { name: '公两', rate: 10, group: '公制' },
      { name: '两', rate: 20, group: '市制' },
      { name: '斤', rate: 2, group: '市制' },
      { name: '钱', rate: 200, group: '市制' },
      { name: '克拉', rate: 5000, group: '金衡制' },
      { name: '盎司(金)', rate: 32.1507, group: '金衡制' },
      { name: '盎司(常衡)', rate: 35.274, group: '英美制' },
      { name: '磅', rate: 2.20462, group: '英美制' },
      { name: '英石', rate: 0.157473, group: '英美制' },
      { name: '英担', rate: 0.019684, group: '英美制' },
      { name: '长吨(英吨)', rate: 0.0009842, group: '英美制' },
      { name: '短吨(美吨)', rate: 0.0011023, group: '英美制' }
    ],
    priceUnits: [
      { key: 'u0', label: '元/克', sub: '1g', rate: 1000 },
      { key: 'u1', label: '元/千克', sub: '1000g', rate: 1 },
      { key: 'u2', label: '元/吨', sub: '1000kg', rate: 0.001 },
      { key: 'u3', label: '元/两', sub: '50g', rate: 20 },
      { key: 'u4', label: '元/斤', sub: '500g', rate: 2 },
      { key: 'u5', label: '元/盎司', sub: '(金) ≈31.1g', rate: 32.1507 },
      { key: 'u6', label: '元/克拉', sub: '0.2g', rate: 5000 },
      { key: 'u7', label: '元/盎司', sub: '28.35g', rate: 35.274 },
      { key: 'u8', label: '元/磅', sub: '≈453.6g', rate: 2.20462 }
    ]
  },
  length: {
    label: '米',
    quantityUnits: [
      { name: '厘米', rate: 100 },
      { name: '米', rate: 1 },
      { name: '千米', rate: 0.001, group: '公制' },
      { name: '毫米', rate: 1000, group: '公制' },
      { name: '微米', rate: 1000000, group: '公制' },
      { name: '寸', rate: 30, group: '市制' },
      { name: '尺', rate: 3, group: '市制' },
      { name: '丈', rate: 0.3, group: '市制' },
      { name: '里', rate: 0.002, group: '市制' },
      { name: '英寸', rate: 39.3701, group: '英美制' },
      { name: '英尺', rate: 3.2808, group: '英美制' },
      { name: '码', rate: 1.09361, group: '英美制' },
      { name: '英里', rate: 0.0006214, group: '英美制' },
      { name: '海里', rate: 0.00053996, group: '英美制' },
      { name: '光年', rate: 1.057e-16, group: '天文单位' },
      { name: '天文单位', rate: 6.6846e-12, group: '天文单位' }
    ],
    priceUnits: [
      { key: 'u0', label: '元/厘米', sub: '1cm', rate: 100 },
      { key: 'u1', label: '元/米', sub: '100cm', rate: 1 },
      { key: 'u2', label: '元/千米', sub: '1000m', rate: 0.001 },
      { key: 'u3', label: '元/寸', sub: '≈3.3cm', rate: 30 },
      { key: 'u4', label: '元/尺', sub: '≈33.3cm', rate: 3 },
      { key: 'u5', label: '元/里', sub: '500m', rate: 0.002 },
      { key: 'u6', label: '元/英寸', sub: '2.54cm', rate: 39.3701 },
      { key: 'u7', label: '元/英尺', sub: '30.48cm', rate: 3.2808 },
      { key: 'u8', label: '元/英里', sub: '≈1609m', rate: 0.0006214 }
    ]
  },
  area: {
    label: '米²',
    quantityUnits: [
      { name: '厘米²', rate: 10000 },
      { name: '米²', rate: 1 },
      { name: '千米²', rate: 0.000001, group: '公制' },
      { name: '毫米²', rate: 1000000, group: '公制' },
      { name: '公顷', rate: 0.0001, group: '公制' },
      { name: '公亩', rate: 0.01, group: '公制' },
      { name: '亩', rate: 0.0015, group: '市制' },
      { name: '分', rate: 0.015, group: '市制' },
      { name: '厘', rate: 0.15, group: '市制' },
      { name: '平方丈', rate: 0.09, group: '市制' },
      { name: '平方尺', rate: 9, group: '市制' },
      { name: '英亩', rate: 0.0002471, group: '英美制' },
      { name: '英寸²', rate: 1550.0031, group: '英美制' },
      { name: '英尺²', rate: 10.7639, group: '英美制' },
      { name: '平方码', rate: 1.19599, group: '英美制' },
      { name: '英里²', rate: 0.0000003861, group: '英美制' }
    ],
    priceUnits: [
      { key: 'u0', label: '元/厘米²', sub: '1cm²', rate: 10000 },
      { key: 'u1', label: '元/米²', sub: '1万cm²', rate: 1 },
      { key: 'u2', label: '元/千米²', sub: '100万m²', rate: 0.000001 },
      { key: 'u3', label: '元/亩', sub: '≈667m²', rate: 0.0015 },
      { key: 'u4', label: '元/公顷', sub: '1万m²', rate: 0.0001 },
      { key: 'u5', label: '元/英亩', sub: '≈4047m²', rate: 0.0002471 },
      { key: 'u6', label: '元/英寸²', sub: '6.45cm²', rate: 1550.0031 },
      { key: 'u7', label: '元/英尺²', sub: '≈929cm²', rate: 10.7639 },
      { key: 'u8', label: '元/英里²', sub: '≈2.59km²', rate: 0.0000003861 }
    ]
  },
  volume: {
    label: '米³',
    quantityUnits: [
      // 快捷按钮（前2个）
      { name: '毫升', rate: 1000000 },
      { name: '升', rate: 1000 },
      // picker 更多单位（分组）
      { name: '厘米³', rate: 1000000, group: '公制' },
      { name: '米³', rate: 1, group: '公制' },
      { name: '微升', rate: 1000000000, group: '公制' },
      { name: '方', rate: 1, group: '市制' },
      { name: '斗', rate: 100, group: '市制' },
      { name: '英寸³', rate: 61023.7, group: '立方' },
      { name: '英尺³', rate: 35.315, group: '立方' },
      { name: '码³', rate: 1.30795, group: '立方' },
      { name: '盎司(液)', rate: 33814, group: '美制' },
      { name: '品脱(美)', rate: 2113.38, group: '美制' },
      { name: '加仑(美)', rate: 264.17, group: '美制' },
      { name: '桶(石油)', rate: 6.29, group: '美制' },
      { name: '杯(美)', rate: 4226.75, group: '美制' },
      { name: '夸脱(美)', rate: 1056.69, group: '美制' },
      { name: '茶匙', rate: 202884.1, group: '美制' },
      { name: '汤匙', rate: 67628, group: '美制' },
      { name: '加仑(英)', rate: 219.97, group: '英制' }
    ],
    priceUnits: [
      { key: 'u0', label: '元/毫升', sub: '1cm³', rate: 1000000 },
      { key: 'u1', label: '元/升', sub: '1000ml', rate: 1000 },
      { key: 'u2', label: '元/厘米³', sub: '=1ml', rate: 1000000 },
      { key: 'u3', label: '元/方', sub: '1m³', rate: 1 },
      { key: 'u4', label: '元/斗', sub: '10L', rate: 100 },
      { key: 'u5', label: '元/米³', sub: '1000L', rate: 1 },
      { key: 'u6', label: '元/英寸³', sub: '≈16.4ml', rate: 61023.7 },
      { key: 'u7', label: '元/英尺³', sub: '≈28.3L', rate: 35.315 },
      { key: 'u8', label: '元/桶', sub: '(石油) ≈159L', rate: 6.29 },
      { key: 'u9', label: '元/盎司', sub: '(液) ≈29ml', rate: 33814 },
      { key: 'u10', label: '元/品脱', sub: '≈473ml', rate: 2113.38 },
      { key: 'u11', label: '元/加仑', sub: '≈3.785L', rate: 264.17 }
    ]
  }
}

// 从 quantityUnits 构建分组数据（跳过没有 group 属性的快捷按钮）
function buildExtraUnitGroups(quantityUnits) {
  const groupMap = {}
  for (let i = 0; i < quantityUnits.length; i++) {
    const unit = quantityUnits[i]
    const g = unit.group || '其他'
    if (!unit.group) continue // 没有分组的是快捷按钮，跳过
    if (!groupMap[g]) groupMap[g] = []
    groupMap[g].push({ name: unit.name, rate: unit.rate, originalIndex: i })
  }
  return Object.keys(groupMap).map(label => ({ label, units: groupMap[label] }))
}

const PRICE_CATEGORY_LIST = [
  { key: 'weight', label: '重量' },
  { key: 'length', label: '长度' },
  { key: 'area', label: '面积' },
  { key: 'volume', label: '容量' }
]

Page({
  data: {
    darkMode: false,
    // 模块折叠状态
    collapsedModules: {},
    // 可见模块列表（已排序，由 buildModuleVisibility 生成）
    visibleModules: [],
    // 千分位显示开关
    thousandsSeparator: true,

    // 统计计算器数据
    numbers: [],
    numberRows: [],
    maxNumbers: 20,
    focusIndex: -1,
    focusSeq: 0,
    result: { sum: 0, average: 0, median: 0, max: 0, min: 0, product: 0, range: 0, variance: 0, stdDeviation: 0, growthRate: 0, count: 0, mode: '' },
    relationResult: {},
    ratioResult: {},
    sortedDisplay: '',

    // 基础计算器数据
    basicCalc: { display: '0', formula: '', reset: false, liveResult: '', displayText: '0' },

    // 百分比计算器数据
    percentCalc: {
      num1: '', num2: '', discount: '',
      result1: '', result2: '', result3: ''
    },
    percentFocus: false,
    percentNum2Focused: false,
    discountFocused: false,
    percentColorMode: 'red-up', // 'red-up' 增加红色减少绿色 | 'green-up' 增加绿色减少红色

    // 单价换算数据
    priceCategoryList: PRICE_CATEGORY_LIST,
    priceConvert: { category: 'weight', quantity: '', quantityUnit: 1, totalAmount: '', u0: '', u1: '', u2: '', u3: '', u4: '', u5: '', u6: '', u7: '', u8: '', u9: '', u10: '', u11: '', inputOrder: [] },
    priceQuantityUnits: PRICE_CATEGORIES.weight.quantityUnits,
    priceQuantityUnitGroups: buildExtraUnitGroups(PRICE_CATEGORIES.weight.quantityUnits),
    priceQuickUnitCount: PRICE_CATEGORIES.weight.quantityUnits.filter(u => !u.group).length,
    priceUnitCards: PRICE_CATEGORIES.weight.priceUnits,
    activePriceUnit: '',
    priceFocusIndex: -1,

    // 单价换算 - picker 弹窗
    showUnitPicker: false,
    pickerPopupHeight: 500,

    // 股市计算器数据
    stockCalc: { buyPrice: '', sellPrice: '', shares: '', totalBuyPrice: '', totalSellPrice: '', profit: '', profitPercent: '', isProfit: false },
    stockFocused: { buyPrice: false, sellPrice: false, shares: false, totalBuyPrice: false, totalSellPrice: false, profit: false, profitPercent: false },

  },

  onLoad() {
    ThemeManager.applyToPage(this)
    this.buildModuleVisibility()
    this.initNumberInputs()
    this._loadPercentSettings()
    this._loadDefaultCollapsed()
    this._loadThousandsSetting()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().update(2, this.data.darkMode)
    }
    ThemeManager.applyToPage(this)
    this.buildModuleVisibility()
    this._loadPercentSettings()
    this._loadThousandsSetting()
  },

  onUnload() {
  },

  // ==================== 模块可见性 ====================
  buildModuleVisibility() {
    try {
      const saved = StorageManager.get('calculator_modules')
      let modules = saved && Array.isArray(saved) && saved.length > 0
        ? saved
        : JSON.parse(JSON.stringify(DEFAULT_MODULES))

      // 补全新增但不在缓存中的模块（确保版本升级后新模块自动出现）
      const savedIds = new Set(modules.map(m => m.id))
      DEFAULT_MODULES.forEach(dm => {
        if (!savedIds.has(dm.id)) {
          modules.push({
            id: dm.id,
            name: MODULE_META[dm.id] ? MODULE_META[dm.id].title : dm.name,
            icon: MODULE_META[dm.id] ? MODULE_META[dm.id].icon : dm.icon,
            enabled: dm.enabled,
            order: dm.order
          })
        }
      })

      const visible = modules
        .filter(m => m.enabled && MODULE_META[m.id])
        .sort((a, b) => a.order - b.order)
        .map(m => ({ id: m.id, icon: MODULE_META[m.id].icon, title: MODULE_META[m.id].title }))

      this.setData({ visibleModules: visible })
    } catch (error) {
      console.error('加载计算器模块配置失败:', error)
      this.setData({
        visibleModules: DEFAULT_MODULES.map(m => ({
          id: m.id, icon: m.icon, title: m.name
        }))
      })
    }
  },

  // ==================== 统计计算器 ====================
  // 字母标签：A, B, C, ..., Z
  _getLabel(index) {
    if (index < 26) return String.fromCharCode(65 + index)
    return String.fromCharCode(65 + Math.floor(index / 26) - 1) + String.fromCharCode(65 + index % 26)
  },

  initNumberInputs() {
    const initNum = { label: 'A', value: '', index: 0 }
    this.setData({
      numbers: [initNum],
      numberRows: [[initNum]]
    })
  },

  addNumberInput() {
    const numbers = this.data.numbers
    if (numbers.length >= this.data.maxNumbers) {
      wx.showToast({ title: '最多添加' + this.data.maxNumbers + '个', icon: 'none' })
      return
    }
    const newLabel = this._getLabel(numbers.length)
    const newItem = { label: newLabel, value: '', index: numbers.length }
    numbers.push(newItem)
    this._updateNumberRows(numbers)
    this.setData({ numbers, focusIndex: newItem.index, focusSeq: this.data.focusSeq + 1 })
  },

  removeNumberInput(e) {
    const index = e.currentTarget.dataset.index
    const numbers = this.data.numbers
    if (numbers.length <= 1) return
    const newNumbers = numbers.filter((_, i) => i !== index).map((n, i) => ({
      ...n, index: i, label: this._getLabel(i)
    }))
    this._updateNumberRows(newNumbers)
    this.setData({ numbers: newNumbers })
    this.calculateResults(newNumbers)
  },

  // 更新行分组（仅在增删时调用，不在输入时调用）
  _updateNumberRows(numbers) {
    const rows = []
    for (let i = 0; i < numbers.length; i += 3) {
      rows.push(numbers.slice(i, i + 3))
    }
    this.setData({ numberRows: rows })
  },

  onInputChange(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    // 只更新当前输入框的值，不重建整个列表（避免节点重建导致失焦）
    this.setData({
      ['numbers[' + index + '].value']: value
    })
    // 延迟计算结果，避免频繁 setData
    clearTimeout(this._calcTimer)
    this._calcTimer = setTimeout(() => {
      this.calculateResults()
    }, 150)
  },

  // focusSeq 每次递增，确保 focus 属性 false→true 切换生效
  _focusTo(index) {
    this.setData({ focusIndex: index, focusSeq: this.data.focusSeq + 1 })
  },

  onInputConfirm(e) {
    const index = e.currentTarget.dataset.index
    if (index + 1 < this.data.numbers.length) {
      this._focusTo(index + 1)
    } else {
      this.addNumberInput()
    }
  },

  onCopyText(e) {
    const text = e.currentTarget.dataset.text
    if (!text && text !== 0) return
    wx.setClipboardData({
      data: String(text),
      success() {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  calculateResults(overrideNumbers) {
    const source = overrideNumbers || this.data.numbers
    const validNumbers = source
      .filter(n => n.value !== '' && !isNaN(parseFloat(n.value)))
      .map(n => parseFloat(n.value))

    if (validNumbers.length === 0) {
      this.setData({
        result: { sum: 0, average: 0, median: 0, max: 0, min: 0, product: 0, range: 0, variance: 0, stdDeviation: 0, growthRate: 0, count: 0, mode: '' },
        relationResult: {}, ratioResult: {}, sortedDisplay: ''
      })
      return
    }

    const sorted = [...validNumbers].sort((a, b) => a - b)
    const sum = validNumbers.reduce((a, b) => a + b, 0)
    const average = sum / validNumbers.length
    const max = sorted[sorted.length - 1]
    const min = sorted[0]
    const product = validNumbers.reduce((a, b) => a * b, 1)
    const range = max - min
    const variance = validNumbers.reduce((acc, num) => acc + Math.pow(num - average, 2), 0) / validNumbers.length
    const stdDeviation = Math.sqrt(variance)

    let median
    if (sorted.length % 2 === 0) {
      median = (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    } else {
      median = sorted[Math.floor(sorted.length / 2)]
    }

    const freq = {}
    let maxFreq = 0
    validNumbers.forEach(n => {
      const key = String(n)
      freq[key] = (freq[key] || 0) + 1
      if (freq[key] > maxFreq) maxFreq = freq[key]
    })
    let mode = ''
    if (maxFreq > 1) {
      mode = Object.keys(freq).filter(k => freq[k] === maxFreq).join(', ')
    }

    let growthRate = 0
    if (validNumbers.length >= 2) {
      if (sorted[0] === 0) {
        growthRate = sorted[sorted.length - 1] === 0 ? 0 : '∞'
      } else {
        growthRate = ((sorted[sorted.length - 1] - sorted[0]) / sorted[0] * 100).toFixed(2)
      }
    }
    const sortedDisplay = sorted.map(n => this.fmt(n)).join(', ')

    const update = {
      result: {
        sum: this.fmt(sum), average: this.fmt(average), median: this.fmt(median),
        max: this.fmt(max), min: this.fmt(min), product: this.fmt(product),
        range: this.fmt(range), variance: this.fmt(variance),
        stdDeviation: this.fmt(stdDeviation), growthRate,
        count: validNumbers.length, mode
      },
      sortedDisplay
    }

    if (validNumbers.length >= 2) {
      update.relationResult = this._buildRelations(validNumbers)
      update.ratioResult = this._buildRatios(validNumbers)
    } else {
      update.relationResult = {}
      update.ratioResult = {}
    }

    this.setData(update)
  },

  // 纯函数：计算数字关系，返回结果对象
  _buildRelations(nums) {
    const r = {}
    if (nums.length === 2) {
      const [a, b] = nums
      r.difference = this.fmt(a - b)
      r.absoluteDifference = this.fmt(Math.abs(a - b))
      r.quotient = b !== 0 ? this.fmt(a / b) : '∞'
      r.percentage = b !== 0 ? this.fmt((a / b) * 100) : '∞'
      r.percentageDiff = b !== 0 ? this.fmt(((a - b) / b) * 100) : '0'
      r.harmonicMean = (a + b) !== 0 ? this.fmt(2 * a * b / (a + b)) : '0'
    }
    return r
  },

  // 纯函数：计算比例分析，返回结果对象
  // 修复：处理负数、全零、浮点精度问题
  _buildRatios(nums) {
    const colors = ['#07c160', '#1989fa', '#ff976a', '#f56c6c', '#7232dd']

    // 【修复 #1】过滤掉零和负数，仅用正数参与比例计算（避免负宽度 / 除零）
    const positives = nums.filter(n => n > 0)

    // 无有效正数时返回空结构
    if (positives.length === 0) {
      const avgPct = nums.length > 0 ? Math.floor(100 / nums.length) + '%' : '0%'
      return {
        ratioString: nums.join(':'),
        simplifiedRatioText: nums.map(() => 0).join(':'),
        normalized: nums.map(() => 0),
        percentageText: Array(nums.length).fill('0.0%').join(', '),
        segmentColors: nums.map((_, i) => colors[i % colors.length]),
        segmentWidths: Array(nums.length).fill(avgPct)
      }
    }

    // GCD 计算（仅基于正数）
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b)
    let g = positives[0]
    for (let i = 1; i < positives.length; i++) g = gcd(g, positives[i])

    // 【修复 #2】g 为 0 的防御（理论上 positives 全 > 0 时 g >= 1）
    if (g === 0) g = 1

    const simplifiedPositives = positives.map(n => Math.round(n / g))
    const total = positives.reduce((a, b) => a + b, 0)

    // 【修复 #3】浮点精度修正：确保 normalized 总和严格等于 1（避免比例条总宽 ≠ 100%）
    const finalNormalized = positives.map(n => n / total)
    let finalSum = finalNormalized.reduce((a, b) => a + b, 0)
    if (finalSum > 0 && Math.abs(finalSum - 1) > 1e-10) {
      const diff = 1 - finalSum
      // 将误差补偿到最大段（视觉上最不易察觉）
      let maxIdx = 0
      for (let i = 1; i < finalNormalized.length; i++) {
        if (finalNormalized[i] > finalNormalized[maxIdx]) maxIdx = i
      }
      finalNormalized[maxIdx] = parseFloat((finalNormalized[maxIdx] + diff).toPrecision(12))
    }

    // 将修正后的 normalized 映射回原始数组长度（非正数位置为 0）
    let posIndex = 0
    const mappedNormalized = nums.map(n => {
      if (n > 0 && posIndex < finalNormalized.length) {
        return finalNormalized[posIndex++]
      }
      return 0
    })

    // 简化比例文本也做同样的映射
    posIndex = 0
    const mappedSimplified = nums.map(n => {
      if (n > 0 && posIndex < simplifiedPositives.length) {
        return simplifiedPositives[posIndex++]
      }
      return 0
    })

    return {
      ratioString: nums.join(':'),
      simplifiedRatioText: mappedSimplified.join(':'),
      normalized: mappedNormalized,
      percentageText: mappedNormalized.map(n => (n * 100).toFixed(1) + '%').join(', '),
      segmentColors: mappedNormalized.map((_, i) => colors[i % colors.length]),
      // 预计算整数百分比宽度字符串，避免模板中 item*100 的浮点精度问题
      // 使用"最大余数法"确保总和严格等于 100%
      segmentWidths: (function() {
        // 仅对正数位置计算宽度，非正数位为 '0%'
        const posVals = positives.map(n => n / total)
        const intPcts = posVals.map(p => Math.floor(p * 100))
        const remainders = posVals.map((p, i) => ({ r: p * 100 - Math.floor(p * 100), i }))
          .sort((a, b) => b.r - a.r)
        let deficit = 100 - intPcts.reduce((a, b) => a + b, 0)
        for (let j = 0; j < deficit && j < remainders.length; j++) {
          intPcts[remainders[j].i]++
        }
        // 映射回原始 nums 长度
        let pi = 0
        return nums.map((n) => {
          if (n > 0 && pi < intPcts.length) return intPcts[pi++] + '%'
          return '0%'
        })
      })()
    }
  },

  onClearAllTap() {
    const initNum = { label: 'A', value: '', index: 0 }
    this.setData({
      numbers: [initNum],
      numberRows: [[initNum]],
      result: { sum: 0, average: 0, median: 0, max: 0, min: 0, product: 0, range: 0, variance: 0, stdDeviation: 0, growthRate: 0, count: 0, mode: '' },
      relationResult: {},
      ratioResult: {},
      sortedDisplay: ''
    })
  },

  // ==================== 模块折叠 ====================
  onToggleModule(e) {
    const id = e.currentTarget.dataset.id
    const collapsed = { ...this.data.collapsedModules }
    collapsed[id] = !collapsed[id]
    this.setData({ collapsedModules: collapsed })
  },

  _loadDefaultCollapsed() {
    try {
      const settings = StorageManager.get('calc_settings', {})
      const defaultCollapsed = settings.defaultCollapsed || {}
      if (Object.keys(defaultCollapsed).length > 0) {
        this.setData({ collapsedModules: defaultCollapsed })
      }
    } catch (e) { /* ignore */ }
  },

  // ==================== 基础计算器 ====================
  onBasicCalcBtn(e) {
    const value = e.currentTarget.dataset.value
    const calc = { ...this.data.basicCalc }

    const OP_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' }
    const SYMBOL_OP = { '+': '+', '−': '-', '×': '*', '÷': '/' }
    const isOp = s => SYMBOL_OP[s] !== undefined
    const getParts = f => (f || '').split(/\s+/).filter(p => p)
    const setFormula = parts => { calc.formula = parts.join(' ') }

    // 更新公式中最后一个数字
    const updateLastNum = (numStr) => {
      const parts = getParts(calc.formula)
      if (parts.length > 0 && !isOp(parts[parts.length - 1])) {
        parts[parts.length - 1] = numStr
        setFormula(parts)
      } else {
        calc.formula = numStr
      }
    }

    // 根据公式字符串计算实时结果（支持运算符优先级）
    const computeLive = (formula) => {
      if (!formula) return ''
      let parts = getParts(formula)
      // 部分小数不计算（如 "0."）
      if (parts.length > 0) {
        const last = parts[parts.length - 1]
        if (!isOp(last) && (last.endsWith('.') || isNaN(parseFloat(last)))) return ''
      }
      // 去掉末尾运算符
      if (parts.length > 0 && isOp(parts[parts.length - 1])) {
        parts = parts.slice(0, -1)
      }
      if (parts.length === 0) return ''
      if (parts.length === 1) return this.formatCalcNum(parseFloat(parts[0]))
      const tokens = parts.map(p => isOp(p) ? SYMBOL_OP[p] : parseFloat(p))
      try {
        const result = this.evalExpression(tokens)
        if (!isFinite(result)) return '错误'
        return this.formatCalcNum(result)
      } catch (e) {
        return ''
      }
    }

    // 更新实时结果显示（仅更新 liveResult，不覆盖 display/reset）
    const updateLive = () => {
      if (calc.formula && !calc.formula.endsWith('=')) {
        const live = computeLive(calc.formula)
        if (live) {
          calc.liveResult = live
        }
      }
    }

    switch (value) {
      case 'C':
        calc.display = '0'
        calc.formula = ''
        calc.reset = false
        calc.liveResult = ''
        break

      case 'DEL':
        {
          // 判断当前是否显示实时结果（非用户正在编辑的数字）
          const parts = getParts(calc.formula)
          const showingLiveResult = calc.reset || (calc.liveResult && parts.length > 1 && calc.display === calc.liveResult)
          if (showingLiveResult) {
            // 删除公式末尾的 token（运算符或数字）
            if (parts.length > 0) {
              parts.pop()
              if (parts.length === 0) {
                calc.formula = ''
                calc.display = '0'
                calc.reset = false
                calc.liveResult = ''
              } else {
                setFormula(parts)
                calc.liveResult = computeLive(calc.formula)
                calc.display = calc.liveResult || '0'
                calc.reset = true
              }
            }
          } else {
            // 正在编辑当前数字，字符级删除
            if (calc.display.length > 1) {
              calc.display = calc.display.slice(0, -1)
            } else {
              calc.display = '0'
            }
            updateLastNum(calc.display)
            calc.liveResult = ''
            updateLive()
          }
        }
        break

      case '%':
        {
          const num = parseFloat(calc.display)
          if (isNaN(num)) break
          calc.display = this.formatCalcNum(num / 100)
          if (calc.formula && !calc.formula.endsWith('=')) {
            const parts = getParts(calc.formula)
            if (parts.length > 0 && !isOp(parts[parts.length - 1])) {
              updateLastNum(calc.display)
              updateLive()
            }
          }
        }
        break

      case '±':
        if (calc.display !== '0' && calc.display !== '错误') {
          calc.display = calc.display.startsWith('-') ? calc.display.slice(1) : '-' + calc.display
          if (calc.formula && !calc.formula.endsWith('=')) {
            const parts = getParts(calc.formula)
            if (parts.length > 0 && !isOp(parts[parts.length - 1])) {
              updateLastNum(calc.display)
              updateLive()
            }
          }
        }
        break

      case '.':
        if (calc.reset) {
          if (calc.formula.endsWith('=') || !calc.formula) {
            calc.formula = '0.'
            calc.display = '0.'
            calc.reset = false
            calc.liveResult = ''
          } else {
            const parts = getParts(calc.formula)
            const last = parts[parts.length - 1]
            if (isOp(last)) {
              parts.push('0.')
              setFormula(parts)
            } else {
              parts[parts.length - 1] = '0.'
              setFormula(parts)
            }
            calc.display = '0.'
            calc.reset = false
            calc.liveResult = ''
          }
        } else if (!calc.display.includes('.')) {
          calc.display += '.'
          updateLastNum(calc.display)
        }
        break

      case '=':
        if (calc.formula && !calc.formula.endsWith('=')) {
          const result = computeLive(calc.formula)
          if (result && result !== '错误') {
            calc.formula += ' ='
            calc.display = result
          }
        }
        calc.reset = true
        calc.liveResult = ''
        break

      case '+': case '-': case '*': case '/':
        {
          const opSym = OP_SYMBOL[value]
          if (calc.formula.endsWith('=')) {
            // 从 = 结果继续运算
            calc.formula = calc.display + ' ' + opSym
          } else if (!calc.formula) {
            calc.formula = calc.display + ' ' + opSym
          } else {
            const parts = getParts(calc.formula)
            const last = parts[parts.length - 1]
            if (isOp(last)) {
              // 替换末尾运算符
              parts[parts.length - 1] = opSym
              setFormula(parts)
            } else {
              // 追加运算符
              calc.formula += ' ' + opSym
            }
          }
          calc.liveResult = computeLive(calc.formula)
          calc.display = calc.liveResult || calc.display
          calc.reset = true
        }
        break

      default:
        // 数字输入
        if (calc.reset) {
          if (calc.formula.endsWith('=') || !calc.formula) {
            // 全新开始
            calc.formula = value
            calc.display = value
            calc.reset = false
            calc.liveResult = ''
          } else {
            const parts = getParts(calc.formula)
            const last = parts[parts.length - 1]
            if (isOp(last)) {
              // 运算符后追加新数字
              parts.push(value)
              setFormula(parts)
            } else {
              // 替换末尾数字
              parts[parts.length - 1] = value
              setFormula(parts)
            }
            calc.display = value
            calc.reset = false
            calc.liveResult = ''
          }
          // 运算符后开始输新数字时不计算 liveResult，让用户看到当前输入的数字
        } else if (calc.display === '0' && value === '0') {
          break
        } else if (calc.display === '0') {
          calc.display = value
          updateLastNum(calc.display)
        } else {
          if (calc.display.replace(/[^0-9]/g, '').length >= 15) break
          calc.display += value
          updateLastNum(calc.display)
        }
        // 输入数字后计算实时结果（仅非 reset 状态下，即追加数字时才更新）
        if (!calc.reset) updateLive()
        break
    }

    // 计算带千分位的显示文本（用于渲染，不参与运算）
    calc.displayText = calc.liveResult || calc.display
    if (calc.displayText !== '错误' && calc.displayText !== '∞' && calc.displayText) {
      calc.displayText = this._formatWithThousands(calc.displayText)
    }

    this.setData({ basicCalc: calc })
  },

  // 表达式求值（支持运算符优先级，使用调度场算法）
  evalExpression(tokens) {
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 }
    const output = []
    const ops = []
    for (const token of tokens) {
      if (typeof token === 'number') {
        output.push(token)
      } else if (precedence[token] !== undefined) {
        while (ops.length && precedence[ops[ops.length - 1]] >= precedence[token]) {
          output.push(ops.pop())
        }
        ops.push(token)
      }
    }
    while (ops.length) output.push(ops.pop())
    const stack = []
    for (const t of output) {
      if (typeof t === 'number') {
        stack.push(t)
      } else {
        const b = stack.pop()
        const a = stack.pop()
        switch (t) {
          case '+': stack.push(a + b); break
          case '-': stack.push(a - b); break
          case '*': stack.push(a * b); break
          case '/': stack.push(b !== 0 ? a / b : NaN); break
        }
      }
    }
    return stack[0] || 0
  },

  formatCalcNum(num) {
    if (isNaN(num) || !isFinite(num)) return '错误'
    if (num === 0) return '0'
    const absNum = Math.abs(num)
    // 大数用定点表示避免科学计数法（字母 e）
    if (absNum >= 1e12) return num.toFixed(0)
    if (absNum >= 1e9) return num.toFixed(2).replace(/\.?0+$/, '')
    if (absNum >= 1e6) return num.toFixed(4).replace(/\.?0+$/, '')
    let str = parseFloat(num.toPrecision(12)).toString()
    if (str.includes('e') || str.includes('E')) {
      // toPrecision 产生科学计数法时改用 toFixed
      str = parseFloat(num.toFixed(8)).toString()
      if (str.includes('e') || str.includes('E')) {
        str = absNum > 1000 ? num.toFixed(0) : num.toPrecision(8).replace(/e[+-]\d+/gi, '')
      }
    }
    if (str.length > 15) {
      const digits = Math.max(0, 14 - Math.floor(Math.log10(absNum)) - 1)
      str = num.toFixed(digits).replace(/\.?0+$/, '')
      if (str.length > 16) str = num.toExponential(6)
    }
    return str
  },

  // ==================== 百分比计算器 ====================
  _loadPercentSettings() {
    try {
      const settings = StorageManager.get('calc_settings', {})
      if (settings.percentColorMode) {
        this.setData({ percentColorMode: settings.percentColorMode })
      }
    } catch (e) { /* ignore */ }
  },

  _loadThousandsSetting() {
    try {
      const settings = StorageManager.get('calc_settings', {})
      this.setData({
        thousandsSeparator: settings.thousandsSeparator !== false
      })
    } catch (e) { /* ignore */ }
  },

  /** 给数字字符串添加千分位分隔符（仅整数部分） */
  _formatWithThousands(str) {
    if (!this.data.thousandsSeparator || !str) return str
    const parts = str.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
  },

  onPercentCalcInput(e) {
    const field = e.currentTarget.dataset.field
    const val = e.detail.value.replace(/[%折元\/股]/g, '')
    this.setData({ [`percentCalc.${field}`]: val })
    this._recalcPercent(field, { [field]: val })
  },

  onPercentDiscountInput(e) {
    const val = e.detail.value.replace(/[%折元\/股]/g, '')
    const discount = parseFloat(val) || 0
    const updates = { 'percentCalc.discount': val }
    // 构建 overrideVals，确保 _recalcPercent 能立即读到最新值
    const overrides = { discount: val }

    if (discount > 0) {
      const computedNum2 = String(parseFloat((100 - discount * 10).toFixed(2)))
      updates['percentCalc.num2'] = computedNum2
      overrides.num2 = computedNum2
    }

    this.setData(updates)
    this._recalcPercent('discount', overrides)
  },

  onPercentResultInput(e) {
    const field = e.currentTarget.dataset.field
    const val = e.detail.value
    this.setData({ [`percentCalc.${field}`]: val })
    this._recalcPercent(field, { [field]: val })
  },

  /** 结果字段的格式化：值为 0 时返回空，让 placeholder 生效 */
  fmtResult(num) {
    const str = this.fmt(num)
    const n = parseFloat(str)
    return (isNaN(n) || n === 0) ? '' : str
  },

  /**
   * 统一重算百分比所有字段
   * changedField: 刚被用户修改的字段名，跳过覆盖
   *
   * 核心公式：
   *   result1 = num1 × num2 / 100
   *   result2 = num1 × (1 + num2/100)
   *   result3 = num1 × (1 − num2/100)
   *   discount = (100 − num2) / 10
   *
   * 策略：无论编辑哪个字段，都尝试用已有值推导缺失的 num1/num2，再正向计算全部。
   */
  _recalcPercent(changedField, overrideVals) {
    // 合并最新输入值，解决 setData 异步导致 this.data 尚未更新的问题
    const pc = Object.assign({}, this.data.percentCalc, overrideVals || {})
    const updates = {}

    // 读取字段值（包括当前正在编辑的字段，用于参与计算）
    // 注意：fmt() 可能输出含千分位的字符串如 "1,234"，必须去掉逗号否则 parseFloat("1,234")=1
    const get = (key) => {
      const raw = String(pc[key] || '')
      const v = parseFloat(raw.replace(/,/g, ''))
      return isNaN(v) ? null : v
    }

    // 是否跳过该字段的更新（避免覆盖用户正在输入的值）
    const skip = (key) => key === changedField

    // changedField 是否为用户编辑中的"输入"字段（num1/百分比/折扣/结果）
    // 当用户编辑这些字段时，应允许重新推导 num1 或 num2，因为旧值可能不再匹配
    const isResultField = ['result1', 'result2', 'result3'].includes(changedField)
    const isNum1Field = changedField === 'num1'

    const setIfNew = (key, val) => {
      if (!skip(key) && val != null) updates['percentCalc.' + key] = String(val)
    }

    let num1 = get('num1')
    let num2 = get('num2')
    const result1 = get('result1')
    const result2 = get('result2')
    const result3 = get('result3')
    const discount = get('discount')

    // 记录 changedField 是否被清空（用于阻止不合理的正向计算）
    const changedCleared = get(changedField) === null

    // ========== 反向推导：用已有字段补齐 num1/num2 ==========

    // 1) 折扣 → num2
    if (discount != null && discount > 0 && (num2 == null || changedField === 'discount')) {
      num2 = parseFloat((100 - discount * 10).toFixed(2))
      setIfNew('num2', num2)
    }

    // 2) result1 + num1 → num2  或  result1 + num2 → num1
    if (result1 != null && result1 !== 0) {
      if (num1 != null && num1 !== 0 && (num2 == null || isResultField || isNum1Field)) {
        num2 = parseFloat((result1 * 100 / num1).toFixed(4))
        setIfNew('num2', num2)
      } else if (num2 != null && num2 !== 0 && (num1 == null || isResultField)) {
        num1 = parseFloat((result1 * 100 / num2).toFixed(4))
        setIfNew('num1', num1)
      }
    }

    // 3) result2 反推：
    //    result2 + num1 → num2     （增加后 = 原值 × (1+百分比/100)）
    //    result2 + num2 → num1     （原值 = 增加后 / (1+百分比/100)）
    if (result2 != null && result2 !== 0) {
      if (num1 != null && num1 !== 0 && (num2 == null || isResultField || isNum1Field)) {
        num2 = parseFloat(((result2 / num1 - 1) * 100).toFixed(4))
        setIfNew('num2', num2)
      } else if (num2 != null && num2 !== -100 && (num1 == null || isResultField)) {
        // num2 = -100 时除零，排除
        num1 = parseFloat((result2 / (1 + num2 / 100)).toFixed(4))
        setIfNew('num1', num1)
      }
    }

    // 4) result3 反推：
    //    result3 + num1 → num2     （减少后 = 原值 × (1-百分比/100)）
    //    result3 + num2 → num1     （原值 = 减少后 / (1-百分比/100)）
    if (result3 != null && result3 !== 0) {
      if (num1 != null && num1 !== 0 && (num2 == null || isResultField || isNum1Field)) {
        num2 = parseFloat(((1 - result3 / num1) * 100).toFixed(4))
        setIfNew('num2', num2)
      } else if (num2 != null && num2 !== 100 && (num1 == null || isResultField)) {
        // num2 = 100 时除零（减少100%=归零），排除
        num1 = parseFloat((result3 / (1 - num2 / 100)).toFixed(4))
        setIfNew('num1', num1)
      }
    }

    // 5) result2 + result3 联立求解（两个方程两个未知数）
    //    result2 = num1 × (1 + num2/100)
    //    result3 = num1 × (1 − num2/100)
    //    相加: result2+result3 = 2×num1  →  num1 = (result2+result3)/2
    //    相减: result2-result3 = 2×num1×num2/100  →  num2 = (result2-result3)/num1×50
    if (result2 != null && result3 != null && num1 == null && num2 == null) {
      const sum = result2 + result3
      const diff = result2 - result3
      if (sum !== 0) {
        num1 = parseFloat((sum / 2).toFixed(4))
        setIfNew('num1', num1)
      }
      if (num1 != null && num1 !== 0) {
        num2 = parseFloat((diff / num1 * 50).toFixed(4))
        setIfNew('num2', num2)
      }
    }

    // 6) 二次扫描：如果推导出了新值，再检查是否可以进一步补齐
    if (result1 != null && result1 !== 0) {
      if (num2 != null && num2 !== 0 && (num1 == null || isResultField)) {
        num1 = parseFloat((result1 * 100 / num2).toFixed(4))
        setIfNew('num1', num1)
      }
      if (num1 != null && num1 !== 0 && (num2 == null || isResultField || isNum1Field)) {
        num2 = parseFloat((result1 * 100 / num1).toFixed(4))
        setIfNew('num2', num2)
      }
    }

    // 7) 用新推导出的 result2/result3 补齐另一侧（如果有了一半数据）
    if (result2 != null && num2 != null && num2 !== -100 && (num1 == null || isResultField)) {
      num1 = parseFloat((result2 / (1 + num2 / 100)).toFixed(4))
      setIfNew('num1', num1)
    }
    if (result3 != null && num2 != null && num2 !== 100 && (num1 == null || isResultField)) {
      num1 = parseFloat((result3 / (1 - num2 / 100)).toFixed(4))
      setIfNew('num1', num1)
    }

    // ========== 正向计算 ==========

    // 如果 num1 或 num2 被用户清空，不应再用反向推导的值做正向计算，避免结果字段与清空状态不一致
    const canForwardCalc = num1 != null && num2 != null &&
      !(changedCleared && (changedField === 'num1' || changedField === 'num2'))

    if (canForwardCalc) {
      if (!skip('result1')) updates['percentCalc.result1'] = this.fmtResult(num1 * num2 / 100)
      if (!skip('result2')) updates['percentCalc.result2'] = this.fmtResult(num1 * (1 + num2 / 100))
      if (!skip('result3')) updates['percentCalc.result3'] = this.fmtResult(num1 * (1 - num2 / 100))
      // 同步折扣
      if (!skip('discount')) {
        const d = parseFloat((100 - num2) / 10)
        if (d > 0) updates['percentCalc.discount'] = String(d)
        else updates['percentCalc.discount'] = ''
      }
    }

    this.setData(updates)
  },

  onPercentNum1Confirm() {
    this.setData({ percentFocus: true })
  },

  onPercentNum2Confirm() {
    this.setData({ percentFocus: false })
  },

  onPercentNum2Focus() {
    this.setData({ percentNum2Focused: true })
  },

  onPercentNum2Blur() {
    this.setData({ percentNum2Focused: false })
  },

  onDiscountFocus() {
    this.setData({ discountFocused: true })
  },

  onDiscountBlur() {
    this.setData({ discountFocused: false })
  },

  onPercentCalcClear() {
    this.setData({
      percentCalc: {
        num1: '', num2: '', discount: '',
        result1: '', result2: '', result3: ''
      },
      percentFocus: false,
      percentNum2Focused: false,
      discountFocused: false
    })
  },

  // ==================== 单价换算 ====================

  onPriceCategoryTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.priceConvert.category) return

    const cat = PRICE_CATEGORIES[key]
    const pc = this.data.priceConvert
    const qty = parseFloat(String(pc.quantity).replace(/,/g, '')) || 0
    const total = parseFloat(String(pc.totalAmount).replace(/,/g, '')) || 0
    const updates = {
      'priceConvert.category': key,
      'priceConvert.quantityUnit': 1,
      priceQuantityUnits: cat.quantityUnits,
      priceQuantityUnitGroups: buildExtraUnitGroups(cat.quantityUnits),
      priceQuickUnitCount: cat.quantityUnits.filter(u => !u.group).length,
      priceUnitCards: cat.priceUnits,
      activePriceUnit: ''
    }
    cat.priceUnits.forEach(pu => { updates[`priceConvert.${pu.key}`] = '' })

    if (qty > 0 && total > 0) {
      const oldCat = PRICE_CATEGORIES[pc.category]
      const oldQtyRate = oldCat.quantityUnits[pc.quantityUnit].rate
      const basePrice = total / (qty / oldQtyRate)
      cat.priceUnits.forEach(pu => {
        updates[`priceConvert.${pu.key}`] = this.fmtUnit(basePrice / pu.rate)
      })
    } else {
      // 只有一方有值时，清除残留的数量/总价，防止旧值在新分类下产生错误计算
      updates['priceConvert.quantity'] = ''
      updates['priceConvert.totalAmount'] = ''
    }

    this.setData(updates)
  },

  onPriceConvertQuantityInput(e) {
    this.setData({ 'priceConvert.quantity': e.detail.value, activePriceUnit: 'quantity' })
    this._recalcFromQtyTotal({ quantity: e.detail.value, activePriceUnit: 'quantity' })
  },

  onPriceConvertTotalAmountInput(e) {
    this.setData({ 'priceConvert.totalAmount': e.detail.value, activePriceUnit: 'totalAmount' })
    this._recalcFromQtyTotal({ totalAmount: e.detail.value, activePriceUnit: 'totalAmount' })
  },

  // 数量/总价输入框失焦时格式化并清除活跃状态
  onPriceConvertQtyBlur() {
    const raw = this.data.priceConvert.quantity
    const updates = { activePriceUnit: '' }
    if (raw) {
      const num = parseFloat(String(raw).replace(/,/g, ''))
      if (!isNaN(num) && num > 0) {
        updates['priceConvert.quantity'] = this.fmtUnit(num)
      } else {
        updates['priceConvert.quantity'] = ''
      }
    }
    this.setData(updates)
    this._recalcFromQtyTotal()
  },

  onPriceConvertTotalBlur() {
    const raw = this.data.priceConvert.totalAmount
    const updates = { activePriceUnit: '' }
    if (raw) {
      const num = parseFloat(String(raw).replace(/,/g, ''))
      if (!isNaN(num) && num > 0) {
        updates['priceConvert.totalAmount'] = this.fmtUnit(num)
      } else {
        updates['priceConvert.totalAmount'] = ''
      }
    }
    this.setData(updates)
    this._recalcFromQtyTotal()
  },

  onPriceConvertUnitTap(e) {
    const idx = parseInt(e.currentTarget.dataset.index)
    this.setData({ 'priceConvert.quantityUnit': idx })
    this._recalcFromQtyTotal({ quantityUnit: idx })
  },

  onUnitPickerOpen() {
    const windowInfo = wx.getWindowInfo()
    this.setData({
      showUnitPicker: true,
      pickerPopupHeight: Math.round(windowInfo.windowHeight * 0.5)
    })
  },

  onUnitPickerClose() {
    this.setData({ showUnitPicker: false })
  },

  preventTouchMove() {},

  onExtraUnitSelect(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    this.setData({ 'priceConvert.quantityUnit': idx, showUnitPicker: false })
    this._recalcFromQtyTotal({ quantityUnit: idx })
  },

  // 单价输入框 - 编辑时标记活跃字段，跳过自身防止光标跳动
  onPriceConvertInput(e) {
    const unit = e.currentTarget.dataset.unit
    this.setData({
      [`priceConvert.${unit}`]: e.detail.value,
      activePriceUnit: unit
    })
    this._recalcFromPrice({ [unit]: e.detail.value, activePriceUnit: unit })
  },

  // 单价输入框失焦时格式化并重算所有卡片
  onPriceConvertBlur(e) {
    const unit = e.currentTarget.dataset.unit
    const raw = this.data.priceConvert[unit]
    const updates = { activePriceUnit: '' }
    if (raw) {
      const num = parseFloat(String(raw).replace(/,/g, ''))
      if (!isNaN(num) && num > 0) {
        updates[`priceConvert.${unit}`] = this.fmtUnit(num)
      } else {
        updates[`priceConvert.${unit}`] = ''
      }
    }
    this.setData(updates)
    // 失焦后重算所有卡片，确保一致性
    this._recalcFromPrice()
  },

  // --- 内部计算方法 ---

  // 获取基准单价（优先用活跃字段作为当前输入的基准，回退到其他非空字段）
  _getBasePrice(mergedPc) {
    const pc = mergedPc || this.data.priceConvert
    const cat = PRICE_CATEGORIES[pc.category]
    if (!cat) return 0
    const active = pc.activePriceUnit !== undefined ? pc.activePriceUnit : this.data.activePriceUnit
    // 优先用正在编辑的字段（用户当前输入的值是最新基准）
    if (active) {
      const pu = cat.priceUnits.find(p => p.key === active)
      if (pu) {
        const val = parseFloat(String(pc[active]).replace(/,/g, ''))
        if (val > 0) return val * pu.rate
      }
    }
    // 回退到非编辑中的字段
    for (const pu of cat.priceUnits) {
      const val = parseFloat(String(pc[pu.key]).replace(/,/g, ''))
      if (val > 0) return val * pu.rate
    }
    return 0
  },

  // 填充所有单价卡片（跳过活跃字段，使用 fmtUnit 保留足够精度避免重算误差）
  _fillPriceCards(basePrice, updates, mergedPc) {
    const pc = mergedPc || this.data.priceConvert
    const cat = PRICE_CATEGORIES[pc.category]
    const active = pc.activePriceUnit !== undefined ? pc.activePriceUnit : this.data.activePriceUnit
    cat.priceUnits.forEach(pu => {
      if (pu.key !== active) {
        updates[`priceConvert.${pu.key}`] = this.fmtUnit(basePrice / pu.rate)
      }
    })
  },

  // 数量/总价变化时重算
  _recalcFromQtyTotal(overrideVals) {
    const pc = Object.assign({}, this.data.priceConvert, overrideVals || {})
    const cat = PRICE_CATEGORIES[pc.category]
    if (!cat) return

    // 从合并后的数据中读取 activePriceUnit（overrideVals 可能包含最新值）
    const active = pc.activePriceUnit !== undefined ? pc.activePriceUnit : this.data.activePriceUnit
    const qtyRate = cat.quantityUnits[pc.quantityUnit].rate
    const qty = parseFloat(String(pc.quantity).replace(/,/g, '')) || 0
    const total = parseFloat(String(pc.totalAmount).replace(/,/g, '')) || 0
    const updates = {}

    if (qty > 0 && total > 0) {
      const basePrice = total / (qty / qtyRate)
      this._fillPriceCards(basePrice, updates, pc)
    } else if (qty > 0) {
      // 只有数量，看有没有单价可以推算总价（跳过正在编辑的总价字段）
      const basePrice = this._getBasePrice(pc)
      if (basePrice > 0 && active !== 'totalAmount') {
        updates['priceConvert.totalAmount'] = this.fmtUnit(basePrice * qty / qtyRate)
      }
    } else if (total > 0) {
      // 只有总价，看有没有单价可以推算数量（跳过正在编辑的数量字段）
      const basePrice = this._getBasePrice(pc)
      if (basePrice > 0 && active !== 'quantity') {
        updates['priceConvert.quantity'] = this.fmtUnit(total / basePrice * qtyRate)
      }
    }

    if (Object.keys(updates).length > 0) this.setData(updates)
  },

  // 单价卡片变化时重算
  _recalcFromPrice(overrideVals) {
    const pc = Object.assign({}, this.data.priceConvert, overrideVals || {})
    const cat = PRICE_CATEGORIES[pc.category]
    if (!cat) return

    const basePrice = this._getBasePrice(pc)
    if (basePrice <= 0) return

    // 从合并后的数据中读取 activePriceUnit
    const active = pc.activePriceUnit !== undefined ? pc.activePriceUnit : this.data.activePriceUnit
    const qtyRate = cat.quantityUnits[pc.quantityUnit].rate
    const qty = parseFloat(String(pc.quantity).replace(/,/g, '')) || 0
    const total = parseFloat(String(pc.totalAmount).replace(/,/g, '')) || 0
    const updates = {}

    // 更新其他单价卡片
    this._fillPriceCards(basePrice, updates, pc)

    // 有数量 → 算总价（跳过正在编辑的总价字段）
    if (qty > 0 && active !== 'totalAmount') {
      updates['priceConvert.totalAmount'] = this.fmtUnit(basePrice * qty / qtyRate)
    }
    // 有总价没数量 → 算数量（跳过正在编辑的数量字段）
    if (total > 0 && qty === 0 && active !== 'quantity') {
      updates['priceConvert.quantity'] = this.fmtUnit(total / basePrice * qtyRate)
    }

    if (Object.keys(updates).length > 0) this.setData(updates)
  },

  onPriceConvertClearField(e) {
    const field = e.currentTarget.dataset.field
    const overrides = { [field]: '' }
    this.setData({ [`priceConvert.${field}`]: '' })
    // 清空数量或总价后重算，确保单价卡片和另一个字段同步更新
    if (field === 'quantity' || field === 'totalAmount') {
      this._recalcFromQtyTotal(overrides)
    }
  },

  onPriceConvertClearUnitPrice() {
    const cat = PRICE_CATEGORIES[this.data.priceConvert.category]
    if (!cat) return
    const updates = {}
    cat.priceUnits.forEach(pu => { updates[`priceConvert.${pu.key}`] = '' })
    // 清除单价卡片时，同时清除关联的数量和总价（避免残留值导致重算异常）
    updates['priceConvert.quantity'] = ''
    updates['priceConvert.totalAmount'] = ''
    this.setData(updates)
  },

  // 键盘确认：数量 → 总价
  onPriceQtyConfirm() {
    this.setData({ priceFocusIndex: 1 })
  },

  // 键盘确认：总价收起键盘
  onPriceTotalConfirm() {
    this.setData({ priceFocusIndex: -1 })
  },

  onPriceConvertClear() {
    const updates = {
      priceConvert: { category: this.data.priceConvert.category, quantity: '', quantityUnit: 1, totalAmount: '', u0: '', u1: '', u2: '', u3: '', u4: '', u5: '', u6: '', u7: '', u8: '', u9: '', u10: '', u11: '', inputOrder: [] },
      activePriceUnit: '',
      priceFocusIndex: -1
    }
    this.setData(updates)
  },

  // ==================== 股市计算器 ====================
  onStockCalcInput(e) {
    const field = e.currentTarget.dataset.field
    const val = e.detail.value.replace(/[%折元\/股]/g, '')
    this.setData({ [`stockCalc.${field}`]: val })
    this._recalcStock(field, { [field]: val })
  },

  onStockFocus(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`stockFocused.${field}`]: true })
  },

  onStockBlur(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`stockFocused.${field}`]: false })
  },

  /**
   * 统一重算股市所有字段
   * changedField: 刚被用户修改的字段名，跳过覆盖
   *
   * 核心公式：
   *   totalBuyPrice  = buyPrice × shares
   *   totalSellPrice = sellPrice × shares
   *   profit         = totalSellPrice − totalBuyPrice = (sellPrice − buyPrice) × shares
   *   profitPercent  = (sellPrice − buyPrice) / buyPrice × 100  （不需要 shares）
   *
   * 策略：无论编辑哪个字段，都尝试用已有值推导缺失值，再正向计算全部。
   */
  _recalcStock(changedField, overrideVals) {
    const sc = Object.assign({}, this.data.stockCalc, overrideVals || {})
    const updates = {}

    const get = (key) => {
      const raw = String(sc[key] || '')
      // fmt() 可能输出含千分位的字符串如 "1,234"，必须去掉逗号否则 parseFloat("1,234")=1
      const v = parseFloat(raw.replace(/,/g, ''))
      return isNaN(v) ? null : v
    }

    const skip = (key) => key === changedField
    const setIfNew = (key, val) => {
      if (!skip(key) && val != null) updates['stockCalc.' + key] = this.fmtResult(val)
    }

    let buyPrice = get('buyPrice')
    let sellPrice = get('sellPrice')
    let shares = get('shares')
    const totalBuyPrice = get('totalBuyPrice')
    const totalSellPrice = get('totalSellPrice')
    const profit = get('profit')
    const profitPercent = get('profitPercent')

    // ========== 反向推导：用已有字段补齐缺失的主输入 ==========

    // 1) 盈亏率 + 一个价格 → 推导另一个价格
    if (profitPercent != null && buyPrice != null && buyPrice !== 0 && sellPrice == null) {
      sellPrice = buyPrice * (1 + profitPercent / 100)
      setIfNew('sellPrice', sellPrice)
    }
    if (profitPercent != null && sellPrice != null && sellPrice !== 0 && buyPrice == null) {
      buyPrice = sellPrice / (1 + profitPercent / 100)
      setIfNew('buyPrice', buyPrice)
    }

    // 2) 盈亏 + 一个价格 + 股数 → 推导另一个价格
    if (profit != null && buyPrice != null && shares != null && shares !== 0 && sellPrice == null) {
      sellPrice = profit / shares + buyPrice
      setIfNew('sellPrice', sellPrice)
    }
    if (profit != null && sellPrice != null && shares != null && shares !== 0 && buyPrice == null) {
      buyPrice = sellPrice - profit / shares
      setIfNew('buyPrice', buyPrice)
    }
    // 2b) 盈亏 + 两价格（无股数）→ 推导股数
    if (profit != null && buyPrice != null && sellPrice != null && shares == null) {
      const priceDiff = sellPrice - buyPrice
      if (priceDiff !== 0) {
        shares = profit / priceDiff
        setIfNew('shares', shares)
      }
    }

    // 3) 买入总额 → 推导股数或买入价
    if (totalBuyPrice != null) {
      if (buyPrice != null && buyPrice !== 0 && shares == null) {
        shares = totalBuyPrice / buyPrice
        setIfNew('shares', shares)
      } else if (shares != null && shares !== 0 && buyPrice == null) {
        buyPrice = totalBuyPrice / shares
        setIfNew('buyPrice', buyPrice)
      }
    }

    // 4) 卖出总额 → 推导股数或卖出价
    if (totalSellPrice != null) {
      if (sellPrice != null && sellPrice !== 0 && shares == null) {
        shares = totalSellPrice / sellPrice
        setIfNew('shares', shares)
      } else if (shares != null && shares !== 0 && sellPrice == null) {
        sellPrice = totalSellPrice / shares
        setIfNew('sellPrice', sellPrice)
      }
    }

    // 5) 盈亏率 + 两个总额 → 推导价格（盈亏率不需要 shares）
    if (profitPercent != null && totalBuyPrice != null && totalBuyPrice !== 0 && totalSellPrice == null && buyPrice == null && sellPrice == null) {
      // profitPercent = (totalSellPrice - totalBuyPrice) / totalBuyPrice × 100
      // → totalSellPrice = totalBuyPrice × (1 + profitPercent/100)
      const ts = totalBuyPrice * (1 + profitPercent / 100)
      setIfNew('totalSellPrice', ts)
    }
    if (profitPercent != null && totalSellPrice != null && totalSellPrice !== 0 && totalBuyPrice == null && buyPrice == null && sellPrice == null) {
      const tb = totalSellPrice / (1 + profitPercent / 100)
      setIfNew('totalBuyPrice', tb)
    }

    // 5b) 两个总额 → 推导盈亏率（不需要价格和股数）
    if (profitPercent == null && totalBuyPrice != null && totalBuyPrice !== 0 && totalSellPrice != null) {
      const pp = ((totalSellPrice - totalBuyPrice) / totalBuyPrice * 100).toFixed(2)
      setIfNew('profitPercent', parseFloat(pp))
    }

    // 6) 盈亏 + 买入总额 → 推导卖出总额
    if (profit != null && totalBuyPrice != null) {
      setIfNew('totalSellPrice', totalBuyPrice + profit)
    }

    // 7) 盈亏 + 卖出总额 → 推导买入总额
    if (profit != null && totalSellPrice != null) {
      setIfNew('totalBuyPrice', totalSellPrice - profit)
    }

    // 8) 再次尝试：有了新推导的价格/股数后，补充推导
    if (profitPercent != null && buyPrice != null && buyPrice !== 0 && sellPrice == null) {
      sellPrice = buyPrice * (1 + profitPercent / 100)
      setIfNew('sellPrice', sellPrice)
    }
    if (profitPercent != null && sellPrice != null && sellPrice !== 0 && buyPrice == null) {
      buyPrice = sellPrice / (1 + profitPercent / 100)
      setIfNew('buyPrice', buyPrice)
    }
    if (totalBuyPrice != null && buyPrice != null && buyPrice !== 0 && shares == null) {
      shares = totalBuyPrice / buyPrice
      setIfNew('shares', shares)
    }
    if (totalSellPrice != null && sellPrice != null && sellPrice !== 0 && shares == null) {
      shares = totalSellPrice / sellPrice
      setIfNew('shares', shares)
    }

    // ========== 正向计算 ==========

    // 总额（需要价格 + 股数）
    const totalBuy = (buyPrice != null && shares != null) ? buyPrice * shares : null
    const totalSell = (sellPrice != null && shares != null) ? sellPrice * shares : null

    // 盈亏 = (sellPrice − buyPrice) × shares
    let profitVal = null
    if (buyPrice != null && sellPrice != null && shares != null) {
      profitVal = (sellPrice - buyPrice) * shares
    }

    // 盈亏率 = (sellPrice − buyPrice) / buyPrice × 100  （不需要 shares）
    let percentVal = null
    if (buyPrice != null && buyPrice !== 0 && sellPrice != null) {
      percentVal = (sellPrice - buyPrice) / buyPrice * 100
    }

    // 写入所有结果字段（跳过正在编辑的字段）
    setIfNew('totalBuyPrice', totalBuy)
    if (!skip('totalBuyPrice') && totalBuy == null) updates['stockCalc.totalBuyPrice'] = ''
    setIfNew('totalSellPrice', totalSell)
    if (!skip('totalSellPrice') && totalSell == null) updates['stockCalc.totalSellPrice'] = ''
    setIfNew('profit', profitVal)
    if (!skip('profit') && profitVal == null) updates['stockCalc.profit'] = ''
    setIfNew('profitPercent', percentVal != null ? parseFloat(percentVal.toFixed(2)) : null)
    if (!skip('profitPercent') && percentVal == null) updates['stockCalc.profitPercent'] = ''

    // 盈亏状态
    if (profitVal != null) {
      updates['stockCalc.isProfit'] = profitVal >= 0
    } else if (percentVal != null) {
      updates['stockCalc.isProfit'] = percentVal >= 0
    }

    this.setData(updates)
  },

  onStockCalcClear() {
    this.setData({
      stockCalc: { buyPrice: '', sellPrice: '', shares: '', totalBuyPrice: '', totalSellPrice: '', profit: '', profitPercent: '', isProfit: false },
      stockFocused: { buyPrice: false, sellPrice: false, shares: false, totalBuyPrice: false, totalSellPrice: false, profit: false, profitPercent: false }
    })
  },

  // ==================== 工具函数 ====================
  // 单位转换专用格式化（不使用科学计数法，保留 6 位有效数字平衡精度与可读性）
  // 注意：不加千分位，因为单价卡片是可编辑输入框，逗号会破坏 parseFloat 解析
  fmtUnit(num) {
    if (num === Infinity || num === -Infinity) return '∞'
    if (isNaN(num)) return '0'
    num = parseFloat(num)
    if (isNaN(num) || num === 0) return '0'
    const absNum = Math.abs(num)
    // 极小数视为 0
    if (absNum < 1e-7) return '0'
    // 超大数或极小数用 toFixed 避免科学计数法，否则用 toPrecision 保留有效数字
    let str
    if (absNum >= 1e9) {
      str = num.toFixed(0)
    } else if (absNum >= 1e6) {
      str = num.toFixed(2).replace(/\.?0+$/, '')
    } else {
      str = parseFloat(num.toPrecision(6)).toString()
      if (str.includes('e') || str.includes('E')) {
        const digits = Math.max(0, 6 - Math.floor(Math.log10(absNum)) - 1)
        str = num.toFixed(Math.min(digits, 6)).replace(/\.?0+$/, '')
      }
    }
    return str || '0'
  },

  fmt(num) {
    if (num === Infinity || num === -Infinity) return '∞'
    if (isNaN(num) || num === '') return '0'
    num = parseFloat(num)
    if (isNaN(num)) return '0'
    const absNum = Math.abs(num)
    // 大数用定点表示避免出现 "1.23e+6" 这种科学计数法（字母 e）
    let str
    if (absNum >= 1e9) {
      str = num.toFixed(0)
    } else if (absNum >= 1e6) {
      str = num.toFixed(2).replace(/\.?0+$/, '')
    } else if (absNum >= 100000) {
      str = num.toFixed(1).replace(/\.0$/, '')
    } else if (num === 0 || absNum < 0.001) {
      str = num.toFixed(2)
    } else if (absNum < 0.01) {
      str = parseFloat(num.toFixed(4)).toString()
    } else {
      str = parseFloat(num.toFixed(2)).toString()
    }
    // 应用千分位（fmt 只用于只读显示，不会回传到输入框）
    return this._formatWithThousands(str)
  },

})
