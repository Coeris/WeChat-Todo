// app.js
const NotificationManager = require('./utils/notification')
const syncManager = require('./utils/sync-manager')
const StorageManager = require('./utils/storage-manager')
const TaskModel = require('./models/task-model')
const ThemeManager = require('./utils/theme')
const FileManager = require('./utils/file-manager')

App({
  globalData: {
    userInfo: null,
    dbReady: false,
    darkMode: false
  },

  notificationTimer: null,

  onLaunch: function () {
    // 初始化主题
    this.initTheme();

    // 初始化本地存储（不包含旧版 tasks 键，月度分表已接管）
    this.initStorage();

    // 初始化任务模型
    this.initTaskModel();

    // 清理孤立的附件文件
    this.cleanOrphanFiles();

    // 初始化同步管理器
    this.initSync();

    // 检查通知
    this.checkNotifications();

    // 初始化通知检查定时器
    this.startNotificationCheck();
  },

  // 初始化主题
  initTheme() {
    try {
      ThemeManager.init();
      this.globalData.darkMode = ThemeManager.isDarkMode();
    } catch (error) {
      console.error('初始化主题失败:', error);
    }
  },

  // 初始化存储
  initStorage() {
    try {
      const defaults = {
        [StorageManager.KEYS.ATTACHMENTS]: {},
        [StorageManager.KEYS.CALENDAR_EVENTS]: [],
        [StorageManager.KEYS.NOTIFICATIONS]: []
      };

      StorageManager.initDefaults(defaults);
      console.log('存储初始化完成');
    } catch (error) {
      console.error('初始化存储失败:', error);
    }
  },

  // 初始化任务模型
  initTaskModel() {
    try {
      TaskModel.init();
      this.globalData.dbReady = true;
      console.log('任务模型初始化完成');
    } catch (error) {
      console.error('初始化任务模型失败:', error);
    }
  },

  // 清理孤立的附件文件（不在任何任务中引用的文件）
  cleanOrphanFiles() {
    try {
      const allTasks = TaskModel.getAll();
      FileManager.cleanOrphanFiles(allTasks);
    } catch (error) {
      console.error('清理孤立文件失败:', error);
    }
  },

  // 初始化同步
  initSync() {
    try {
      syncManager.init();
      console.log('同步管理器已初始化');
    } catch (error) {
      console.error('初始化同步管理器失败:', error);
    }
  },

  // 检查通知
  checkNotifications() {
    try {
      const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {});
      if (settings.notifications === false) return;
      NotificationManager.checkAndTriggerNotifications();
    } catch (error) {
      console.error('检查通知失败:', error);
    }
  },

  // 启动通知检查定时器
  startNotificationCheck() {
    // 清除旧的定时器
    if (this.notificationTimer) {
      clearInterval(this.notificationTimer);
    }
    // 每分钟检查一次通知
    this.notificationTimer = setInterval(() => {
      this.checkNotifications();
    }, 60000);
  },

  onShow() {
    // 小程序显示时重新应用主题（可能设置页修改了）
    try {
      ThemeManager.apply();
      this.globalData.darkMode = ThemeManager.isDarkMode();
    } catch (e) { /* ignore */ }

    // 重启通知定时检查（onHide 时会停止）
    this.startNotificationCheck();

    // 触发一次同步（带节流）
    try {
      if (syncManager.isConfigured()) {
        const now = Date.now();
        if (!this._lastSyncTime || (now - this._lastSyncTime) > 30000) {
          this._lastSyncTime = now;
          syncManager.sync({ direction: 'both' });
        }
      }
    } catch (error) {
      console.error('同步失败:', error);
    }
  },

  onHide() {
    // 小程序隐藏时暂停通知检查
    if (this.notificationTimer) {
      clearInterval(this.notificationTimer);
      this.notificationTimer = null;
    }
  },

  onUnload() {
    // 小程序卸载时清理定时器
    if (this.notificationTimer) {
      clearInterval(this.notificationTimer);
      this.notificationTimer = null;
    }
  }
});
