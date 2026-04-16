const TaskManager = require('../../utils/task')
const ThemeManager = require('../../utils/theme')
const { confirmDeleteTask } = require('../../utils/task-helpers')

// 优先级 → 象限映射（固定，与显示顺序解耦）
const PRIORITY_QUADRANT_MAP = {
  0: 'normal',           // 普通任务
  1: 'important',        // 重要
  2: 'urgent',           // 紧急
  3: 'urgentImportant'   // 重要且紧急
}

// 象限 → 优先级（反向映射）
const QUADRANT_PRIORITY_MAP = {
  normal: 0,
  important: 1,
  urgent: 2,
  urgentImportant: 3
}

// 象限显示顺序（艾森豪威尔矩阵布局）
const QUADRANT_CONFIG = [
  { key: 'urgent', icon: '⚡', title: '紧急', className: 'urgent' },
  { key: 'urgentImportant', icon: '🔥', title: '重要紧急', className: 'urgent-important' },
  { key: 'normal', icon: '😐', title: '普通', className: 'normal' },
  { key: 'important', icon: '⭐', title: '重要', className: 'important' }
]

// 筛选标签页顺序
const FILTER_ORDER = ['done', 'todo', 'quadrant']

Page({
  data: {
    darkMode: false,
    taskGroups: [],
    loading: false,
    filter: 'todo',
    sliderLeft: 0,
    sliderWidth: 0,
    sliderReady: false,
    contentAnimClass: '',
    prevFilter: '', // 记录上一次的 filter，用于判断滑动方向
    showSearch: true,
    showAddBtn: true,
    quadrantTasks: {
      urgentImportant: [],
      important: [],
      urgent: [],
      normal: []
    },
    quadrantList: QUADRANT_CONFIG,
    collapsedGroups: {}
  },

  _pageTouchStartX: 0,
  _pageTouchStartY: 0,
  _pageSwipeHandled: false,
  _lastScrollTop: 0,
  onLoad() {
    this._pendingToggleSet = new Set() // 正在切换完成状态的任务 ID，防止竞态
  },

  onReady() {
    // 初始化 slider 位置
    this._updateSlider(this.data.filter)
  },

  onShow() {
    // 设置自定义 TabBar 选中状态和暗色模式
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().update(0, this.data.darkMode)
    }
    ThemeManager.applyToPage(this)
    this.loadTasks()
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadTasks()
    wx.stopPullDownRefresh()
  },

  // 加载任务
  loadTasks() {
    try {
      // 根据筛选条件获取任务
      const tasks = TaskManager.filterTasks(this.data.filter)

      // 为所有任务添加格式化后的时间字段和默认深度
      const tasksWithFormattedTime = tasks.map(task => ({
        ...task,
        _depth: 0,
        startTimeDisplay: task.startTime ? TaskManager.formatTime(task.startTime) : '',
        endTimeDisplay: task.dueDate ? TaskManager.formatTime(task.dueDate) : ''
      }))

      // 如果是象限视图（子任务不参与象限分类）
      if (this.data.filter === 'quadrant') {
        this.groupTasksByQuadrant(tasksWithFormattedTime)
        this.setData({ taskGroups: [] })
      } else {
        // 列表视图：递归展开所有层级的子任务
        const expandedTasks = TaskManager.expandSubtasks(tasksWithFormattedTime)
        // 普通视图分组
        const taskGroups = this.data.filter === 'todo'
          ? TaskManager.groupTasksByTimeBucket(expandedTasks)
          : TaskManager.groupTasksByDate(expandedTasks)
        this.setData({ taskGroups })
      }
    } catch (error) {
      console.error('加载任务失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    }
  },

  // 设置筛选
  setFilter(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.filter) return
    this._switchFilter(type)
  },

  // 页面级左右滑动手势
  onPageTouchStart(e) {
    const touch = e.touches[0]
    this._pageTouchStartX = touch.clientX
    this._pageTouchStartY = touch.clientY
    this._pageSwipeHandled = false
  },

  // 动态计算并更新 slider 位置
  _updateSlider(type) {
    const index = FILTER_ORDER.indexOf(type)
    const query = wx.createSelectorQuery()
    query.selectAll('.filter-btn').boundingClientRect(rects => {
      if (!rects || !rects[index]) return
      const rect = rects[index]
      const barQuery = wx.createSelectorQuery()
      barQuery.select('.filter-bar').boundingClientRect(barRect => {
        if (!barRect) return
        const shrink = 14 * (barRect.width / 375) // 两侧各缩进 14rpx 换算 px
        const left = rect.left - barRect.left + shrink
        const width = rect.width - shrink * 2
        // 先设置位置（此时 slider-hidden 仍生效，用户不可见 transition）
        this.setData({ sliderLeft: left, sliderWidth: width }, () => {
          // 位置渲染完成后，再显示 slider，避免从 (0,0) 滑动的初始动画
          this.setData({ sliderReady: true })
        })
      }).exec()
    }).exec()
  },

  onPageTouchEnd(e) {
    if (this._pageSwipeHandled) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - this._pageTouchStartX
    const deltaY = touch.clientY - this._pageTouchStartY

    // 只处理水平滑动，且距离大于 80px
    if (Math.abs(deltaX) < 80 || Math.abs(deltaY) > Math.abs(deltaX)) return

    const currentIndex = FILTER_ORDER.indexOf(this.data.filter)
    if (deltaX < 0 && currentIndex < FILTER_ORDER.length - 1) {
      this._pageSwipeHandled = true
      this._switchFilter(FILTER_ORDER[currentIndex + 1], 'slide-left')
    } else if (deltaX > 0 && currentIndex > 0) {
      this._pageSwipeHandled = true
      this._switchFilter(FILTER_ORDER[currentIndex - 1], 'slide-right')
    }
  },

  // 统一的标签切换方法（带动画）
  _switchFilter(type, direction) {
    const prevFilter = this.data.filter
    const prevIndex = FILTER_ORDER.indexOf(prevFilter)
    const newIndex = FILTER_ORDER.indexOf(type)

    // 自动判断方向（无 direction 参数时根据索引推断）
    if (!direction) {
      direction = newIndex > prevIndex ? 'slide-left' : 'slide-right'
    }

    // 搜索和添加按钮：仅待办视图显示，其他视图隐藏
    const showSearch = type === 'todo'
    const showAddBtn = type === 'todo'

    // 滑动更新 slider
    this._updateSlider(type)

    // 直接切换内容，在新内容上播放入场动画（避免旧内容淡出→空白→新内容淡入的闪烁）
    this.setData({
      filter: type,
      prevFilter,
      collapsedGroups: {},
      contentAnimClass: direction === 'slide-left' ? 'anim-slide-in-right' : 'anim-slide-in-left',
      showSearch,
      showAddBtn
    })

    this.loadTasks()

    // 动画结束后清理 class
    clearTimeout(this._animTimer)
    this._animTimer = setTimeout(() => {
      this.setData({ contentAnimClass: '' })
    }, 280)
  },

  // 切换分组折叠
  toggleGroup(e) {
    const title = e.currentTarget.dataset.title
    const collapsed = { ...this.data.collapsedGroups }
    collapsed[title] = !collapsed[title]
    this.setData({ collapsedGroups: collapsed })
  },

  // 按象限分组（仅未完成任务）
  groupTasksByQuadrant(tasks) {
    const quadrantTasks = {
      urgentImportant: [],
      important: [],
      urgent: [],
      normal: []
    }

    tasks.forEach(task => {
      if (task.completed) return
      const key = PRIORITY_QUADRANT_MAP[task.priority] || 'normal'
      quadrantTasks[key].push(task)
    })

    this.setData({ quadrantTasks })
  },

  // 跳转添加任务
  goToAddTask() {
    wx.navigateTo({
      url: '/pages/task/edit/index'
    })
  },

  // 从象限区域跳转添加任务（带优先级）
  addToQuadrant(e) {
    const key = e.currentTarget.dataset.key
    const priority = QUADRANT_PRIORITY_MAP[key]
    if (priority === undefined) return
    wx.navigateTo({
      url: `/pages/task/edit/index?priority=${priority}`
    })
  },

  // 跳转任务详情
  goToTaskDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/task/edit/index?id=${id}`
    })
  },

  // 任务列表组件事件
  onTaskClick(e) {
    const { task } = e.detail
    wx.navigateTo({
      url: `/pages/task/edit/index?id=${task.id}`
    })
  },

  // 切换任务完成状态（列表视图）
  onStatusChange(e) {
    const { task } = e.detail
    this._handleToggleComplete(task.id)
  },

  // 切换优先级
  onImportantChange(e) {
    const { task, priority } = e.detail
    TaskManager.updateTaskPriority(task.id, priority)
    this.loadTasks()
  },

  // 删除任务（右滑删除）
  onDeleteTask(e) {
    const { task } = e.detail
    confirmDeleteTask(task.id, task.title, () => {
      TaskManager.deleteTask(task.id)
      wx.showToast({ title: '已删除', icon: 'success' })
      this.loadTasks()
    })
  },

  // 快速完成（象限视图）
  quickComplete(e) {
    const { id } = e.currentTarget.dataset
    this._handleToggleComplete(id)
  },

  // 切换完成状态的核心逻辑
  _handleToggleComplete(taskId) {
    // 防止同一任务快速重复点击
    if (this._pendingToggleSet.has(taskId)) return
    this._pendingToggleSet.add(taskId)

    const task = TaskManager.getTaskById(taskId)
    if (!task) {
      this._pendingToggleSet.delete(taskId)
      return
    }

    const newCompleted = !task.completed

    // 先更新 UI 状态，触发对勾动画
    this.updateTaskStatusInUI(taskId, newCompleted, true)

    // 异步更新数据库
    TaskManager.toggleComplete(taskId)

    // 等待对勾动画完成后，触发淡出动画（0.4s）
    setTimeout(() => {
      this.triggerFadeOut(taskId)
    }, 400)

    // 等待淡出动画完成后，重新加载列表（0.4s + 0.4s = 0.8s）
    setTimeout(() => {
      this._pendingToggleSet.delete(taskId)
      this.loadTasks()
    }, 800)
  },

  // 触发淡出动画
  triggerFadeOut(taskId) {
    if (this.data.filter === 'quadrant') {
      const quadrantTasks = { ...this.data.quadrantTasks }
      for (const key of Object.keys(quadrantTasks)) {
        quadrantTasks[key] = quadrantTasks[key].map(task =>
          task.id === taskId ? { ...task, fadeOut: true } : task
        )
      }
      this.setData({ quadrantTasks })
    } else {
      const taskGroups = this.data.taskGroups.map(group => ({
        ...group,
        tasks: group.tasks.map(task =>
          task.id === taskId ? { ...task, fadeOut: true } : task
        )
      }))
      this.setData({ taskGroups })
    }
  },

  // 更新 UI 中的任务状态（不重新加载）
  updateTaskStatusInUI(taskId, completed, animate = false) {
    if (this.data.filter === 'quadrant') {
      const quadrantTasks = { ...this.data.quadrantTasks }
      for (const key of Object.keys(quadrantTasks)) {
        quadrantTasks[key] = quadrantTasks[key].map(task =>
          task.id === taskId ? { ...task, completed, animateIcon: animate } : task
        )
      }
      this.setData({ quadrantTasks })
    } else {
      const taskGroups = this.data.taskGroups.map(group => ({
        ...group,
        tasks: group.tasks.map(task =>
          task.id === taskId ? { ...task, completed, animateIcon: animate } : task
        )
      }))
      this.setData({ taskGroups })
    }
  }
})
