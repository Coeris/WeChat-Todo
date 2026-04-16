Component({
  data: {
    selected: 0,
    darkMode: false,
    list: [
      {
        pagePath: 'pages/task/index',
        iconPath: '/assets/icons/task.png',
        selectedIconPath: '/assets/icons/task-active.png'
      },
      {
        pagePath: 'pages/calendar/index',
        iconPath: '/assets/icons/calendar.png',
        selectedIconPath: '/assets/icons/calendar-active.png'
      },
      {
        pagePath: 'pages/calculator/index',
        iconPath: '/assets/icons/calculator.png',
        selectedIconPath: '/assets/icons/calculator-active.png'
      },
      {
        pagePath: 'pages/settings/index',
        iconPath: '/assets/icons/settings.png',
        selectedIconPath: '/assets/icons/settings-active.png'
      }
    ]
  },

  methods: {
    /** 切换 tab 或触发 retap 回调 */
    switchTab(e) {
      const index = e.currentTarget.dataset.index
      const path = e.currentTarget.dataset.path

      if (this.data.selected === index) {
        const app = getApp()
        if (app._tabRetapCallbacks && app._tabRetapCallbacks[path]) {
          app._tabRetapCallbacks[path]()
        }
      } else {
        wx.switchTab({ url: '/' + path })
      }
    },

    /**
     * 供各页面调用，同步选中索引和暗色模式
     * @param {number} index - tab 索引
     * @param {boolean} darkMode - 是否暗色模式
     */
    update(index, darkMode) {
      this.setData({ selected: index, darkMode: !!darkMode })
    }
  }
})
