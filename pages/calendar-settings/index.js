const StorageManager = require('../../utils/storage-manager')

Page({
  data: {
    darkMode: false,
    weekStartDay: 1,
    showCompleted: false,
    weekDays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  },

  onLoad() {
    const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
    const calendarSettings = StorageManager.get('calendar_settings', {})
    this.setData({
      darkMode: !!settings.darkMode,
      weekStartDay: settings.weekStartDay !== undefined ? settings.weekStartDay : 1,
      showCompleted: !!calendarSettings.showCompleted
    })
  },

  // 切换一周起始日
  changeWeekStartDay(e) {
    const index = Number(e.detail.value)
    this.setData({ weekStartDay: index })
    this._saveGlobalSetting('weekStartDay', index)
    wx.showToast({
      title: '已设置为' + this.data.weekDays[index],
      icon: 'success'
    })
  },

  // 切换显示已完成任务
  toggleShowCompleted() {
    const value = !this.data.showCompleted
    this.setData({ showCompleted: value })
    this._saveCalendarSetting('showCompleted', value)
    wx.showToast({
      title: value ? '已显示已完成任务' : '已隐藏已完成任务',
      icon: 'success'
    })
  },

  _saveGlobalSetting(key, value) {
    const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
    settings[key] = value
    StorageManager.set(StorageManager.KEYS.SETTINGS, settings)
  },

  _saveCalendarSetting(key, value) {
    const calendarSettings = StorageManager.get('calendar_settings', {})
    calendarSettings[key] = value
    StorageManager.set('calendar_settings', calendarSettings)
  }
})
