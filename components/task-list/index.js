Component({
  properties: {
    tasks: {
      type: Array,
      value: []
    },
    showEmpty: {
      type: Boolean,
      value: true
    },
    emptyText: {
      type: String,
      value: '暂无任务'
    }
  },

  data: {
    deleteBtnWidth: 0
  },

  _openIndex: -1,
  _touchStartX: 0,
  _touchStartY: 0,
  _currentTranslateX: 0,
  _isHorizontal: null,
  _isSwiping: false,
  _wasSwiped: false,

  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo()
      // 100rpx 转 px（rpx基准为750）
      this.setData({ deleteBtnWidth: Math.round(100 * windowInfo.windowWidth / 750) })
    }
  },

  methods: {
    // 点击任务项
    onTaskClick(e) {
      // 滑动结束后忽略本次点击，防止误触
      if (this._wasSwiped) {
        this._wasSwiped = false
        return
      }
      // 如果有打开的滑动项，先关闭
      if (this._openIndex >= 0) {
        this._closeAllItems()
        return
      }
      const task = e.currentTarget.dataset.task
      this.triggerEvent('taskClick', { task })
    },

    // 切换任务状态
    toggleStatus(e) {
      if (this._openIndex >= 0) {
        this._closeAllItems()
        return
      }
      const task = e.currentTarget.dataset.task
      this.triggerEvent('statusChange', {
        task,
        completed: !task.completed
      })
    },

    // 切换优先级
    toggleImportant(e) {
      const { task } = e.currentTarget.dataset
      const newPriority = task.priority > 0 ? 0 : 1
      this.triggerEvent('importantChange', {
        task,
        priority: newPriority
      })
    },

    // 触摸开始
    onTouchStart(e) {
      const touch = e.touches[0]
      this._touchStartX = touch.clientX
      this._touchStartY = touch.clientY
      this._isHorizontal = null
      this._isSwiping = false
      this._wasSwiped = false

      const index = e.currentTarget.dataset.index
      this._currentTranslateX = this.data.tasks[index]._translateX || 0
    },

    // 触摸移动（使用 bind 允许 scroll-view 垂直滚动）
    onTouchMove(e) {
      const touch = e.touches[0]
      const deltaX = touch.clientX - this._touchStartX
      const deltaY = touch.clientY - this._touchStartY

      // 判断滑动方向（只在首次判定）
      if (this._isHorizontal === null) {
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          this._isHorizontal = Math.abs(deltaX) > Math.abs(deltaY)
        }
        return
      }

      // 非水平滑动不处理，让 scroll-view 处理垂直滚动
      if (!this._isHorizontal) return

      this._isSwiping = true
      const { deleteBtnWidth } = this.data
      const index = e.currentTarget.dataset.index
      let translateX = this._currentTranslateX + deltaX

      // 限制滑动范围（右滑露出左侧按钮）
      if (translateX < 0) translateX = 0
      if (translateX > deleteBtnWidth) translateX = deleteBtnWidth

      this._updateItemTranslateX(index, translateX, false)
    },

    // 触摸结束
    onTouchEnd(e) {
      if (this._isSwiping) {
        this._wasSwiped = true
      }

      if (!this._isHorizontal || !this._isSwiping) return

      const index = e.currentTarget.dataset.index
      const currentX = this.data.tasks[index]._translateX || 0
      const { deleteBtnWidth } = this.data

      // 如果不在当前打开项上滑动，先关闭已打开的
      if (this._openIndex >= 0 && this._openIndex !== index) {
        this._closeItem(this._openIndex)
      }

      // 判断是否超过阈值（按钮宽度的 40%）
      const threshold = deleteBtnWidth * 0.4
      if (currentX > threshold) {
        this._openItem(index, deleteBtnWidth)
      } else {
        this._closeItem(index)
      }
    },

    // 删除任务
    onDeleteTask(e) {
      const task = e.currentTarget.dataset.task
      this._closeAllItems()
      this.triggerEvent('deleteTask', { task })
    },

    // 关闭所有打开的项
    _closeAllItems() {
      if (this._openIndex >= 0) {
        this._closeItem(this._openIndex)
        this._openIndex = -1
      }
    },

    // 关闭指定项
    _closeItem(index) {
      this._updateItemTranslateX(index, 0, true)
      if (this._openIndex === index) {
        this._openIndex = -1
      }
    },

    // 打开指定项
    _openItem(index, translateX) {
      this._updateItemTranslateX(index, translateX, true)
      this._openIndex = index
    },

    // 更新单项的 translateX
    _updateItemTranslateX(index, translateX, withTransition) {
      const key = `tasks[${index}]._translateX`
      const transitionKey = `tasks[${index}]._transition`
      this.setData({
        [key]: translateX,
        [transitionKey]: withTransition
      })
    }
  }
})
