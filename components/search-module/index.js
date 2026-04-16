const TaskManager = require('../../utils/task')

Component({
  data: {
    keyword: '',
    results: []
  },

  methods: {
    onInput(e) {
      const keyword = e.detail.value.trim()
      this.setData({ keyword })
      this._doSearch(keyword)
    },

    onConfirm() {
      this._doSearch(this.data.keyword.trim())
    },

    onClear() {
      this.setData({ keyword: '', results: [] })
    },

    onResultTap(e) {
      const { id } = e.currentTarget.dataset
      wx.navigateTo({
        url: `/pages/task/edit/index?id=${id}`
      })
    },

    _doSearch(keyword) {
      if (keyword) {
        const results = TaskManager.searchTasks(keyword)
        this.setData({
          results: results.map(t => ({
            ...t,
            startTimeDisplay: t.startTime ? TaskManager.formatTime(t.startTime) : ''
          }))
        })
      } else {
        this.setData({ results: [] })
      }
    }
  }
})
