/**
 * 统一的错误处理和显示工具
 */
class ErrorHandler {
  /**
   * 显示错误提示
   */
  static showError(message, duration = 2000) {
    try {
      wx.showToast({
        title: message || '操作失败',
        icon: 'none',
        duration: duration
      });
    } catch (error) {
      console.error('显示错误提示失败:', error);
    }
  }

  /**
   * 显示成功提示
   */
  static showSuccess(message, duration = 1500) {
    try {
      wx.showToast({
        title: message || '操作成功',
        icon: 'success',
        duration: duration
      });
    } catch (error) {
      console.error('显示成功提示失败:', error);
    }
  }

  /**
   * 显示加载提示
   */
  static showLoading(title = '加载中...', mask = true) {
    try {
      wx.showLoading({
        title: title,
        mask: mask
      });
    } catch (error) {
      console.error('显示加载提示失败:', error);
    }
  }

  /**
   * 隐藏加载提示
   */
  static hideLoading() {
    try {
      wx.hideLoading();
    } catch (error) {
      console.error('隐藏加载提示失败:', error);
    }
  }

  /**
   * 统一的异常处理
   */
  static handle(error, defaultMessage = '操作失败') {
    const message = error?.message || defaultMessage;
    console.error('操作失败:', error);
    this.showError(message);
    return message;
  }

  /**
   * 安全的异步操作包装
   */
  static async safeAsync(promise, errorMessage = '操作失败') {
    try {
      return await promise;
    } catch (error) {
      return this.handle(error, errorMessage);
    }
  }

  /**
   * 验证函数
   */
  static validate(value, rules) {
    const errors = [];

    for (const rule of rules) {
      if (rule.required && !value) {
        errors.push(rule.message || '该字段不能为空');
        continue;
      }

      if (value && rule.pattern && !rule.pattern.test(value)) {
        errors.push(rule.message || '格式不正确');
      }

      if (value && rule.min && value.length < rule.min) {
        errors.push(rule.message || `长度不能少于${rule.min}`);
      }

      if (value && rule.max && value.length > rule.max) {
        errors.push(rule.message || `长度不能超过${rule.max}`);
      }
    }

    return errors;
  }
}

/**
 * 文件工具类
 */
class FileHelper {
  /**
   * 验证文件路径是否有效
   * @param {string} filePath 文件路径
   * @returns {boolean} 是否有效
   */
  static isValidPath(filePath) {
    return filePath && typeof filePath === 'string' && filePath.trim().length > 0;
  }

  /**
   * 安全的文件路径过滤器
   * @param {Array} files 文件数组
   * @returns {Array} 有效的文件数组
   */
  static filterValidFiles(files) {
    if (!Array.isArray(files)) {
      return [];
    }
    return files.filter(f => f && f.tempFilePath && this.isValidPath(f.tempFilePath));
  }

  /**
   * 格式化文件大小
   * @param {number} bytes 字节数
   * @returns {string} 格式化后的大小
   */
  static formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0B';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  /**
   * 格式化时长
   * @param {number} seconds 秒数
   * @returns {string} 格式化后的时长
   */
  static formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * 安全的日期解析（兼容 iOS）
 * iOS 只支持 "yyyy-MM-dd"、"yyyy-MM-ddTHH:mm:ss" 等 ISO 格式
 * @param {string|Date|number} date 日期字符串、Date 对象或时间戳
 * @returns {Date|null} 解析后的 Date 对象，空值/解析失败返回 null
 */
function safeParseDateNull(date) {
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  if (typeof date === 'number') return isNaN(new Date(date).getTime()) ? null : new Date(date);
  if (!date || (typeof date === 'string' && date.trim() === '')) return null;
  const result = safeParseDate(date);
  return result && !isNaN(result.getTime()) ? result : null;
}

function safeParseDate(date) {
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);
  if (!date) return new Date();

  // ISO 格式或标准 "yyyy-MM-dd"、"yyyy-MM-ddTHH:mm:ss" 等，直接解析
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[T\s]/.test(date)) {
    const d = new Date(date.replace(/\//g, '-'));
    if (!isNaN(d.getTime())) return d;
  } else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(date)) {
    const d = new Date(date.replace(/\//g, '-'));
    if (!isNaN(d.getTime())) return d;
  }

  // "MM-dd HH:mm" 或 "MM-dd" 格式（补上当前年份）
  const match = date.match(/^(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (match) {
    const year = new Date().getFullYear();
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    const hour = match[3] ? parseInt(match[3], 10) : 0;
    const min = match[4] ? parseInt(match[4], 10) : 0;
    return new Date(year, month, day, hour, min);
  }

  // 兜底
  const fallback = new Date(date);
  if (isNaN(fallback.getTime())) {
    console.warn('[safeParseDate] 无法解析日期字符串，回退为当前时间:', date);
    return new Date();
  }
  return fallback;
}

module.exports = {
  ErrorHandler,
  FileHelper,
  safeParseDate,
  safeParseDateNull
};