const TaskManager = require('../../utils/task')
const ThemeManager = require('../../utils/theme')
const StorageManager = require('../../utils/storage-manager')
let syncManager = null

try {
  syncManager = require('../../utils/sync-manager')
} catch (error) {
  console.warn('Sync manager not available:', error)
}

Page({
  data: {
    version: '1.0.0',
    currentYear: new Date().getFullYear(),
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      importantTasks: 0,
      completionRate: 0
    },
    progressWidth: '0%',
    settings: {
      notifications: true,
      darkMode: false
    },
    userInfo: {
      avatar: '',
      nickname: '用户'
    },
    otherItems: [
      {
        icon: 'ℹ️',
        title: '关于我们',
        subtitle: '版本 1.0.0',
        action: 'showAbout'
      },
      {
        icon: '💬',
        title: '意见反馈',
        subtitle: '发送反馈建议',
        action: 'showFeedback'
      },
      {
        icon: '❤️',
        title: '给个好评',
        subtitle: '支持我们',
        action: 'showRate'
      },
      {
        icon: '🤝',
        title: '分享应用',
        subtitle: '分享给好友',
        action: 'shareApp'
      }
    ]
  },

  onLoad() {
    this.setData({
      'otherItems[0].subtitle': '版本 ' + this.data.version
    });
    this.loadStats();
    this.loadSettings();
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    try {
      // 尝试从存储中获取用户信息
      const storedUserInfo = StorageManager.get(StorageManager.KEYS.USER_INFO);
      if (storedUserInfo && storedUserInfo.avatar) {
        this.setData({
          userInfo: storedUserInfo
        });
      } else {
        // wx.getUserProfile 已废弃，使用按钮组件 open-type 获取
        // 此处不再自动调用，依赖页面中 button[open-type="chooseAvatar"] 等方式
        console.log('用户信息需通过头像昵称填写能力获取');
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  },

  onShow() {
    // 设置自定义 TabBar 选中状态和暗色模式
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().update(3, this.data.settings.darkMode)
    }
    this.loadStats();
  },

  // 加载统计
  loadStats() {
    const stats = TaskManager.getStats();
    const completionRate = stats.total > 0
      ? Math.round((stats.completed / stats.total) * 100)
      : 0;

    this.setData({
      stats: {
        totalTasks: stats.total,
        completedTasks: stats.completed,
        pendingTasks: stats.pending,
        importantTasks: stats.important,
        completionRate: completionRate
      },
      progressWidth: completionRate + '%'
    });
  },

  // 加载设置
  loadSettings() {
    try {
      const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {
        notifications: true,
        darkMode: false,
        weekStartDay: 1
      });

      // 确保 weekStartDay 在有效范围内 (0-6)
      let needSave = false;
      if (settings.weekStartDay === undefined || settings.weekStartDay === null ||
          settings.weekStartDay < 0 || settings.weekStartDay > 6) {
        settings.weekStartDay = 1; // 默认周一
        needSave = true;
      }

      // 如果需要保存修正后的值
      if (needSave) {
        StorageManager.set(StorageManager.KEYS.SETTINGS, settings);
      }

      this.setData({ settings });
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  },

  // 保存设置
  saveSettings() {
    try {
      StorageManager.set(StorageManager.KEYS.SETTINGS, this.data.settings);
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  },

  // 切换通知
  toggleNotifications() {
    this.setData({
      'settings.notifications': !this.data.settings.notifications
    });
    this.saveSettings();
    wx.showToast({
      title: this.data.settings.notifications ? '已开启通知' : '已关闭通知',
      icon: 'success'
    });
  },

  // 切换深色模式
  toggleDarkMode() {
    const enabled = ThemeManager.toggle()
    this.setData({ 'settings.darkMode': enabled })
    wx.showToast({
      title: '深色模式' + (enabled ? '已开启' : '已关闭'),
      icon: 'success'
    })
  },

  // 更改一周起始日 (已迁移到 calendar-settings 页面)

  // 其他项点击处理（白名单映射，防止动态 dispatch 安全风险）
  handleOtherTap(e) {
    const action = e.currentTarget.dataset.action;
    const ACTIONS = {
      showAbout: () => this.showAbout(),
      showFeedback: () => this.showFeedback(),
      showRate: () => this.showRate(),
      shareApp: () => this.shareApp()
    };
    if (ACTIONS[action]) {
      ACTIONS[action]();
    }
  },

  // ==================== 数据管理入口 ====================

  // 主题设置
  showThemeSettings() {
    wx.showModal({
      title: '主题设置',
      content: '更多主题功能即将上线,敬请期待!',
      showCancel: false,
      confirmText: '确定'
    });
  },

  // 通知设置
  showNotificationSettings() {
    wx.showModal({
      title: '通知设置',
      content: '可以在下方快速开关通知功能',
      showCancel: false,
      confirmText: '确定'
    });
  },

  // 关于
  showAbout() {
    wx.showModal({
      title: '关于 WeChat-Todo',
      content: 'WeChat-Todo 是一个简洁高效的任务管理小程序\n\n版本: ' + this.data.version + '\n\n核心功能:\n✨ 任务管理\n📅 日历视图\n🎯 象限视图\n🔔 智能提醒\n📊 数据统计',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 意见反馈
  showFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '感谢您的反馈!\n\n请将您的意见和建议发送至:\nfeedback@wechat-todo.com\n\n我们会认真对待每一条反馈!',
      showCancel: false,
      confirmText: '好的'
    });
  },

  // 给个好评
  showRate() {
    wx.showModal({
      title: '感谢支持',
      content: '感谢您的使用!\n\n如果觉得有用,请给我们一个好评,\n您的支持是我们进步的动力! ❤️',
      showCancel: false,
      confirmText: '好的'
    });
  },

  // 分享应用
  shareApp() {
    wx.showModal({
      title: '分享应用',
      content: 'WeChat-Todo - 让任务管理更简单高效!\n\n支持:\n✅ 任务管理\n✅ 日历视图\n✅ 智能提醒\n\n快来体验吧!',
      showCancel: true,
      confirmText: '复制分享文案',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: 'WeChat-Todo - 让任务管理更简单高效! 推荐给你~',
            success: () => {
              wx.showToast({
                title: '已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  // ==================== 子页面导航 ====================

  goCalendarSettings() {
    wx.navigateTo({ url: '/pages/calendar-settings/index' })
  },

  goCalculatorSettings() {
    wx.navigateTo({ url: '/pages/calculator-settings/index' })
  },

  goDataManage() {
    wx.navigateTo({ url: '/pages/data-manage/index' })
  }
});
