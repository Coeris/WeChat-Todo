/**
 * 日历页面 - 虚拟渲染版
 *
 * 核心优化：
 * 1. LRU 缓存月度周结构，避免重复计算日期/月份标签
 * 2. 结构与动态属性分离，缓存永不失效
 * 3. 虚拟渲染：仅渲染可见窗口（~15周），DOM 节点减少 90%
 * 4. 数据层保持完整周数组（MAX_WEEKS = 156），滚动范围不受限
 * 5. 集中定时器管理，防止内存泄漏
 */
const StorageManager = require('../../utils/storage-manager')
const Lunar = require('../../utils/lunar')
const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const WEEK_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const TaskManager = require('../../utils/task')
const ThemeManager = require('../../utils/theme')
const { safeParseDate } = require('../../utils/helpers')
const CalendarDataCache = require('../../utils/calendarCache')

// ========== 配置常量 ==========
const SLOT_HEIGHT_RPX = 32  // 任务条槽高度：line-height(28rpx) + padding(2+2rpx)

const CONFIG = {
  CACHE_MONTHS: 36,        // LRU 缓存 36 个月结构数据
  MAX_WEEKS: 156,          // 数据层软限制 156 周（约 3 年）
  BUFFER_MONTHS: 3,        // 距离边界不到 3 个月时自动扩展
  SCROLL_THROTTLE: 120,    // 滚动事件节流 120ms
  TASK_DEBOUNCE: 500,      // 任务加载防抖 500ms
  REFRESH_DEBOUNCE: 300,   // 任务信息刷新防抖 300ms
  BUFFER_DEBOUNCE: 500,    // 缓冲区扩展防抖 500ms
  NAVIGATE_LOCK: 500,      // 导航锁持续 500ms
  LOAD_DELAY: 300,         // 加载更多延迟 300ms
  MAX_CELL_TASKS: 4,       // 日期格子最多显示任务数
  // 虚拟渲染配置
  VISIBLE_ABOVE: 4,        // 可见区域上方缓冲行数
  VISIBLE_BELOW: 6,        // 可见区域下方缓冲行数（多给下方以支持预加载）
}

