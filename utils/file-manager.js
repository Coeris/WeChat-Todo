/**
 * 文件管理器
 * 负责将临时文件（图片/语音）持久化到用户目录，避免小程序冷启动后丢失
 */

const fs = wx.getFileSystemManager();
const BASE_DIR = wx.env.USER_DATA_PATH + '/attachments';

// 确保 attachments 目录存在
function ensureDir() {
  try {
    fs.accessSync(BASE_DIR);
  } catch (e) {
    fs.mkdirSync(BASE_DIR, true);
  }
}

/**
 * 将临时文件保存到永久目录
 * @param {string} tempFilePath 临时文件路径
 * @param {string} taskId 任务ID（用于目录隔离）
 * @returns {Promise<{path: string, size: string|number}>} 持久化后的文件信息
 */
function saveTempFile(tempFilePath, taskId) {
  return new Promise((resolve, reject) => {
    if (!tempFilePath) return reject(new Error('tempFilePath 为空'));

    // 已经是永久路径则直接返回
    if (tempFilePath.startsWith(wx.env.USER_DATA_PATH)) {
      try {
        const stat = fs.statSync(tempFilePath);
        resolve({ path: tempFilePath, size: stat.size });
        return; // 文件已存在且可访问，直接返回
      } catch (e) {
        // 文件不存在，继续走 saveFile
      }
    }

    ensureDir();

    // 从路径提取扩展名
    const extMatch = tempFilePath.match(/\.[^.]+$/);
    const ext = extMatch ? extMatch[0] : '.dat';
    const fileName = (taskId || 'tmp') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
    const savedPath = BASE_DIR + '/' + fileName;

    fs.saveFile({
      tempFilePath: tempFilePath,
      filePath: savedPath,
      success: (res) => {
        try {
          const stat = fs.statSync(res.savedFilePath);
          resolve({ path: res.savedFilePath, size: stat.size });
        } catch (e) {
          resolve({ path: res.savedFilePath, size: 0 });
        }
      },
      fail: (err) => {
        console.error('saveFile 失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 批量保存临时文件
 * @param {Array<{tempFilePath: string, type: string, size?: string|number}>} files 临时文件列表
 * @param {string} taskId 任务ID
 * @returns {Promise<Array<{type: string, path: string, size: string}>>} 持久化后的附件列表
 */
async function saveTempFiles(files, taskId) {
  const results = [];
  for (const file of files) {
    try {
      const saved = await saveTempFile(file.tempFilePath || file.path, taskId);
      results.push({
        type: file.type || 'image',
        path: saved.path,
        size: typeof file.size === 'string' ? file.size : formatFileSize(saved.size || 0),
        ...(file.duration ? { duration: file.duration } : {})
      });
    } catch (e) {
      console.error('保存文件失败，跳过:', file.tempFilePath || file.path, e);
    }
  }
  return results;
}

/**
 * 删除永久文件
 * @param {string} filePath 文件路径
 */
function removeFile(filePath) {
  try {
    if (filePath && filePath.startsWith(wx.env.USER_DATA_PATH)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('删除文件失败:', filePath, e);
  }
}

/**
 * 删除任务关联的所有附件文件
 * @param {Array<{path: string}>} attachments 附件列表
 */
function removeAttachmentFiles(attachments) {
  if (!attachments || !Array.isArray(attachments)) return;
  attachments.forEach(a => {
    if (a && a.path) removeFile(a.path);
  });
}

/**
 * 检查文件是否存在
 * @param {string} filePath 文件路径
 * @returns {boolean}
 */
function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 获取附件存储的磁盘用量
 * @returns {{count: number, totalSize: number, sizeStr: string}}
 */
function getStorageUsage() {
  try {
    ensureDir();
    const files = fs.readdirSync(BASE_DIR);
    let totalSize = 0;
    files.forEach(name => {
      try {
        const stat = fs.statSync(BASE_DIR + '/' + name);
        totalSize += stat.size;
      } catch (e) { /* ignore */ }
    });
    return {
      count: files.length,
      totalSize,
      sizeStr: formatFileSize(totalSize)
    };
  } catch (e) {
    return { count: 0, totalSize: 0, sizeStr: '0 B' };
  }
}

/**
 * 清理孤立文件（不在任何任务的 attachments 中引用的文件）
 * @param {Array} allTasks 所有任务列表
 */
function cleanOrphanFiles(allTasks) {
  try {
    ensureDir();
    const files = fs.readdirSync(BASE_DIR);
    if (files.length === 0) return;

    // 收集所有任务引用的文件路径
    const referencedPaths = new Set();
    if (allTasks && Array.isArray(allTasks)) {
      allTasks.forEach(task => {
        if (task.attachments && Array.isArray(task.attachments)) {
          task.attachments.forEach(a => {
            if (a && a.path) referencedPaths.add(a.path);
          });
        }
      });
    }

    // 删除未被引用的文件
    let cleaned = 0;
    files.forEach(name => {
      const fullPath = BASE_DIR + '/' + name;
      if (!referencedPaths.has(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          cleaned++;
        } catch (e) { /* ignore */ }
      }
    });

    if (cleaned > 0) {
      console.log(`清理了 ${cleaned} 个孤立附件文件`);
    }
  } catch (e) {
    console.error('清理孤立文件失败:', e);
  }
}

/**
 * 迁移旧版临时路径附件为永久路径
 * @param {Array<{type: string, path: string, size: string|number}>} attachments 附件列表
 * @param {string} taskId 任务ID
 * @returns {Promise<Array>} 迁移后的附件列表
 */
async function migrateTempAttachments(attachments, taskId) {
  if (!attachments || !Array.isArray(attachments)) return [];

  const results = [];
  for (const att of attachments) {
    if (!att || !att.path) continue;

    // 已经是永久路径，直接保留
    if (att.path.startsWith(wx.env.USER_DATA_PATH)) {
      // 检查文件是否还存在
      if (fileExists(att.path)) {
        results.push(att);
        continue;
      }
      // 文件已丢失，跳过
      console.warn('附件文件已丢失:', att.path);
      continue;
    }

    // 临时路径，尝试迁移
    try {
      const saved = await saveTempFile(att.path, taskId);
      results.push({
        type: att.type || 'image',
        path: saved.path,
        size: typeof att.size === 'string' ? att.size : formatFileSize(saved.size || 0),
        ...(att.duration ? { duration: att.duration } : {})
      });
    } catch (e) {
      console.error('迁移附件失败:', att.path, e);
    }
  }
  return results;
}

// === 工具函数 ===

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = (bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0);
  return value + ' ' + units[i];
}

module.exports = {
  saveTempFile,
  saveTempFiles,
  removeFile,
  removeAttachmentFiles,
  fileExists,
  getStorageUsage,
  cleanOrphanFiles,
  migrateTempAttachments,
  formatFileSize,
  BASE_DIR
};
