// 同步管理器 - 处理WebDAV和本地存储之间的同步
const TaskModel = require('../models/task-model');
const webdav = require('./webdav.js');
const StorageManager = require('./storage-manager');
const { safeParseDate } = require('./helpers');

class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.lastSyncTime = null;
    this.autoSyncEnabled = true;
    this.syncInterval = 60000; // 60秒自动同步一次
    this.syncTimer = null;
  }

  // 初始化
  init() {
    this.loadConfig();
    this.loadSyncStatus();

    if (this.autoSyncEnabled && this.isConfigured()) {
      this.startAutoSync();
    }
  }

  // 加载配置
  loadConfig() {
    try {
      const config = StorageManager.get(StorageManager.KEYS.WEBDAV_CONFIG, {});
      if (config.url && config.username && config.password) {
        webdav.updateConfig(config);
        this.autoSyncEnabled = config.autoSync !== false;
        console.log('WebDAV 配置加载成功');
      }
    } catch (error) {
      console.error('加载WebDAV配置失败:', error);
    }
  }

  // 保存配置
  saveConfig(config) {
    try {
      webdav.updateConfig(config);
      StorageManager.set(StorageManager.KEYS.WEBDAV_CONFIG, config);

      if (config.autoSync !== false && this.isConfigured()) {
        this.startAutoSync();
      } else {
        this.stopAutoSync();
      }

      return { success: true, message: '配置保存成功' };
    } catch (error) {
      console.error('保存配置失败:', error);
      return { success: false, message: '配置保存失败' };
    }
  }

  // 检查是否已配置
  isConfigured() {
    const config = StorageManager.get(StorageManager.KEYS.WEBDAV_CONFIG, {});
    return !!(config.url && config.username && config.password);
  }

  // 加载同步状态
  loadSyncStatus() {
    try {
      const status = StorageManager.get(StorageManager.KEYS.SYNC_STATUS, {});
      this.lastSyncTime = status.lastSyncTime;
      console.log('同步状态加载成功', status);
    } catch (error) {
      console.error('加载同步状态失败:', error);
    }
  }

  // 保存同步状态
  async saveSyncStatus() {
    try {
      const status = {
        lastSyncTime: this.lastSyncTime,
        autoSyncEnabled: this.autoSyncEnabled
      };
      StorageManager.set(StorageManager.KEYS.SYNC_STATUS, status);
      try {
        await webdav.updateSyncStatus(status);
      } catch (e) {
        // WebDAV 上传状态失败不影响本地保存
        console.warn('上传同步状态到远程失败:', e);
      }
    } catch (error) {
      console.error('保存同步状态失败:', error);
    }
  }

  // 开始自动同步
  startAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    this.syncTimer = setInterval(() => {
      this.sync();
    }, this.syncInterval);
    console.log('自动同步已启动');
  }

  // 停止自动同步
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    console.log('自动同步已停止');
  }

  // 测试连接
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, message: '请先配置WebDAV' };
    }
    return await webdav.testConnection();
  }

  // 同步数据
  async sync(options = {}) {
    const { direction = 'both', force = false } = options;

    if (this.syncInProgress) {
      return { success: false, message: '同步正在进行中' };
    }

    if (!this.isConfigured()) {
      return { success: false, message: '请先配置WebDAV' };
    }

    this.syncInProgress = true;

    try {
      // 获取本地数据
      const localTasks = TaskModel.getAll();
      const localSyncTime = this.lastSyncTime;

      // 获取远程数据
      const remoteResult = await webdav.loadTasks();
      const remoteTasks = remoteResult.success && remoteResult.data ? remoteResult.data.tasks : [];
      const remoteSyncTime = remoteResult.success && remoteResult.data ? remoteResult.data.syncTime : null;

      let mergedTasks = [];
      let syncMessage = '';

      if (direction === 'both' || direction === 'upload') {
        // 上传本地数据
        if (force || !remoteSyncTime || safeParseDate(localSyncTime) > safeParseDate(remoteSyncTime)) {
          const uploadResult = await webdav.syncTasks(localTasks);
          if (uploadResult.success) {
            syncMessage += '本地数据上传成功 ';
          } else {
            throw new Error(uploadResult.message);
          }
        } else {
          syncMessage += '远程数据较新，跳过上传 ';
        }
      }

      if (direction === 'both' || direction === 'download') {
        // 下载远程数据
        if (force || !localSyncTime || safeParseDate(remoteSyncTime) > safeParseDate(localSyncTime)) {
          if (remoteTasks.length > 0) {
            // 合并数据
            mergedTasks = this.mergeTasks(localTasks, remoteTasks);
            TaskModel.replaceAll(mergedTasks);
            syncMessage += '远程数据下载成功 ';
          }
        } else {
          syncMessage += '本地数据较新，跳过下载 ';
        }
      }

      // 更新同步时间
      this.lastSyncTime = new Date().toISOString();
      this.saveSyncStatus();

      return {
        success: true,
        message: syncMessage || '同步成功',
        data: {
          localCount: localTasks.length,
          remoteCount: remoteTasks.length,
          mergedCount: mergedTasks.length || localTasks.length,
          syncTime: this.lastSyncTime
        }
      };

    } catch (error) {
      console.error('同步失败:', error);
      return {
        success: false,
        message: error.message || '同步失败'
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  // 合并任务列表（带冲突检测）
  mergeTasks(localTasks, remoteTasks) {
    const taskMap = new Map();

    // 添加本地任务
    localTasks.forEach(task => {
      taskMap.set(task.id, task);
    });

    // 合并远程任务（优先使用 updateTime 更新的任务）
    remoteTasks.forEach(task => {
      const existingTask = taskMap.get(task.id);
      if (existingTask) {
        // 比较更新时间
        const localUpdate = safeParseDate(existingTask.updateTime || existingTask.createTime);
        const remoteUpdate = safeParseDate(task.updateTime || task.createTime);

        // 冲突检测：时间差在 60 秒内视为潜在冲突
        const timeDiff = Math.abs(remoteUpdate - localUpdate);
        if (timeDiff < 60000 && localUpdate.getTime() !== remoteUpdate.getTime()) {
          console.warn(
            '[Sync] 检测到冲突: 任务 "' + (task.title || task.id) + '" 在两端被同时修改',
            { localUpdate: existingTask.updateTime, remoteUpdate: task.updateTime }
          );
        }

        if (remoteUpdate > localUpdate) {
          taskMap.set(task.id, task);
        }
      } else {
        taskMap.set(task.id, task);
      }
    });

    return Array.from(taskMap.values()).sort((a, b) => {
      const timeA = safeParseDate(a.createTime);
      const timeB = safeParseDate(b.createTime);
      return timeB - timeA;
    });
  }

  // 获取同步状态
  getStatus() {
    return {
      configured: this.isConfigured(),
      autoSync: this.autoSyncEnabled,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress
    };
  }

  // 启用/禁用自动同步
  setAutoSync(enabled) {
    this.autoSyncEnabled = enabled;
    const config = StorageManager.get(StorageManager.KEYS.WEBDAV_CONFIG, {});
    config.autoSync = enabled;
    this.saveConfig(config);

    if (enabled && this.isConfigured()) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  // 清除配置
  clearConfig() {
    try {
      StorageManager.remove(StorageManager.KEYS.WEBDAV_CONFIG);
      StorageManager.remove(StorageManager.KEYS.SYNC_STATUS);
      this.stopAutoSync();
      this.lastSyncTime = null;

      return { success: true, message: '配置已清除' };
    } catch (error) {
      console.error('清除配置失败:', error);
      return { success: false, message: '清除配置失败' };
    }
  }

  // 手动触发同步
  async manualSync() {
    wx.showLoading({ title: '同步中...' });
    const result = await this.sync({ direction: 'both', force: false });
    wx.hideLoading();

    if (result.success) {
      wx.showToast({
        title: result.message,
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: result.message,
        icon: 'none'
      });
    }

    return result;
  }
}

// 创建全局实例
const syncManager = new SyncManager();

module.exports = syncManager;