Page({
  data: {
    darkMode: false,
    weekDays: WEEK_NAMES,
    displayYear: 0,
    displayMonth: 0,
    weeks: [],             // 仅包含可见窗口的周（虚拟渲染）
    topSpacer: 0,          // 上方占位高度
    bottomSpacer: 0,       // 下方占位高度
    selectedDateLabel: '',
    selectedDateWeek: '',
    isCurrentMonthView: true,
    calendarHeight: 0,
    rowHeight: 0,
    scrollTopValue: 0,
    todayTodoCount: 0,
    dayTasks: [],
    completedTasks: [],
    showCompleted: false,
    showTaskSheet: false,
    sheetHeight: 0,
    pinnedWeek: null,
    nextWeek: null,
    pinnedWeekIndex: -1
  },

  // ========== 私有状态（不传给渲染层） ==========

  _weekStartDay: 1,
  _daysPerWeek: 7,
  _selectedDateObj: null,

  // 数据层：完整周数组（JS 私有，不直接传给渲染层）
  _allWeeks: [],
  // 虚拟渲染窗口
  _visStart: 0,            // 可见窗口起始索引（在 _allWeeks 中）
  _visEnd: 0,              // 可见窗口结束索引

  _weekCache: null,
  _taskMap: {},
  _loadingMore: false,
  _lastLoadTime: 0,
  _navigating: false,
  _initialized: false,
  _heightReady: false,
  _timers: {},
  _lastScrollProcess: 0,
  _lastScrollTop: 0,       // 上一帧 scrollTop，用于判断滑动方向
  _wasHidden: false,       // 是否离开过页面（切换 tab 或进入子页面）
  _rpxToPx: 0.5,           // rpx 到 px 的转换比例

  // ========== 生命周期 ==========

  onLoad() {
    this._weekCache = new CalendarDataCache(CONFIG.CACHE_MONTHS)
    try {
      const windowInfo = wx.getWindowInfo()
      this._rpxToPx = windowInfo.windowWidth / 750
    } catch (e) {
      this._rpxToPx = 0.5
    }
    this.loadSettings()
    this._setTimer('init', () => this._initPage(), 500)

    // 注册 tab retap 回调（由自定义 TabBar 组件触发）
    const app = getApp()
    if (!app._tabRetapCallbacks) app._tabRetapCallbacks = {}
    app._tabRetapCallbacks['pages/calendar/index'] = () => {
      if (this._initialized) this.backToToday()
    }
  },

  onShow() {
    // 设置自定义 TabBar 选中状态和暗色模式
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().update(1, this.data.darkMode)
    }

    ThemeManager.applyToPage(this)
    if (this._initialized) {
      // 从其他 tab 或子页面返回，正常刷新
      this._wasHidden = false
      this.loadSettings()
      this.loadTasks()
    }
  },

  onHide() {
    this._wasHidden = true
  },

  onReady() {
    this._setTimer('height', () => {
      if (!this._heightReady) this.setCalendarHeight()
    }, 100)
  },

  onUnload() {
    this._clearAllTimers()
    if (this._weekCache) this._weekCache.clear()
    this._heightReady = false
    // 清理 tab retap 回调
    const app = getApp()
    if (app._tabRetapCallbacks) {
      app._tabRetapCallbacks['pages/calendar/index'] = null
    }
  },

  // ========== 定时器管理 ==========

  _setTimer(name, fn, delay) {
    this._clearTimer(name)
    this._timers[name] = setTimeout(fn, delay)
  },

  _clearTimer(name) {
    if (this._timers[name]) {
      clearTimeout(this._timers[name])
      this._timers[name] = 0
    }
  },

  _clearAllTimers() {
    Object.keys(this._timers).forEach(name => this._clearTimer(name))
  },

  // ========== 虚拟渲染窗口 ==========

  /**
   * 根据 scrollTop 计算可见窗口，返回需要 setData 的数据或 null（无变化）
   * @param {number} scrollTop 当前滚动位置
   * @returns {Object|null}
   */
  _computeVisibleWindow(scrollTop) {
    const rowHeight = this.data.rowHeight || 80
    const containerHeight = this.data.calendarHeight || 500
    const allWeeks = this._allWeeks

    if (allWeeks.length === 0 || rowHeight <= 0) return null

    const visibleRows = Math.ceil(containerHeight / rowHeight) + 1
    const centerIdx = Math.max(0, Math.floor(scrollTop / rowHeight))

    const startIdx = Math.max(0, centerIdx - CONFIG.VISIBLE_ABOVE)
    const endIdx = Math.min(allWeeks.length, centerIdx + visibleRows + CONFIG.VISIBLE_BELOW)

    // 窗口未变化则跳过
    if (startIdx === this._visStart && endIdx === this._visEnd) return null

    this._visStart = startIdx
    this._visEnd = endIdx

    return {
      weeks: allWeeks.slice(startIdx, endIdx),
      topSpacer: startIdx * rowHeight,
      bottomSpacer: (allWeeks.length - endIdx) * rowHeight
    }
  },

  /**
   * 用当前 data.scrollTopValue 重新计算可见窗口并 setData
   */
  _refreshVisibleWindow() {
    const visData = this._computeVisibleWindow(this.data.scrollTopValue)
    if (visData) this.setData(visData)
  },

  // ========== 初始化 ==========

  setCalendarHeight() {
    const query = wx.createSelectorQuery()
    query.select('.wc-scroll').boundingClientRect(rect => {
      if (rect && rect.height > 0) {
        const height = rect.height
        const rowHeight = Math.floor(height / 5)

        let scrollTopValue = 0
        const now = this._selectedDateObj || new Date()
        if (this._allWeeks.length > 0 && rowHeight > 0) {
          scrollTopValue = this._calcScrollPosition(
            now.getFullYear(), now.getMonth() + 1, now.getDate(), this._allWeeks, 2
          )
        }

        this._heightReady = true
        this.setData({
          calendarHeight: height,
          rowHeight: rowHeight,
          sheetHeight: rowHeight * 3,
          scrollTopValue: scrollTopValue
        }, () => {
          // 高度就绪后刷新可见窗口
          this._refreshVisibleWindow()
        })
      }
    }).exec()
  },

  loadSettings() {
    try {
      const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
      const calendarSettings = StorageManager.get('calendar_settings', {})
      const weekStartDay = settings.weekStartDay !== undefined ? settings.weekStartDay : 1
      const showCompleted = !!calendarSettings.showCompleted
      if (this._weekStartDay !== weekStartDay) {
        this._weekStartDay = weekStartDay
        if (this._weekCache) this._weekCache.clear()
        this.setData({ weekDays: this._getWeekDays(weekStartDay) })
        // 周起始日变更，重新生成周数据
        if (this._initialized && this._allWeeks.length > 0) {
          const midIdx = Math.floor(this._allWeeks.length / 2)
          const midWeek = this._allWeeks[midIdx] || this._allWeeks[0]
          if (midWeek) {
            const midDay = midWeek.days[3] || midWeek.days[0]
            this._allWeeks = this._generateWeeksRange(midDay.y, midDay.m, 6)
            // 重置可见窗口缓存，强制刷新视图
            this._visStart = -1
            this._visEnd = -1
            this._refreshVisibleWindow()
          }
        }
      }
      if (this.data.showCompleted !== showCompleted) {
        this.setData({ showCompleted })
      }
    } catch (err) {
      console.error('加载设置失败:', err)
    }
  },

  _getWeekDays(startDay) {
    const days = []
    for (let i = 0; i < 7; i++) {
      const dow = (startDay + i) % 7
      days.push({ name: WEEK_NAMES[dow], we: dow === 0 || dow === 6 })
    }
    return days
  },

  _initPage() {
    const t0 = Date.now()
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1

    let todayTodoCount = 0
    try {
      todayTodoCount = this._buildTaskMap(now)
    } catch (err) {
      console.error('加载任务失败:', err)
      this._taskMap = {}
    }
    this._lastLoadTime = Date.now()

    this._selectedDateObj = now

    // 生成完整周数据（数据层）
    this._allWeeks = this._generateWeeksRange(y, m, 6)

    this._initialized = true
    const payload = {
      weekDays: this._getWeekDays(this._weekStartDay),
      displayYear: y, displayMonth: m,
      selectedDateLabel: this._formatDateLabel(now),
      selectedDateWeek: WEEK_FULL[now.getDay()],
      isCurrentMonthView: true,
      todayTodoCount
    }

    if (this._heightReady && this._allWeeks.length > 0) {
      payload.scrollTopValue = this._calcScrollPosition(y, m, now.getDate(), this._allWeeks, 2)
    }

    // 计算可见窗口
    const initScroll = payload.scrollTopValue || 0
    this._lastScrollTop = initScroll
    const visData = this._computeVisibleWindow(initScroll)
    if (visData) Object.assign(payload, visData)

    this.setData(payload, () => {
      console.log(`[Calendar] init done: ${Date.now() - t0}ms, total: ${this._allWeeks.length}, visible: ${this._visEnd - this._visStart}`)
      if (!this._heightReady) {
        this._setTimer('height', () => this.setCalendarHeight(), 100)
      }
    })
  },

  /** 再次点击当前 tab，回到本月视图（刷新任务 + 滚动到本月第一周） */
  _goToCurrentMonth() {
    // 防抖：500ms 内不重复触发
    if (this._goToMonthLock && Date.now() - this._goToMonthLock < 500) return
    this._goToMonthLock = Date.now()

    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1

    // 关闭任务面板（修复 #2）
    if (this.data.showTaskSheet) {
      this.setData({
        showTaskSheet: false,
        pinnedWeek: null,
        nextWeek: null,
        pinnedWeekIndex: -1
      })
    }

    // 重置导航锁（修复 #4）
    this._navigating = false
    this._clearTimer('navigating')

    // 刷新任务
    let todayTodoCount = 0
    try {
      todayTodoCount = this._buildTaskMap(now)
    } catch (err) {
      console.error('加载任务失败:', err)
    }
    this._lastLoadTime = Date.now()

    // 检查是否需要重建周数据（修复 #5：避免不必要的全量重建）
    const firstDay = new Date(y, m - 1, 1)
    const needRegenerate = !this._isInWeeksRange(firstDay)
    if (needRegenerate) {
      this._allWeeks = this._generateWeeksRange(y, m, 6)
    }

    // 滚动到本月第一周（targetRow=0 显示在顶部）
    const targetScroll = this._calcScrollPosition(y, m, 1, this._allWeeks, 0)
    this._lastScrollTop = targetScroll

    const updateData = {
      displayYear: y,
      displayMonth: m,
      isCurrentMonthView: true,    // 修复 #3
      scrollTopValue: targetScroll, // 修复 #1：关键，让 scroll-view 实际滚动
      todayTodoCount
    }

    // 刷新可见窗口（修复 #6：始终重新计算，确保 window 对齐）
    this._visStart = 0
    this._visEnd = 0
    const visData = this._computeVisibleWindow(targetScroll)
    if (visData) Object.assign(updateData, visData)

    this.setData(updateData)

    // 设置导航锁，防止程序滚动期间 onScroll 误触发月份检测（修复 #4）
    this._navigating = true
    this._setTimer('navigating', () => { this._navigating = false }, CONFIG.NAVIGATE_LOCK)
  },

  // ========== 周数据生成（带 LRU 缓存） ==========

  _generateWeeksRange(year, month, offset) {
    const startTotal = year * 12 + month - 1 - offset
    const endTotal = year * 12 + month + offset

    const allWeeks = []
    const seenIds = new Set()

    for (let total = startTotal; total <= endTotal; total++) {
      const y = Math.floor(total / 12)
      const m = (total % 12) + 1
      const monthWeeks = this._generateMonthWeeks(y, m)

      for (const w of monthWeeks) {
        if (!seenIds.has(w.id)) {
          seenIds.add(w.id)
          allWeeks.push(w)
        }
      }
    }

    return allWeeks
  },

  _generateMonthWeeks(year, month) {
    const rawWeeks = this._getOrBuildMonthStructure(year, month)
    return this._applyDynamicProps(rawWeeks)
  },

  /**
   * 获取或构建月度周结构（纯结构缓存）
   * 修复：lastMonthKey 在 while 循环外部持久化，避免跨周重复标签
   */
  _getOrBuildMonthStructure(year, month) {
    const cached = this._weekCache ? this._weekCache.get(year, month) : null
    if (cached) return cached

    const weeks = []
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)

    const startWeekDay = firstDay.getDay()
    const diff = (startWeekDay - this._weekStartDay + 7) % 7
    const weekStart = new Date(firstDay)
    weekStart.setDate(weekStart.getDate() - diff)

    let currentDate = new Date(weekStart)
    // 关键修复：lastMonthKey 在所有周之间持久化，避免跨周重复月份标签
    let lastMonthKey = null

    while (currentDate <= lastDay) {
      const week = {
        y: currentDate.getFullYear(),
        m: currentDate.getMonth() + 1,
        d: currentDate.getDate(),
        id: `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`,
        days: []
      }

      for (let i = 0; i < this._daysPerWeek; i++) {
        const dayDate = new Date(currentDate)
        dayDate.setDate(currentDate.getDate() + i)

        const dayYear = dayDate.getFullYear()
        const dayMonth = dayDate.getMonth() + 1
        const dayDay = dayDate.getDate()

        const monthKey = `${dayYear}-${dayMonth}`
        week.days.push({
          y: dayYear,
          m: dayMonth,
          d: dayDay,
          ml: monthKey !== lastMonthKey,
          id: `${dayYear}-${dayMonth}-${dayDay}`
        })
        if (monthKey !== lastMonthKey) lastMonthKey = monthKey
      }

      weeks.push(week)
      currentDate.setDate(currentDate.getDate() + this._daysPerWeek)
    }

    if (this._weekCache) {
      this._weekCache.set(year, month, weeks)
    }

    return weeks
  },

  /**
   * 构建日期格子的显示标题（多天任务只在起始格显示，计算跨格子宽度）
   * @param {Array} dayTasks - 该日的任务列表
   * @param {Array} weekDays - 该周所有天对象（用于计算跨格子宽度）
   * @param {number} dayIdx - 当前天在周中的索引
   * @param {Object} taskMap - 任务映射表
   * @returns {object} { titles, extraCount }
   */
  /**
   * 计算多天任务在指定位置之后本周内的连续跨度
   */
  _calcMultiSpan(dayIdx, weekDays, taskMap, taskId) {
    let span = 1
    for (let k = dayIdx + 1; k < weekDays.length; k++) {
      const nk = `${weekDays[k].y}-${weekDays[k].m}-${weekDays[k].d}`
      const nt = taskMap[nk] || []
      if (nt.some(x => x.taskId === taskId)) span++
      else break
    }
    return span
  },

  /**
   * 构建日期格子的显示标题
   * @returns {{ titles: Array, extraCount: number }}
   */
  _buildDisplayTitles(dayTasks, weekDays, dayIdx, taskMap) {
    const activeTasks = dayTasks.filter(t => !t.completed)
    const displayTitles = []

    for (const t of activeTasks) {
      // 多天跨周继续任务：只在周第一天处理，计算本周内跨度
      if (t.multiDay && (t.multiPos === 'middle' || t.multiPos === 'end')) {
        if (dayIdx > 0) continue

        displayTitles.push({
          title: t.title, priority: t.priority || 0,
          multiDay: true, multiPos: t.multiPos,
          taskId: t.id,
          multiSpan: this._calcMultiSpan(dayIdx, weekDays, taskMap, t.taskId)
        })
        continue
      }

      const item = {
        title: t.title, priority: t.priority || 0,
        multiDay: !!t.multiDay, multiPos: t.multiPos || 'none',
        taskId: t.id
      }

      // 多天起始任务：计算本周内连续跨越天数
      if (t.multiDay && t.multiPos === 'start') {
        item.multiSpan = weekDays
          ? this._calcMultiSpan(dayIdx, weekDays, taskMap, t.taskId)
          : 1
      }

      displayTitles.push(item)
    }

    return {
      titles: displayTitles.slice(0, CONFIG.MAX_CELL_TASKS),
      extraCount: Math.max(0, displayTitles.length - CONFIG.MAX_CELL_TASKS)
    }
  },

  _applyDynamicProps(rawWeeks) {
    const now = new Date()
    const todayY = now.getFullYear()
    const todayM = now.getMonth() + 1
    const todayD = now.getDate()

    const taskMap = this._taskMap || {}
    const selObj = this._selectedDateObj
    const selY = selObj ? selObj.getFullYear() : -1
    const selM = selObj ? selObj.getMonth() + 1 : -1
    const selD = selObj ? selObj.getDate() : -1

    return rawWeeks.map(week => {
      // 先处理所有天，构建 titles 和标记
      let todayIdx = -1
      const processedDays = week.days.map((day, idx) => {
        const dayOfWeek = (this._weekStartDay + idx) % 7
        const dateKey = `${day.y}-${day.m}-${day.d}`
        const dayTasks = taskMap[dateKey] || []
        const tc = dayTasks.length

        const { titles, extraCount } = this._buildDisplayTitles(dayTasks, week.days, idx, taskMap)

        const lunar = Lunar.solarToLunar(day.y, day.m, day.d)

        if (day.y === todayY && day.m === todayM && day.d === todayD) todayIdx = idx

        return {
          ...day,
          cd: day.y === todayY && day.m === todayM && day.d === todayD,
          sel: day.y === selY && day.m === selM && day.d === selD,
          he: tc > 0,
          hp: dayTasks.some(t => !t.completed),
          tc: tc,
          we: dayOfWeek === 0 || dayOfWeek === 6,
          titles: titles,
          extraCount: extraCount,
          lunarStr: lunar.displayStr,
          lunarType: lunar.displayType,
          hasMultiStart: titles.some(t => t.multiDay)
        }
      })

      // 收集多天任务条（传入 todayIdx 避免重复计算）
      const slotH = SLOT_HEIGHT_RPX * this._rpxToPx
      const multiDayBars = this._collectMultiDayBars(processedDays, slotH, todayIdx)

      return {
        ...week,
        days: processedDays,
        multiDayBars: multiDayBars
      }
    })
  },

  // ========== 任务加载 ==========

  _buildTaskMap(refDate) {
    const tasks = TaskManager.getTasks()
    const taskMap = {}
    const today = refDate || new Date()
    const todayY = today.getFullYear()
    const todayM = today.getMonth() + 1
    const todayD = today.getDate()
    let todayTodoCount = 0

    const _isValidDate = (d) => d && !isNaN(d.getTime())
    const _dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

    tasks.forEach(t => {
      try {
        if (!t.startTime) return
        const startDate = safeParseDate(t.startTime)
        if (!_isValidDate(startDate)) return

        let endDate = startDate
        if (t.dueDate) {
          const parsed = safeParseDate(t.dueDate)
          if (_isValidDate(parsed) && parsed > startDate) {
            endDate = parsed
          }
        }

        // 判断是否多天任务
        const dayDiff = (endDate.getFullYear() - startDate.getFullYear()) * 10000 +
          (endDate.getMonth() - startDate.getMonth()) * 100 +
          (endDate.getDate() - startDate.getDate())
        const isMultiDay = dayDiff > 0

        // 计算跨越的所有日期
        const date = new Date(startDate)
        const end = new Date(endDate)
        let isFirst = true
        let loopGuard = 0
        const maxDays = isMultiDay ? 365 : 1 // 最多跨365天

        while (date <= end && loopGuard < maxDays) {
          const key = _dateKey(date)
          if (!taskMap[key]) taskMap[key] = []

          const isLast = date.getFullYear() === end.getFullYear() &&
            date.getMonth() === end.getMonth() && date.getDate() === end.getDate()

          taskMap[key].push({
            id: t.id, title: t.title,
            priority: t.priority || 0, completed: !!t.completed,
            desc: t.notes || '',
            multiDay: isMultiDay,
            multiPos: isMultiDay ? (isFirst ? 'start' : (isLast ? 'end' : 'middle')) : 'none',
            taskId: t.id
          })

          if (!t.completed && date.getFullYear() === todayY && date.getMonth() + 1 === todayM && date.getDate() === todayD) {
            todayTodoCount++
          }

          isFirst = false
          date.setDate(date.getDate() + 1)
          loopGuard++
        }
      } catch (e) {
        console.warn('[Calendar] _buildTaskMap task error:', e)
      }
    })

    this._taskMap = taskMap
    return todayTodoCount
  },

  loadTasks() {
    const now = Date.now()
    if (now - this._lastLoadTime < CONFIG.TASK_DEBOUNCE) return
    this._lastLoadTime = now

    try {
      const todayTodoCount = this._buildTaskMap()
      const dateUpdate = this._selectedDateObj ? this._getDateUpdateData(this._selectedDateObj) : {}
      this.setData({ todayTodoCount, ...dateUpdate })
      this._scheduleRefreshWeeksTaskInfo()
    } catch (err) {
      console.error('加载任务失败:', err)
    }
  },

  /**
   * 从处理好的 days 数组中收集多天任务条数据
   * @param {Array} days - 处理好的天对象数组
   * @param {number} slotHeight - 每个任务槽的高度（px）
   * @param {number} todayIdx - 今天在 days 中的索引（-1 表示今天不在本周），由调用方传入
   * @returns {Array|undefined} 多天任务条数组
   */
  _collectMultiDayBars(days, slotHeight, todayIdx) {
    const bars = []
    // 跟踪每一天已被占用的 slot，避免同一 slot 被多个多天任务重叠
    const occupiedSlots = new Array(days.length).fill(null).map(() => new Set())

    // todayIdx 由调用方传入，避免重复 new Date() + 遍历

    for (let idx = 0; idx < days.length; idx++) {
      const dayTitles = days[idx].titles || []

      for (const t of dayTitles) {
        if (t.multiDay && t.multiSpan > 0) {
          // 为该条分配最小可用 slot
          let slotOffset = 0
          while (slotOffset < CONFIG.MAX_CELL_TASKS) {
            let occupied = false
            for (let s = idx; s < idx + t.multiSpan && s < days.length; s++) {
              if (occupiedSlots[s].has(slotOffset)) { occupied = true; break }
            }
            if (!occupied) break
            slotOffset++
          }

          if (slotOffset >= CONFIG.MAX_CELL_TASKS) continue

          // 标记已占用
          for (let s = idx; s < idx + t.multiSpan && s < days.length; s++) {
            occupiedSlots[s].add(slotOffset)
          }

          // 计算文本位置：如果今天在任务条的范围内，文本跟随今天
          let textIdx = idx
          if (todayIdx >= idx && todayIdx < idx + t.multiSpan) {
            textIdx = todayIdx
          }

          const hasLunar = !!days[idx].lunarStr
          const topBase = (8 + 44 + (hasLunar ? 20 : 0) + 6) * this._rpxToPx
          const top = topBase + slotOffset * (slotHeight || SLOT_HEIGHT_RPX * this._rpxToPx)
          const height = (24 + 4) * this._rpxToPx // line-height(24rpx) + padding(2+2rpx)

          bars.push({
            taskId: t.taskId,
            title: t.title,
            priority: t.priority,
            startIdx: idx,
            span: t.multiSpan,
            textIdx: textIdx,
            top: Math.round(top * 100) / 100,
            height: Math.round(height * 100) / 100
          })
        }
      }
    }
    return bars.length > 0 ? bars : undefined
  },

  _scheduleRefreshWeeksTaskInfo() {
    this._setTimer('refresh', () => this._doRefreshWeeksTaskInfo(), CONFIG.REFRESH_DEBOUNCE)
  },

  /**
   * 增量刷新任务标记（遍历 _allWeeks 更新数据层，仅对可见窗口创建 setData 路径）
   */
  _doRefreshWeeksTaskInfo() {
    const allWeeks = this._allWeeks
    const taskMap = this._taskMap
    if (allWeeks.length === 0) return

    const updateData = {}
    const visStart = this._visStart
    const visEnd = this._visEnd

    for (let i = 0; i < allWeeks.length; i++) {
      const w = allWeeks[i]
      let needUpdate = false
      const updatedDays = []

      let todayIdx = -1
      for (let j = 0; j < w.days.length; j++) {
        const d = w.days[j]
        if (d.cd) todayIdx = j
        const dateKey = `${d.y}-${d.m}-${d.d}`
        const dayTasks = taskMap[dateKey] || []
        const he = dayTasks.length > 0
        const hp = dayTasks.some(t => !t.completed)
        const tc = dayTasks.length

        // 构建显示标题
        const { titles, extraCount } = this._buildDisplayTitles(dayTasks, w.days, j, taskMap)
        const titlesKey = JSON.stringify(titles)

        if (d.he !== he || d.hp !== hp || d.tc !== tc || d.extraCount !== extraCount || (d._titlesKey || '') !== titlesKey) {
          needUpdate = true
          const hasMultiStart = titles.some(t => t.multiDay)
          updatedDays.push({ j, he, hp, tc, titles, extraCount, hasMultiStart })
          // 同步更新数据层
          d.he = he
          d.hp = hp
          d.tc = tc
          d.titles = titles
          d.extraCount = extraCount
          d.hasMultiStart = hasMultiStart
          d._titlesKey = titlesKey
        }
      }

      // 仅对可见窗口中的周创建 setData 路径
      if (needUpdate && i >= visStart && i < visEnd) {
        const localIdx = i - visStart
        for (const item of updatedDays) {
          updateData[`weeks[${localIdx}].days[${item.j}].he`] = item.he
          updateData[`weeks[${localIdx}].days[${item.j}].hp`] = item.hp
          updateData[`weeks[${localIdx}].days[${item.j}].tc`] = item.tc
          updateData[`weeks[${localIdx}].days[${item.j}].titles`] = item.titles
          updateData[`weeks[${localIdx}].days[${item.j}].extraCount`] = item.extraCount
          updateData[`weeks[${localIdx}].days[${item.j}].hasMultiStart`] = item.hasMultiStart
        }
        // 重新收集多天任务条
        const slotH = SLOT_HEIGHT_RPX * this._rpxToPx
        const bars = this._collectMultiDayBars(w.days, slotH, todayIdx)
        updateData[`weeks[${localIdx}].multiDayBars`] = bars
      }
    }

    // 同步更新固定行和下一周
    if (this.data.showTaskSheet && this.data.pinnedWeekIndex >= 0) {
      const idx = this.data.pinnedWeekIndex
      if (idx < allWeeks.length) {
        const sel = this._selectedDateObj
        const pinnedWeek = allWeeks[idx]
        if (pinnedWeek) {
          let pinnedTodayIdx = -1
          const pinnedDays = pinnedWeek.days.map((d, dIdx) => {
            if (d.cd) pinnedTodayIdx = dIdx
            const dateKey = `${d.y}-${d.m}-${d.d}`
            const dayTasks = taskMap[dateKey] || []
            const { titles, extraCount } = this._buildDisplayTitles(dayTasks, pinnedWeek.days, dIdx, taskMap)
            return {
              ...d,
              he: dayTasks.length > 0,
              hp: dayTasks.some(t => !t.completed),
              tc: dayTasks.length,
              titles: titles,
              extraCount: extraCount,
              hasMultiStart: titles.some(t => t.multiDay),
              sel: sel && d.y === sel.getFullYear() && d.m === sel.getMonth() + 1 && d.d === sel.getDate()
            }
          })
          const slotH = SLOT_HEIGHT_RPX * this._rpxToPx
          updateData.pinnedWeek = {
            ...pinnedWeek,
            days: pinnedDays,
            multiDayBars: this._collectMultiDayBars(pinnedDays, slotH, pinnedTodayIdx)
          }
        }
        if (idx + 1 < allWeeks.length) {
          const nw = allWeeks[idx + 1]
          let nwTodayIdx = -1
          const nwDays = nw.days.map((d, dIdx) => {
            if (d.cd) nwTodayIdx = dIdx
            const dateKey = `${d.y}-${d.m}-${d.d}`
            const dayTasks = taskMap[dateKey] || []
            const { titles, extraCount } = this._buildDisplayTitles(dayTasks, nw.days, dIdx, taskMap)
            return {
              ...d,
              he: dayTasks.length > 0,
              hp: dayTasks.some(t => !t.completed),
              tc: dayTasks.length,
              titles: titles,
              extraCount: extraCount,
              hasMultiStart: titles.some(t => t.multiDay),
              sel: sel && d.y === sel.getFullYear() && d.m === sel.getMonth() + 1 && d.d === sel.getDate()
            }
          })
          const nwSlotH = SLOT_HEIGHT_RPX * this._rpxToPx
          updateData.nextWeek = {
            ...nw,
            days: nwDays,
            multiDayBars: this._collectMultiDayBars(nwDays, nwSlotH, nwTodayIdx)
          }
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      this.setData(updateData)
    }
  },

  _getDateUpdateData(dateObj) {
    if (!dateObj) return {}

    const y = dateObj.getFullYear()
    const m = dateObj.getMonth() + 1
    const d = dateObj.getDate()
    const dateKey = `${y}-${m}-${d}`
    const allTasks = this._taskMap[dateKey] || []

    const dayTasks = allTasks
      .filter(t => !t.completed)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .map(t => ({ ...t }))
    const completedTasks = allTasks
      .filter(t => t.completed)
      .map(t => ({ ...t }))

    return { dayTasks, completedTasks }
  },

  // ========== 日期操作 ==========

  onWeekDayTap(e) {
    const { source } = e.currentTarget.dataset
    switch (source) {
      case 'pinned':
        this.selectDateFromPinned(e)
        break
      case 'next':
        this.selectDateFromNextWeek(e)
        break
      default:
        this.selectDate(e)
        break
    }
  },

  /**
   * 更新选中状态（操作 _allWeeks 数据层 + 仅对可见窗口创建 setData 路径）
   */
  _updateSelection(year, month, day) {
    const allWeeks = this._allWeeks
    const updateData = {}
    let weekIndex = -1
    const visStart = this._visStart
    const visEnd = this._visEnd

    for (let i = 0; i < allWeeks.length; i++) {
      for (let j = 0; j < allWeeks[i].days.length; j++) {
        const d = allWeeks[i].days[j]
        if (d.y === year && d.m === month && d.d === day) {
          if (!d.sel) {
            d.sel = true
            if (i >= visStart && i < visEnd) {
              updateData[`weeks[${i - visStart}].days[${j}].sel`] = true
            }
          }
          if (weekIndex < 0) weekIndex = i
        } else if (d.sel) {
          d.sel = false
          if (i >= visStart && i < visEnd) {
            updateData[`weeks[${i - visStart}].days[${j}].sel`] = false
          }
        }
      }
    }

    return { updateData, weekIndex }
  },

  selectDate(e) {
    const { year, month, day } = e.currentTarget.dataset
    if (!year || !month || !day || year === 0) return

    const date = new Date(year, month - 1, day)
    const { updateData, weekIndex } = this._updateSelection(year, month, day)
    if (weekIndex < 0) return

    const pinnedWeek = this._allWeeks[weekIndex]
    const nextWeek = weekIndex + 1 < this._allWeeks.length ? this._allWeeks[weekIndex + 1] : null

    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

    this._selectedDateObj = date
    updateData.selectedDateLabel = this._formatDateLabel(date)
    updateData.selectedDateWeek = WEEK_FULL[date.getDay()]
    updateData.displayYear = year
    updateData.displayMonth = month
    updateData.isCurrentMonthView = isCurrentMonth
    updateData.showTaskSheet = true
    updateData.pinnedWeek = pinnedWeek
    updateData.nextWeek = nextWeek
    updateData.pinnedWeekIndex = weekIndex

    Object.assign(updateData, this._getDateUpdateData(date))
    this.setData(updateData)
  },

  selectDateFromPinned(e) {
    const { year, month, day } = e.currentTarget.dataset
    if (!year || !month || !day) return

    const date = new Date(year, month - 1, day)

    if (this._selectedDateObj && this._sameDay(date, this._selectedDateObj)) {
      this.hideTaskSheet()
      return
    }

    const { updateData } = this._updateSelection(year, month, day)

    const pinnedWeek = this.data.pinnedWeek
    if (pinnedWeek) {
      updateData.pinnedWeek = {
        ...pinnedWeek,
        days: pinnedWeek.days.map(d => ({
          ...d,
          sel: d.y === year && d.m === month && d.d === day
        }))
      }
    }

    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

    this._selectedDateObj = date
    updateData.selectedDateLabel = this._formatDateLabel(date)
    updateData.selectedDateWeek = WEEK_FULL[date.getDay()]
    updateData.displayYear = year
    updateData.displayMonth = month
    updateData.isCurrentMonthView = isCurrentMonth

    Object.assign(updateData, this._getDateUpdateData(date))
    this.setData(updateData)
  },

  selectDateFromNextWeek(e) {
    const { year, month, day } = e.currentTarget.dataset
    if (!year || !month || !day) return

    const date = new Date(year, month - 1, day)
    const newPinnedIndex = this.data.pinnedWeekIndex + 1
    if (newPinnedIndex >= this._allWeeks.length) return

    const targetWeek = this._allWeeks[newPinnedIndex]
    const dateExists = targetWeek.days.some(d => d.y === year && d.m === month && d.d === day)
    if (!dateExists) return

    const { updateData } = this._updateSelection(year, month, day)

    const newPinnedWeek = this._allWeeks[newPinnedIndex]
    const newNextWeek = newPinnedIndex + 1 < this._allWeeks.length ? this._allWeeks[newPinnedIndex + 1] : null

    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

    updateData.pinnedWeek = newPinnedWeek
    updateData.nextWeek = newNextWeek
    updateData.pinnedWeekIndex = newPinnedIndex
    this._selectedDateObj = date
    updateData.selectedDateLabel = this._formatDateLabel(date)
    updateData.selectedDateWeek = WEEK_FULL[date.getDay()]
    updateData.displayYear = year
    updateData.displayMonth = month
    updateData.isCurrentMonthView = isCurrentMonth

    Object.assign(updateData, this._getDateUpdateData(date))
    this.setData(updateData)
  },

  backToToday() {
    this._goToCurrentMonth()
  },

  prevMonth() {
    this._navigating = false
    this._clearTimer('navigating')
    const { displayYear, displayMonth } = this.data
    const prev = this._offsetMonth(displayYear, displayMonth, -1)
    this._navigateToMonth(prev.year, prev.month, 0, false)
  },

  nextMonth() {
    this._navigating = false
    this._clearTimer('navigating')
    const { displayYear, displayMonth } = this.data
    const next = this._offsetMonth(displayYear, displayMonth, 1)
    this._navigateToMonth(next.year, next.month, 0, false)
  },

  onYearConfirm(e) {
    const value = e.detail.value
    if (!value) return

    const year = parseInt(value, 10)
    if (isNaN(year) || year < 1900 || year > 2100) {
      wx.showToast({ title: '请输入有效年份(1900-2100)', icon: 'none' })
      this.setData({ displayYear: this.data.displayYear })
      return
    }

    this._jumpToDate(year, this.data.displayMonth, 1)
  },

  onMonthConfirm(e) {
    const value = e.detail.value
    if (!value) return

    const month = parseInt(value, 10)
    if (isNaN(month) || month < 1 || month > 12) {
      wx.showToast({ title: '请输入有效月份(1-12)', icon: 'none' })
      this.setData({ displayMonth: this.data.displayMonth })
      return
    }

    this._jumpToDate(this.data.displayYear, month, 1)
  },

  /** 跳转到指定日期（修复：targetRow 从 0 改为 2，居中显示） */
  _jumpToDate(year, month, day) {
    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    const targetDate = new Date(year, month - 1, day)

    const updateData = {}

    if (this.data.showTaskSheet) {
      updateData.showTaskSheet = false
      updateData.pinnedWeek = null
      updateData.nextWeek = null
      updateData.pinnedWeekIndex = -1
    }

    let needRegenerate = !this._isInWeeksRange(targetDate)

    if (needRegenerate) {
      this._selectedDateObj = targetDate
      this._allWeeks = this._generateWeeksRange(year, month, 3)
    }

    const maxDay = new Date(year, month, 0).getDate()
    const safeDay = Math.min(day, maxDay)
    // targetRow=0 让1号显示在第一行
    const targetScroll = this._calcScrollPosition(year, month, safeDay, this._allWeeks, 0)
    const safeDate = new Date(year, month - 1, safeDay)

    this._selectedDateObj = safeDate
    updateData.displayYear = year
    updateData.displayMonth = month
    updateData.selectedDateLabel = this._formatDateLabel(safeDate)
    updateData.selectedDateWeek = WEEK_FULL[safeDate.getDay()]
    updateData.isCurrentMonthView = isCurrentMonth
    updateData.scrollTopValue = targetScroll

    // 刷新可见窗口
    const visData = this._computeVisibleWindow(targetScroll)
    if (visData) Object.assign(updateData, visData)

    Object.assign(updateData, this._getDateUpdateData(safeDate))

    this.setData(updateData, () => {
      this._lastScrollTop = targetScroll
      if (!needRegenerate) this._scheduleRefreshWeeksTaskInfo()
      this._ensureMonthBuffer()
    })

    this._navigating = true
    this._setTimer('navigating', () => { this._navigating = false }, CONFIG.NAVIGATE_LOCK)
  },

  hideTaskSheet() {
    const pinnedWeekIndex = this.data.pinnedWeekIndex
    const rowHeight = this.data.rowHeight || 80

    let targetScroll = 0
    if (pinnedWeekIndex >= 0) {
      targetScroll = Math.max(0, (pinnedWeekIndex - 2) * rowHeight)
    }

    const updateData = {
      showTaskSheet: false,
      pinnedWeek: null,
      nextWeek: null,
      pinnedWeekIndex: -1,
      scrollTopValue: targetScroll
    }

    // 刷新可见窗口
    const visData = this._computeVisibleWindow(targetScroll)
    if (visData) Object.assign(updateData, visData)

    this.setData(updateData)
  },

  // 点击任务列表空白区域收起面板
  onSheetBlankTap(e) {
    // 任务项上绑定 data-id，点击到任务项内部时不收起
    // 向上查找最近的带 data-id 的节点
    let node = e.target
    while (node) {
      if (node.dataset && node.dataset.id) return
      if (node === e.currentTarget) break
      node = node.parentNode
    }
    this.hideTaskSheet()
  },

  // ========== 滚动事件（虚拟渲染核心） ==========

  onScroll(e) {
    if (this.data.showTaskSheet) return
    if (this._navigating) return

    // 节流：时间戳方式，确保滚动期间持续响应（而非 debounce 只在停止后触发）
    const now = Date.now()
    if (now - this._lastScrollProcess < CONFIG.SCROLL_THROTTLE) return
    this._lastScrollProcess = now

    const scrollTop = e.detail.scrollTop
    const rowHeight = this.data.rowHeight || 80
    const calendarHeight = this.data.calendarHeight || 0
    const scrollDir = scrollTop > this._lastScrollTop ? 'up' : scrollTop < this._lastScrollTop ? 'down' : ''
    this._lastScrollTop = scrollTop

    const updateData = {}

    // 1. 更新可见窗口
    const visData = this._computeVisibleWindow(scrollTop)
    if (visData) Object.assign(updateData, visData)

    // 2. 基于月边界 + 滑动方向更新月份标题
    const monthUpdate = this._detectMonthByBoundary(scrollTop, rowHeight, calendarHeight, scrollDir)
    if (monthUpdate) Object.assign(updateData, monthUpdate)

    // 单次 setData
    if (Object.keys(updateData).length > 0) {
      this.setData(updateData)
    }
  },

  /**
   * 基于月边界 + 滑动方向检测月份切换
   * - 上滑时：下月1号距离视口顶部 ≤ 1.3 行 → 切换到下月
   * - 下滑时：当月最后一天距离视口底部 ≤ 1.3 行 → 切换到上月
   * @returns {Object|null} 需要更新的 data 字段，或 null 表示不变
   */
  _detectMonthByBoundary(scrollTop, rowHeight, calendarHeight, scrollDir) {
    if (!scrollDir || !calendarHeight) return null

    const { displayYear, displayMonth } = this.data
    const allWeeks = this._allWeeks
    if (allWeeks.length === 0) return null

    const now = new Date()
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth() + 1
    const threshold = 1.3 * rowHeight  // 1.3 行的距离阈值
    const viewportBottom = scrollTop + calendarHeight

    if (scrollDir === 'up') {
      // 上滑：查找下月1号所在的周行索引
      const nextMonth = this._offsetMonth(displayYear, displayMonth, 1)
      const weekIdx = this._findWeekIndexByDate(nextMonth.year, nextMonth.month, 1)
      if (weekIdx < 0) return null

      // 下月1号所在行的顶部位置
      const rowTop = weekIdx * rowHeight
      const distanceFromTop = rowTop - scrollTop
      if (distanceFromTop <= threshold) {
        return {
          displayYear: nextMonth.year,
          displayMonth: nextMonth.month,
          isCurrentMonthView: nextMonth.year === nowYear && nextMonth.month === nowMonth
        }
      }
    } else if (scrollDir === 'down') {
      // 下滑：查找当月最后一天所在的周行索引
      const lastDay = new Date(displayYear, displayMonth, 0).getDate()
      const weekIdx = this._findWeekIndexByDate(displayYear, displayMonth, lastDay)
      if (weekIdx < 0) return null

      // 当月最后一天所在行的底部位置
      const rowBottom = (weekIdx + 1) * rowHeight
      const distanceFromBottom = viewportBottom - rowBottom
      if (distanceFromBottom <= threshold) {
        const prevMonth = this._offsetMonth(displayYear, displayMonth, -1)
        return {
          displayYear: prevMonth.year,
          displayMonth: prevMonth.month,
          isCurrentMonthView: prevMonth.year === nowYear && prevMonth.month === nowMonth
        }
      }
    }

    return null
  },

  /**
   * 在 _allWeeks 中查找包含指定日期的周行索引
   * @returns {number} 周索引，未找到返回 -1
   */
  _findWeekIndexByDate(year, month, day) {
    const allWeeks = this._allWeeks
    const target = this._dateNum(year, month, day)

    // 二分查找
    let lo = 0, hi = allWeeks.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const w = allWeeks[mid]
      const firstDay = w.days[0]
      const lastDay = w.days[w.days.length - 1]
      const first = this._dateNum(firstDay.y, firstDay.m, firstDay.d)
      const last = this._dateNum(lastDay.y, lastDay.m, lastDay.d)

      if (target < first) {
        hi = mid - 1
      } else if (target > last) {
        lo = mid + 1
      } else {
        return mid
      }
    }

    return -1
  },

  loadMoreMonths() {
    if (!this.data.rowHeight) return
    if (this._loadingMore) return
    this._loadingMore = true
    setTimeout(() => {
      this._appendWeeks()
    }, CONFIG.LOAD_DELAY)
  },

  loadPrevMonths() {
    if (!this.data.rowHeight) return
    if (this._loadingMore) return
    this._loadingMore = true
    setTimeout(() => {
      this._prependWeeks()
    }, CONFIG.LOAD_DELAY)
  },

  // ========== 任务操作 ==========

  toggleTaskComplete(e) {
    const { index, source } = e.currentTarget.dataset
    const taskList = source === 'completed' ? this.data.completedTasks : this.data.dayTasks
    const task = taskList[index]
    if (!task) return

    try {
      TaskManager.toggleComplete(task.id)
      this.loadTasks()
      wx.showToast({ title: task.completed ? '已取消完成' : '已完成', icon: 'success' })
    } catch (err) {
      console.error('切换任务状态失败:', err)
    }
  },

  goToTaskDetail(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/task/edit/index?id=${id}` })
  },

  addTask() {
    const selectedDateObj = this._selectedDateObj
    if (!selectedDateObj) return
    const y = selectedDateObj.getFullYear()
    const m = selectedDateObj.getMonth() + 1
    const d = selectedDateObj.getDate()
    wx.navigateTo({ url: `/pages/task/edit/index?year=${y}&month=${m}&day=${d}` })
  },

  toggleShowCompleted() {
    const value = !this.data.showCompleted
    this.setData({ showCompleted: value })
    try {
      const calendarSettings = StorageManager.get('calendar_settings', {})
      calendarSettings.showCompleted = value
      StorageManager.set('calendar_settings', calendarSettings)
    } catch (e) { /* ignore */ }
  },

  // ========== 导航与缓冲 ==========

  _navigateToMonth(year, month, targetRow, isCurrentMonth, selectedDate) {
    const updateData = {}

    if (this.data.showTaskSheet) {
      updateData.showTaskSheet = false
      updateData.pinnedWeek = null
      updateData.nextWeek = null
      updateData.pinnedWeekIndex = -1
    }

    const day = selectedDate ? selectedDate.getDate() : 1
    const targetDate = new Date(year, month - 1, day)

    let needRegenerate = !this._isInWeeksRange(targetDate)

    if (needRegenerate) {
      if (selectedDate) this._selectedDateObj = selectedDate
      this._allWeeks = this._generateWeeksRange(year, month, 3)
    } else if (selectedDate) {
      const { updateData: selData } = this._updateSelection(
        selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate()
      )
      Object.assign(updateData, selData)
    }

    const targetScroll = this._calcScrollPosition(year, month, day, this._allWeeks, targetRow)

    updateData.displayYear = year
    updateData.displayMonth = month
    updateData.isCurrentMonthView = isCurrentMonth
    updateData.scrollTopValue = targetScroll

    if (selectedDate) {
      this._selectedDateObj = selectedDate
      updateData.selectedDateLabel = this._formatDateLabel(selectedDate)
      updateData.selectedDateWeek = WEEK_FULL[selectedDate.getDay()]
      Object.assign(updateData, this._getDateUpdateData(selectedDate))
    }

    // 刷新可见窗口
    const visData = this._computeVisibleWindow(targetScroll)
    if (visData) Object.assign(updateData, visData)

    this.setData(updateData, () => {
      this._lastScrollTop = targetScroll
      if (!needRegenerate) this._scheduleRefreshWeeksTaskInfo()
      this._ensureMonthBuffer()
    })

    this._navigating = true
    this._setTimer('navigating', () => { this._navigating = false }, CONFIG.NAVIGATE_LOCK)
  },

  _isInWeeksRange(date) {
    const allWeeks = this._allWeeks
    if (allWeeks.length === 0) return false

    const firstDay = allWeeks[0].days[0]
    const lastWeek = allWeeks[allWeeks.length - 1]
    const lastDay = lastWeek.days[lastWeek.days.length - 1]

    const t = this._dateNum(date.getFullYear(), date.getMonth() + 1, date.getDate())
    const f = this._dateNum(firstDay.y, firstDay.m, firstDay.d)
    const l = this._dateNum(lastDay.y, lastDay.m, lastDay.d)

    return t >= f && t <= l
  },

  _ensureMonthBuffer() {
    if (!this.data.rowHeight) return
    if (this.data.showTaskSheet) return

    this._setTimer('buffer', () => this._doEnsureBuffer(), CONFIG.BUFFER_DEBOUNCE)
  },

  _doEnsureBuffer() {
    const allWeeks = this._allWeeks
    if (allWeeks.length === 0) return

    const displayTotal = this.data.displayYear * 12 + this.data.displayMonth
    const lastDay = allWeeks[allWeeks.length - 1].days[allWeeks[allWeeks.length - 1].days.length - 1]
    const lastTotal = lastDay.y * 12 + lastDay.m
    const firstDay = allWeeks[0].days[0]
    const firstTotal = firstDay.y * 12 + firstDay.m

    if (displayTotal >= lastTotal - CONFIG.BUFFER_MONTHS) {
      this._appendWeeks()
    }
    if (displayTotal <= firstTotal + CONFIG.BUFFER_MONTHS) {
      this._prependWeeks()
    }
  },

  /**
   * 向后追加周数据（操作 _allWeeks 数据层 + 刷新可见窗口）
   */
  _appendWeeks() {
    const allWeeks = this._allWeeks
    if (allWeeks.length === 0) { this._loadingMore = false; return }

    const lastWeek = allWeeks[allWeeks.length - 1]
    const lastDay = lastWeek.days[lastWeek.days.length - 1]
    const lastTs = this._dateNum(lastDay.y, lastDay.m, lastDay.d)
    const next = this._offsetMonth(lastDay.y, lastDay.m, 1)

    const newWeeks = this._generateMonthWeeks(next.year, next.month)

    const existingIds = new Set(allWeeks.map(w => w.id))
    const filtered = newWeeks.filter(w => {
      if (existingIds.has(w.id)) return false
      const firstD = w.days[0]
      return this._dateNum(firstD.y, firstD.m, firstD.d) > lastTs
    })

    if (filtered.length === 0) { this._loadingMore = false; return }

    const combined = [...allWeeks, ...filtered]
    const rowHeight = this.data.rowHeight || 80
    const updateData = {}

    if (combined.length > CONFIG.MAX_WEEKS) {
      const trimCount = combined.length - CONFIG.MAX_WEEKS
      this._allWeeks = combined.slice(trimCount)
      updateData.scrollTopValue = Math.max(0, this.data.scrollTopValue - trimCount * rowHeight)

      if (this.data.showTaskSheet && this.data.pinnedWeekIndex >= 0) {
        updateData.pinnedWeekIndex = this.data.pinnedWeekIndex - trimCount
        if (updateData.pinnedWeekIndex < 0) updateData.pinnedWeekIndex = 0
      }
    } else {
      this._allWeeks = combined
    }

    // 追加的新周在当前可见窗口下方，通常不影响可见窗口
    // 但裁剪可能影响，所以刷新
    const visData = this._computeVisibleWindow(updateData.scrollTopValue !== undefined ? updateData.scrollTopValue : this.data.scrollTopValue)
    if (visData) Object.assign(updateData, visData)

    if (Object.keys(updateData).length > 0) {
      this.setData(updateData, () => {
        this._loadingMore = false
      })
    } else {
      this._loadingMore = false
    }
  },

  /**
   * 向前追加周数据（操作 _allWeeks 数据层 + 补偿 scrollTop + 刷新可见窗口）
   */
  _prependWeeks() {
    const allWeeks = this._allWeeks
    if (allWeeks.length === 0) { this._loadingMore = false; return }

    const firstWeek = allWeeks[0]
    const firstDay = firstWeek.days[0]
    const firstTs = this._dateNum(firstDay.y, firstDay.m, firstDay.d)
    const prev = this._offsetMonth(firstDay.y, firstDay.m, -1)

    const newWeeks = this._generateMonthWeeks(prev.year, prev.month)

    const existingIds = new Set(allWeeks.map(w => w.id))
    const filtered = newWeeks.filter(w => {
      if (existingIds.has(w.id)) return false
      const lastD = w.days[w.days.length - 1]
      return this._dateNum(lastD.y, lastD.m, lastD.d) < firstTs
    }).reverse()

    if (filtered.length === 0) { this._loadingMore = false; return }

    const combined = [...filtered, ...allWeeks]
    const rowHeight = this.data.rowHeight || 80
    const prependOffset = filtered.length * rowHeight

    const newScrollTop = this.data.scrollTopValue + prependOffset
    const updateData = {
      scrollTopValue: newScrollTop
    }

    if (combined.length > CONFIG.MAX_WEEKS) {
      this._allWeeks = combined.slice(0, CONFIG.MAX_WEEKS)
    } else {
      this._allWeeks = combined
    }

    const visData = this._computeVisibleWindow(newScrollTop)
    if (visData) Object.assign(updateData, visData)

    this.setData(updateData, () => {
      this._loadingMore = false
    })
  },

  // ========== 工具方法 ==========

  /** 日期转可排序数字，避免创建 Date 对象（y*10000 + m*100 + d 保证唯一且有序） */
  _dateNum(y, m, d) {
    return y * 10000 + m * 100 + d
  },

  _calcScrollPosition(year, month, day, weeks, targetRow) {
    const rowHeight = this.data.rowHeight || 80
    const target = this._dateNum(year, month, day)

    // 二分查找目标日期所在周（复用 _findWeekIndexByDate 的逻辑）
    let lo = 0, hi = weeks.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const w = weeks[mid]
      const first = this._dateNum(w.y, w.m, w.d)
      const lastD = w.days[w.days.length - 1]
      const last = this._dateNum(lastD.y, lastD.m, lastD.d)
      if (target < first) {
        hi = mid - 1
      } else if (target > last) {
        lo = mid + 1
      } else {
        return Math.max(0, (mid - targetRow) * rowHeight)
      }
    }

    return 0
  },

  _sameDay(a, b) {
    if (!a || !b) return false
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  },

  _offsetMonth(year, month, offset) {
    const total = year * 12 + month - 1 + offset
    return {
      year: Math.floor(total / 12),
      month: (total % 12) + 1
    }
  },

  _formatDateLabel(date) {
    const m = date.getMonth() + 1
    const d = date.getDate()
    const now = new Date()
    const nowM = now.getMonth() + 1
    const nowD = now.getDate()
    const nowY = now.getFullYear()
    const dateY = date.getFullYear()

    if (dateY === nowY && m === nowM && d === nowD) return '今天'
    // 昨天
    const yDay = new Date(nowY, nowM - 1, nowD - 1)
    if (dateY === yDay.getFullYear() && m === yDay.getMonth() + 1 && d === yDay.getDate()) return '昨天'
    // 明天
    const tDay = new Date(nowY, nowM - 1, nowD + 1)
    if (dateY === tDay.getFullYear() && m === tDay.getMonth() + 1 && d === tDay.getDate()) return '明天'

    return `${m}月${d}日`
  }
})
