const TaskManager = require('../../utils/task')
const ThemeManager = require('../../utils/theme')
const StorageManager = require('../../utils/storage-manager')
const TaskModel = require('../../models/task-model')
const FileManager = require('../../utils/file-manager')
let syncManager = null

try {
  syncManager = require('../../utils/sync-manager')
} catch (error) {
  console.warn('Sync manager not available:', error)
}

Page({
  data: {
    darkMode: false,
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      importantTasks: 0,
      completionRate: 0,
      todayTasks: 0,
      weekTasks: 0,
      overdueTasks: 0
    },
    storageUsage: { used: 0, limit: 0, percentage: '0' },
    // WebDAV配置
    webdav: {
      url: '',
      username: '',
      password: '',
      path: '/WeChat-Todo/',
      autoSync: true
    },
    webdavStatus: {
      configured: false,
      lastSyncTime: null,
      autoSync: true
    },
    showStatsModal: false,
    showWebDAVModal: false
  },

  onLoad() {
    const settings = StorageManager.get(StorageManager.KEYS.SETTINGS, {})
    this.setData({ darkMode: !!settings.darkMode })
    this.loadStats()
    this.loadStorageUsage()
    this.loadWebDAVConfig()
    this.loadWebDAVStatus()
  },

  onShow() {
    this.loadStats()
    this.loadStorageUsage()
    this.loadWebDAVStatus()
  },

  // 加载统计
  loadStats() {
    const stats = TaskManager.getStats()
    const completionRate = stats.total > 0
      ? Math.round((stats.completed / stats.total) * 100)
      : 0
    const todayTasks = TaskManager.getTodayTasks()
    const weekTasks = TaskManager.getWeekTasks()
    const overdueTasks = TaskManager.getOverdueTasks()

    this.setData({
      stats: {
        totalTasks: stats.total,
        completedTasks: stats.completed,
        pendingTasks: stats.pending,
        importantTasks: stats.important,
        completionRate: completionRate,
        todayTasks: todayTasks.length,
        weekTasks: weekTasks.length,
        overdueTasks: overdueTasks.length
      }
    })
  },

  // 加载存储占用
  loadStorageUsage() {
    const usage = StorageManager.getUsage()
    if (usage) {
      this.setData({ storageUsage: usage })
    }
  },

  // 加载WebDAV配置
  loadWebDAVConfig() {
    try {
      const config = StorageManager.get(StorageManager.KEYS.WEBDAV_CONFIG, {})
      this.setData({
        webdav: {
          url: config.url || '',
          username: config.username || '',
          password: config.password || '',
          path: config.path || '/WeChat-Todo/',
          autoSync: config.autoSync !== false
        }
      })
    } catch (error) {
      console.error('加载WebDAV配置失败:', error)
    }
  },

  // 加载WebDAV状态
  loadWebDAVStatus() {
    try {
      if (syncManager) {
        const status = syncManager.getStatus()
        this.setData({
          webdavStatus: {
            configured: status.configured,
            lastSyncTime: status.lastSyncTime,
            autoSync: status.autoSync
          }
        })
      } else {
        const config = StorageManager.get(StorageManager.KEYS.WEBDAV_CONFIG, {})
        this.setData({
          webdavStatus: {
            configured: !!(config.url && config.username && config.password),
            lastSyncTime: null,
            autoSync: config.autoSync !== false
          }
        })
      }
    } catch (error) {
      console.error('加载WebDAV状态失败:', error)
      this.setData({
        webdavStatus: {
          configured: false,
          lastSyncTime: null,
          autoSync: true
        }
      })
    }
  },

  // ==================== 导出 / 导入 ====================

  // 导出数据
  exportData() {
    try {
      const tasks = TaskManager.getTasks()
      if (tasks.length === 0) {
        wx.showToast({ title: '暂无数据可导出', icon: 'none' })
        return
      }

      // 收集所有任务（含子任务）的附件信息
      const allTasks = TaskModel.getAll()
      const attachmentMap = {} // path -> base64
      const MAX_ATTACHMENT_SIZE = 500 * 1024 // 500KB 以下的附件嵌入导出
      const MAX_TOTAL_SIZE = 5 * 1024 * 1024 // 导出总附件不超过 5MB

      let totalAttachmentSize = 0
      const fs = wx.getFileSystemManager()

      allTasks.forEach(task => {
        if (!task.attachments || !Array.isArray(task.attachments)) return
        task.attachments.forEach(att => {
          if (!att || !att.path || !att.path.startsWith(wx.env.USER_DATA_PATH)) return
          if (attachmentMap[att.path]) return // 已处理过

          try {
            const stat = fs.statSync(att.path)
            if (stat.size > MAX_ATTACHMENT_SIZE) return // 超过单文件上限
            if (totalAttachmentSize + stat.size > MAX_TOTAL_SIZE) return // 超过总大小上限

            const base64 = fs.readFileSync(att.path, 'base64')
            attachmentMap[att.path] = {
              data: base64,
              type: att.type || 'unknown',
              size: stat.size,
              name: att.name || ''
            }
            totalAttachmentSize += stat.size
          } catch (e) {
            // 文件读取失败，跳过
            console.warn('导出附件失败，跳过:', att.path, e)
          }
        })
      })

      // 构建导出数据
      const exportObj = {
        version: 2, // v2: 包含附件数据
        exportTime: new Date().toISOString(),
        tasks: allTasks,
        attachments: Object.keys(attachmentMap).length > 0 ? attachmentMap : undefined
      }

      const jsonStr = JSON.stringify(exportObj, null, 2)

      // 提示附件导出情况
      const embeddedCount = Object.keys(attachmentMap).length
      const totalRefCount = allTasks.reduce((sum, t) => sum + (t.attachments ? t.attachments.length : 0), 0)

      wx.showModal({
        title: '导出数据',
        content: embeddedCount > 0
          ? `共 ${allTasks.length} 个任务，${totalRefCount} 个附件\n已嵌入 ${embeddedCount} 个附件文件`
          : `共 ${allTasks.length} 个任务\n（附件文件较大，未嵌入导出）`,
        showCancel: true,
        confirmText: '继续导出',
        success: (modalRes) => {
          if (!modalRes.confirm) return
          this._doExport(jsonStr)
        }
      })
    } catch (error) {
      console.error('导出失败:', error)
      wx.showToast({ title: '导出失败', icon: 'error' })
    }
  },

  // 执行导出（提取为独立方法）
  _doExport(jsonStr) {
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/wechat_todo_backup_${Date.now()}.json`

    fs.writeFile({
      filePath,
      data: jsonStr,
      encoding: 'utf8',
      success: () => {
        wx.showActionSheet({
          itemList: ['保存到手机', '复制到剪贴板'],
          success: (res) => {
            if (res.tapIndex === 0) {
              wx.shareFileMessage({
                filePath,
                fileName: `wechat_todo_backup_${Date.now()}.json`,
                success: () => {
                  wx.showToast({ title: '保存成功', icon: 'success' })
                },
                fail: (err) => {
                  console.error('分享文件失败:', err)
                  wx.showToast({ title: '保存失败', icon: 'none' })
                }
              })
            } else {
              wx.setClipboardData({
                data: jsonStr,
                success: () => {
                  wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
                }
              })
            }
          }
        })
      },
      fail: () => {
        wx.setClipboardData({
          data: jsonStr,
          success: () => {
            wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
          }
        })
      }
    })
  },

  // 导入数据
  importData() {
    wx.showActionSheet({
      itemList: ['从剪贴板导入'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.getClipboardData({
            success: (clipRes) => {
              if (!clipRes.data) {
                wx.showToast({ title: '剪贴板为空', icon: 'none' })
                return
              }
              this._doImport(clipRes.data)
            },
            fail: () => {
              wx.showToast({ title: '读取剪贴板失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  // 执行导入（提取为独立方法，支持 v1/v2 格式）
  _doImport(dataStr) {
    try {
      const parsed = JSON.parse(dataStr)
      let tasks = []
      let attachmentData = null

      // v2 格式：{version, tasks, attachments}
      if (parsed.version === 2 && Array.isArray(parsed.tasks)) {
        tasks = parsed.tasks
        attachmentData = parsed.attachments || null
      }
      // v1 格式：纯数组
      else if (Array.isArray(parsed)) {
        tasks = parsed
      }
      else {
        wx.showToast({ title: '不支持的导入格式', icon: 'none' })
        return
      }

      // 过滤并清洗任务数据
      tasks = tasks.filter(t => t && typeof t === 'object').map(t => ({
        ...t,
        id: String(t.id || ''),
        title: String(t.title || '').slice(0, 100),
        notes: typeof t.notes === 'string' ? t.notes.slice(0, 1000) : '',
        priority: typeof t.priority === 'number' ? Math.min(Math.max(t.priority, 0), 3) : 0,
        completed: !!t.completed,
        important: !!t.important,
        attachments: Array.isArray(t.attachments) ? t.attachments : []
      }))

      if (tasks.length === 0) {
        wx.showToast({ title: '导入数据为空', icon: 'none' })
        return
      }

      // 如果有附件数据，先恢复附件文件
      let restoredAttachments = 0
      if (attachmentData) {
        restoredAttachments = this._restoreAttachments(attachmentData, tasks)
      }

      wx.showModal({
        title: '确认导入',
        content: `将导入 ${tasks.length} 个任务` +
          (restoredAttachments > 0 ? `，${restoredAttachments} 个附件文件` : '') +
          '（不会覆盖已有任务），确定继续？',
        success: (modalRes) => {
          if (modalRes.confirm) {
            wx.showLoading({ title: '导入中...' })
            let importedCount = 0
            tasks.forEach(task => {
              if (TaskModel.add(task)) {
                importedCount++
              }
            })
            wx.hideLoading()
            wx.showToast({
              title: `成功导入 ${importedCount} 个任务`,
              icon: 'success'
            })
            this.loadStats()
            this.loadStorageUsage()
          }
        }
      })
    } catch (error) {
      console.error('导入失败:', error)
      wx.showToast({ title: '导入失败: 格式错误', icon: 'none' })
    }
  },

  // 恢复嵌入的附件文件到本地存储
  _restoreAttachments(attachmentData, tasks) {
    const fs = wx.getFileSystemManager()
    let restoredCount = 0
    const pathMapping = {} // 旧路径 -> 新路径

    // 收集任务中引用的附件路径
    const referencedPaths = new Set()
    tasks.forEach(task => {
      if (task.attachments && Array.isArray(task.attachments)) {
        task.attachments.forEach(att => {
          if (att && att.path) referencedPaths.add(att.path)
        })
      }
    })

    // 恢复文件
    Object.keys(attachmentData).forEach(oldPath => {
      if (!referencedPaths.has(oldPath)) return // 不被任何任务引用，跳过
      if (!attachmentData[oldPath] || !attachmentData[oldPath].data) return

      try {
        // 生成新的本地路径
        const extMatch = oldPath.match(/\.[^.]+$/)
        const ext = extMatch ? extMatch[0] : '.dat'
        const newPath = FileManager.BASE_DIR + '/restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext

        // 写入文件
        fs.writeFileSync(newPath, attachmentData[oldPath].data, 'base64')
        pathMapping[oldPath] = newPath
        restoredCount++
      } catch (e) {
        console.error('恢复附件文件失败:', oldPath, e)
      }
    })

    // 更新任务中的附件路径
    if (Object.keys(pathMapping).length > 0) {
      tasks.forEach(task => {
        if (!task.attachments || !Array.isArray(task.attachments)) return
        task.attachments.forEach(att => {
          if (att && att.path && pathMapping[att.path]) {
            att.path = pathMapping[att.path]
          }
        })
      })
    }

    return restoredCount
  },

  // ==================== 清除 ====================

  // 清除已完成任务
  clearCompletedTasks() {
    const tasks = TaskManager.getTasks()
    const completedCount = tasks.filter(t => t.completed).length

    if (completedCount === 0) {
      wx.showToast({ title: '没有已完成的任务', icon: 'none' })
      return
    }

    wx.showModal({
      title: '清除已完成任务',
      content: `确定要删除 ${completedCount} 个已完成的任务吗？此操作不可撤销。`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          const completedIds = tasks.filter(t => t.completed).map(t => t.id)
          const successCount = TaskManager.batchDeleteTasks(completedIds)
          wx.showToast({
            title: `已清除 ${successCount} 个任务`,
            icon: 'success'
          })
          this.loadStats()
          this.loadStorageUsage()
        }
      }
    })
  },

  // 清空所有数据
  clearAllData() {
    wx.showModal({
      title: '清空所有数据',
      content: '确定要清空所有任务数据吗？此操作不可撤销！',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '再次确认',
            content: '真的要删除所有数据吗？请三思！',
            confirmColor: '#ff4d4f',
            success: (res2) => {
              if (res2.confirm) {
                try {
                  const tasks = TaskManager.getTasks()
                  const ids = tasks.map(t => t.id)
                  TaskManager.batchDeleteTasks(ids)
                  wx.showToast({ title: '数据已清空', icon: 'success' })
                  this.loadStats()
                  this.loadStorageUsage()
                } catch (error) {
                  console.error('清空数据失败:', error)
                  wx.showToast({ title: '操作失败', icon: 'error' })
                }
              }
            }
          })
        }
      }
    })
  },

  // ==================== 数据统计 ====================

  showDetailedStats() {
    this.setData({ showStatsModal: true })
  },

  closeStatsModal() {
    this.setData({ showStatsModal: false })
  },

  // ==================== WebDAV 云同步 ====================

  showWebDAVSettings() {
    this.setData({ showWebDAVModal: true })
  },

  closeWebDAVModal() {
    this.setData({ showWebDAVModal: false })
  },

  // WebDAV输入处理
  handleWebDAVInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`webdav.${field}`]: value
    })
  },

  // 切换自动同步
  toggleAutoSync() {
    this.setData({
      'webdav.autoSync': !this.data.webdav.autoSync
    })
  },

  // 测试WebDAV连接
  async testWebDAVConnection() {
    if (!syncManager) {
      wx.showToast({ title: '同步功能不可用', icon: 'none' })
      return
    }

    const { url, username, password } = this.data.webdav

    if (!url || !username || !password) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    wx.showLoading({ title: '测试连接中...' })

    try {
      const result = await syncManager.testConnection()
      wx.hideLoading()

      if (result.success) {
        wx.showModal({
          title: '连接成功',
          content: 'WebDAV连接测试成功!',
          showCancel: false,
          confirmText: '确定'
        })
      } else {
        wx.showModal({
          title: '连接失败',
          content: result.message || '请检查您的配置信息',
          showCancel: false,
          confirmText: '确定'
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('测试连接失败:', error)
      wx.showModal({
        title: '连接失败',
        content: error.message || '请检查您的配置信息',
        showCancel: false,
        confirmText: '确定'
      })
    }
  },

  // 保存WebDAV配置
  saveWebDAVConfig() {
    const { url, username, password, path, autoSync } = this.data.webdav

    if (!url || !username || !password) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    const config = {
      url: url.trim(),
      username: username.trim(),
      password: password.trim(),
      path: path.trim() || '/WeChat-Todo/',
      autoSync: autoSync
    }

    if (!syncManager) {
      try {
        StorageManager.set(StorageManager.KEYS.WEBDAV_CONFIG, config)
        wx.showToast({ title: '配置保存成功', icon: 'success' })
        this.closeWebDAVModal()
        this.loadWebDAVStatus()
      } catch (error) {
        console.error('保存配置失败:', error)
        wx.showToast({ title: '配置保存失败', icon: 'error' })
      }
      return
    }

    const result = syncManager.saveConfig(config)
    if (result.success) {
      wx.showToast({ title: '配置保存成功', icon: 'success' })
      this.closeWebDAVModal()
      this.loadWebDAVStatus()
    } else {
      wx.showToast({ title: result.message || '配置保存失败', icon: 'error' })
    }
  },

  // 手动同步
  async manualSync() {
    if (!syncManager) {
      wx.showToast({ title: '同步功能不可用', icon: 'none' })
      return
    }

    try {
      await syncManager.manualSync()
      this.loadWebDAVStatus()
    } catch (error) {
      console.error('同步失败:', error)
      wx.showToast({ title: '同步失败', icon: 'error' })
    }
  },

  // 清除WebDAV配置
  clearWebDAVConfig() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清除WebDAV配置吗?',
      confirmColor: '#ff4d4f',
      confirmText: '确认清除',
      success: (res) => {
        if (res.confirm) {
          if (!syncManager) {
            try {
              StorageManager.remove(StorageManager.KEYS.WEBDAV_CONFIG)
              StorageManager.remove(StorageManager.KEYS.SYNC_STATUS)
              wx.showToast({ title: '配置已清除', icon: 'success' })
              this.loadWebDAVConfig()
              this.loadWebDAVStatus()
            } catch (error) {
              console.error('清除配置失败:', error)
              wx.showToast({ title: '清除失败', icon: 'error' })
            }
            return
          }

          const result = syncManager.clearConfig()
          if (result.success) {
            wx.showToast({ title: '配置已清除', icon: 'success' })
            this.loadWebDAVConfig()
            this.loadWebDAVStatus()
          } else {
            wx.showToast({ title: result.message || '清除失败', icon: 'error' })
          }
        }
      }
    })
  }
})
