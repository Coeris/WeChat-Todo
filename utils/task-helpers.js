/**
 * 任务相关共享工具函数
 * 抽取自 edit/index 页面的公共逻辑
 */
const TaskManager = require('./task')
const FileHelper = require('./helpers').FileHelper

// 全局跟踪当前播放的音频上下文，便于页面卸载时清理
let _currentAudioContext = null

/**
 * 带子任务确认的删除流程
 * 有后代子任务时弹出两次确认，无子任务则一次确认
 * @param {string} taskId 任务ID
 * @param {string} taskTitle 任务标题
 * @param {Function} onConfirm 确认删除后的回调
 */
function confirmDeleteTask(taskId, taskTitle, onConfirm) {
  const descendantCount = TaskManager.getDescendantCount(taskId)
  if (descendantCount > 0) {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${taskTitle}」吗？`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '包含子任务',
            content: `该任务下有 ${descendantCount} 个子任务也将被删除，确定继续吗？`,
            confirmColor: '#ff4d4f',
            success: (res2) => {
              if (res2.confirm) {
                onConfirm()
              }
            }
          })
        }
      }
    })
  } else {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${taskTitle}」吗？`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          onConfirm()
        }
      }
    })
  }
}

/**
 * 简化版删除确认（无任务标题的场景）
 * @param {string} taskId 任务ID
 * @param {string} extraContent 额外提示内容（如"删除后无法恢复"）
 * @param {Function} onConfirm 确认删除后的回调
 */
function confirmDeleteTaskSimple(taskId, extraContent, onConfirm) {
  const descendantCount = TaskManager.getDescendantCount(taskId)

  if (descendantCount > 0) {
    wx.showModal({
      title: '确认删除',
      content: extraContent || '确定要删除这个任务吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '包含子任务',
            content: `该任务下有 ${descendantCount} 个子任务也将被删除，确定继续吗？`,
            confirmColor: '#ff4d4f',
            success: (res2) => {
              if (res2.confirm) {
                onConfirm()
              }
            }
          })
        }
      }
    })
  } else {
    wx.showModal({
      title: '确认删除',
      content: extraContent || '确定要删除这个任务吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          onConfirm()
        }
      }
    })
  }
}

/**
 * 预览附件（图片/语音/文档）
 * @param {Array} attachments 附件列表
 * @param {number} index 要预览的附件索引
 */
function previewAttachment(attachments, index) {
  const attachment = attachments[index]

  if (!attachment || !attachment.path) {
    wx.showToast({ title: '附件不存在', icon: 'none' })
    return
  }

  if (attachment.type === 'image') {
    const images = attachments
      .filter(a => a.type === 'image' && a.path)
      .map(a => a.path)

    if (images.length === 0) {
      wx.showToast({ title: '没有可预览的图片', icon: 'none' })
      return
    }

    wx.previewImage({
      current: attachment.path,
      urls: images,
      fail: (err) => {
        console.error('预览图片失败:', err)
        wx.showToast({ title: '预览失败', icon: 'none' })
      }
    })
  } else if (attachment.type === 'voice') {
    try {
      // 销毁之前的音频上下文（防止同时播放多个）
      if (_currentAudioContext) {
        _currentAudioContext.stop()
        _currentAudioContext.destroy()
        _currentAudioContext = null
      }
      const innerAudioContext = wx.createInnerAudioContext()
      _currentAudioContext = innerAudioContext
      innerAudioContext.src = attachment.path

      innerAudioContext.onPlay(() => {
        console.log('音频播放开始')
      })

      innerAudioContext.onError((err) => {
        console.error('音频播放错误:', err)
        wx.showToast({ title: '播放失败', icon: 'none' })
        innerAudioContext.destroy()
        if (_currentAudioContext === innerAudioContext) _currentAudioContext = null
      })

      innerAudioContext.onEnded(() => {
        innerAudioContext.destroy()
        if (_currentAudioContext === innerAudioContext) _currentAudioContext = null
      })

      innerAudioContext.play()
    } catch (error) {
      console.error('播放音频失败:', error)
      wx.showToast({ title: '播放失败', icon: 'none' })
      _currentAudioContext = null
    }
  } else if (attachment.type === 'document') {
    wx.showLoading({ title: '打开文档中...', mask: true })
    wx.openDocument({
      filePath: attachment.path,
      showMenu: true,
      success: () => {
        wx.hideLoading()
      },
      fail: (err) => {
        console.error('打开文档失败:', err)
        wx.hideLoading()
        wx.showToast({ title: '打开失败，文件可能已丢失', icon: 'none' })
      }
    })
  }
}

/**
 * 获取优先级文本
 * @param {number} priority 优先级 0-3
 * @returns {string}
 */
function getPriorityText(priority) {
  return TaskManager.getPriorityText(priority)
}

/**
 * 获取提醒文本
 * @param {string|number} reminder 提醒时间
 * @returns {string}
 */
function getReminderText(reminder) {
  if (!reminder) return '不提醒'
  const reminderOptions = {
    5: '提前5分钟',
    15: '提前15分钟',
    30: '提前30分钟',
    60: '提前1小时',
    120: '提前2小时',
    1440: '提前1天',
    2880: '提前2天'
  }
  return reminderOptions[reminder] || '不提醒'
}

/**
 * 获取重复文本
 * @param {string} repeat 重复类型
 * @returns {string}
 */
function getRepeatText(repeat) {
  const repeatOptions = {
    'daily': '每天',
    'weekly': '每周',
    'monthly': '每月',
    'workdays': '工作日',
    'weekends': '周末'
  }
  return repeatOptions[repeat] || ''
}

/**
 * 格式化文件大小（委托给 FileHelper）
 * @param {number} bytes 字节数
 * @returns {string}
 */
function formatFileSize(bytes) {
  return FileHelper.formatFileSize(bytes)
}

/**
 * 格式化时长（委托给 FileHelper）
 * @param {number} seconds 秒数
 * @returns {string}
 */
function formatDuration(seconds) {
  return FileHelper.formatDuration(seconds)
}

module.exports = {
  confirmDeleteTask,
  confirmDeleteTaskSimple,
  previewAttachment,
  getPriorityText,
  getReminderText,
  getRepeatText,
  formatFileSize,
  formatDuration,
  stopAudio
}

/**
 * 停止当前播放的音频（供页面 onUnload 调用）
 */
function stopAudio() {
  if (_currentAudioContext) {
    try {
      _currentAudioContext.stop()
      _currentAudioContext.destroy()
    } catch (e) { /* ignore */ }
    _currentAudioContext = null
  }
}
