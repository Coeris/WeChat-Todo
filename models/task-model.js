/**
 * 任务数据模型
 * 统一的任务操作接口，提高代码复用性和一致性
 * 按年/月分表存储，键格式：tasks_YYYY_MM
 */

const StorageManager = require('../utils/storage-manager');
const { ErrorHandler, safeParseDate } = require('../utils/helpers');
const FileManager = require('../utils/file-manager');

class TaskModel {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
    this.pageSize = 20;
    // 定时备份：30秒无操作后自动创建备份
    this._backupTimer = null;
    this._backupDelay = 30000; // 30秒
    // 记录哪些月份有数据，用于快速加载
    this._activeMonths = [];
    // 脏月追踪：记录哪些月份的数据被修改过，save() 时只写这些月份
    this._dirtyMonths = new Set();
    // 防抖保存定时器
    this._saveTimer = null;
    this._saveDelay = 500; // 500ms 内合并多次 save 请求
  }

  /**
   * 获取任务所属的月份键
   * @param {Object|number|string} taskOrTime 任务对象或时间戳
   * @returns {string} 月份键，如 'tasks_2026_04'
   */
  _getMonthKey(taskOrTime) {
    let time;
    if (typeof taskOrTime === 'object' && taskOrTime.createTime) {
      time = taskOrTime.createTime;
    } else {
      time = taskOrTime;
    }

    let date;
    if (typeof time === 'number') {
      date = new Date(time);
    } else {
      date = safeParseDate(time);
    }

    if (isNaN(date.getTime())) {
      date = new Date();
    }

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `tasks_${year}_${month}`;
  }

  /**
   * 初始化模型
   */
  init() {
    try {
      this.cache.clear();

      // 检查是否需要迁移旧数据
      const oldTasks = StorageManager.get(StorageManager.KEYS.TASKS, []);
      if (oldTasks && oldTasks.length > 0 && !StorageManager.has('task_months')) {
        this._migrateFromSingleKey(oldTasks);
      }

      // 加载活跃月份列表
      this._activeMonths = StorageManager.get('task_months', []);

      // 从各月份键加载任务
      this._activeMonths.forEach(monthKey => {
        const tasks = StorageManager.get(monthKey, []);
        tasks.forEach(task => this.cache.set(task.id, task));
      });

      this.initialized = true;
      return Array.from(this.cache.values());
    } catch (error) {
      ErrorHandler.handle(error, '初始化任务数据失败');
      this.initialized = false;
      return [];
    }
  }

  /**
   * 迁移旧版单键数据到按月分表
   * @param {Array} tasks 旧的任务数组
   */
  _migrateFromSingleKey(tasks) {
    if (!tasks || tasks.length === 0) return;

    const monthMap = {};
    const months = [];

    tasks.forEach(task => {
      const key = this._getMonthKey(task);
      if (!monthMap[key]) {
        monthMap[key] = [];
        months.push(key);
      }
      monthMap[key].push(task);
    });

    // 按月写入
    months.forEach(key => {
      StorageManager.set(key, monthMap[key]);
    });

    // 保存月份列表
    StorageManager.set('task_months', months);

    // 记录迁移完成
    this._activeMonths = months;

    // 保留旧 key 一段时间作为备份（不删除，避免误操作）
    console.log(`数据迁移完成：${tasks.length} 个任务分入 ${months.length} 个月份`);
  }

  /**
   * 获取所有任务
   * @returns {Array} 任务列表
   */
  getAll() {
    if (!this.initialized) {
      this.init();
    }
    return Array.from(this.cache.values());
  }

  /**
   * 根据ID获取任务
   * @param {string} taskId 任务ID
   * @returns {Object|null} 任务对象
   */
  getById(taskId) {
    if (!this.initialized) {
      this.init();
    }
    return this.cache.get(taskId) || null;
  }

  /**
   * 添加任务
   * @param {Object} taskData 任务数据
   * @returns {Object|null} 添加的任务
   */
  add(taskData) {
    try {
      // 生成ID如果未提供
      const taskId = taskData.id || this.generateId();
      
      // 验证任务数据
      const errors = this.validateTask(taskData);
      if (errors.length > 0) {
        ErrorHandler.showError(errors[0]);
        return null;
      }

      const task = {
        id: taskId,
        title: taskData.title || '',
        notes: taskData.notes || '',
        startTime: taskData.startTime || null,
        dueDate: taskData.dueDate || null,
        isAllDay: taskData.isAllDay || false,
        location: taskData.location || '',
        url: taskData.url || '',
        attachments: taskData.attachments || [],
        completed: taskData.completed || false,
        priority: taskData.priority || 0,
        important: taskData.important || false,
        parentId: taskData.parentId || null,
        createTime: taskData.createTime || new Date().toISOString(),
        updateTime: taskData.updateTime || new Date().toISOString(),
        completedAt: taskData.completedAt || null
      };

      // 检查ID是否已存在
      if (this.cache.has(taskId)) {
        throw new Error(`任务ID ${taskId} 已存在`);
      }

      // 添加到缓存
      this.cache.set(taskId, task);

      // 标记该月为脏数据
      this._dirtyMonths.add(this._getMonthKey(task));

      // 延迟保存到存储（防抖，合并高频写入）
      this.save();

      // 创建备份
      this.createBackup();

      return task;
    } catch (error) {
      ErrorHandler.handle(error, '添加任务失败');
      return null;
    }
  }

  /**
   * 更新任务
   * @param {string} taskId 任务ID
   * @param {Object} updates 更新数据
   * @returns {Object|null} 更新后的任务
   */
  update(taskId, updates) {
    try {
      const existingTask = this.cache.get(taskId);
      if (!existingTask) {
        throw new Error('任务不存在');
      }

      // 验证更新数据
      if (updates.title !== undefined) {
        const errors = this.validateTask(updates);
        if (errors.length > 0) {
          ErrorHandler.showError(errors[0]);
          return null;
        }
      }

      const updatedTask = {
        ...existingTask,
        ...updates,
        updateTime: new Date().toISOString()
      };

      // 更新缓存
      this.cache.set(taskId, updatedTask);

      // 标记新旧月份为脏数据（跨月更新时两边都需要重写）
      this._dirtyMonths.add(this._getMonthKey(existingTask));
      this._dirtyMonths.add(this._getMonthKey(updatedTask));

      // 延迟保存到存储（防抖，合并高频写入）
      this.save();

      // 创建备份
      this.createBackup();

      return updatedTask;
    } catch (error) {
      ErrorHandler.handle(error, '更新任务失败');
      return null;
    }
  }

  /**
   * 删除任务
   * @param {string} taskId 任务ID
   * @param {boolean} cascade 是否级联删除子任务（递归删除所有后代），默认 true
   * @returns {boolean} 是否成功
   */
  delete(taskId, cascade = true) {
    try {
      const task = this.cache.get(taskId);
      if (!task) {
        throw new Error('任务不存在');
      }

      // 标记该任务所在月为脏
      this._dirtyMonths.add(this._getMonthKey(task));

      // 级联删除（递归删除所有后代子任务）
      if (cascade) {
        this._deleteDescendants(taskId);
      }

      // 清理当前任务的附件文件
      FileManager.removeAttachmentFiles(task.attachments);

      // 从缓存中删除
      this.cache.delete(taskId);

      // 保存到存储
      this.save();

      // 创建备份
      this.createBackup();

      // 删除相关附件（旧版逻辑兼容）
      this.deleteAttachments(taskId);

      return true;
    } catch (error) {
      ErrorHandler.handle(error, '删除任务失败');
      return false;
    }
  }

  /**
   * 切换任务完成状态
   * @param {string} taskId 任务ID
   * @returns {Object|null} 更新后的任务
   */
  toggleStatus(taskId) {
    try {
      const task = this.cache.get(taskId);
      if (!task) {
        throw new Error('任务不存在');
      }

      const completed = !task.completed;
      const updatedTask = {
        ...task,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
        updateTime: new Date().toISOString()
      };

      // 更新缓存
      this.cache.set(taskId, updatedTask);

      // 标记该月为脏数据
      this._dirtyMonths.add(this._getMonthKey(task));

      // 延迟保存到存储（防抖，合并高频写入）
      this.save();

      // 创建备份
      this.createBackup();

      return updatedTask;
    } catch (error) {
      ErrorHandler.handle(error, '切换任务状态失败');
      return null;
    }
  }

  /**
   * 更新任务优先级
   * @param {string} taskId 任务ID
   * @param {number} priority 优先级
   * @returns {Object|null} 更新后的任务
   */
  updatePriority(taskId, priority) {
    return this.update(taskId, { priority });
  }

  /**
   * 根据条件筛选任务
   * @param {Function} filterFn 筛选函数
   * @returns {Array} 筛选后的任务列表
   */
  filter(filterFn) {
    return this.getAll().filter(filterFn);
  }

  /**
   * 递归删除所有后代子任务（同时清理附件文件）
   * @param {string} parentId 父任务ID
   * @param {number} depth 当前递归深度（防止异常循环引用导致栈溢出）
   */
  _deleteDescendants(parentId, depth = 0) {
    if (depth > 10) {
      console.warn('子任务递归深度超过10层，停止递归，parentId:', parentId);
      return;
    }
    const children = this.getByParentId(parentId);
    children.forEach(child => {
      this._deleteDescendants(child.id, depth + 1);
      // 标记子任务所在月为脏（确保删除被持久化）
      this._dirtyMonths.add(this._getMonthKey(child));
      // 清理附件文件
      FileManager.removeAttachmentFiles(child.attachments);
      this.cache.delete(child.id);
    });
  }

  /**
   * 获取任务的嵌套深度（0 = 顶层）
   * @param {string} taskId 任务ID
   * @returns {number} 深度
   */
  getTaskDepth(taskId, visited) {
    if (!visited) visited = new Set();
    if (visited.has(taskId)) return 0;
    visited.add(taskId);
    const task = this.cache.get(taskId);
    if (!task || !task.parentId) return 0;
    return 1 + this.getTaskDepth(task.parentId, visited);
  }

  /**
   * 获取顶层任务（非子任务）
   * @returns {Array} 顶层任务列表
   */
  getTopLevel() {
    return this.filter(task => !task.parentId);
  }

  /**
   * 根据父任务ID获取子任务
   * @param {string} parentId 父任务ID
   * @returns {Array} 子任务列表
   */
  getByParentId(parentId) {
    if (!this.initialized) {
      this.init();
    }
    return Array.from(this.cache.values())
      .filter(task => task.parentId === parentId)
      .sort((a, b) => new Date(a.createTime) - new Date(b.createTime));
  }

  /**
   * 获取已完成的任务（排除子任务）
   * @returns {Array} 已完成任务列表
   */
  getCompleted() {
    return this.getTopLevel().filter(task => task.completed)
      .sort((a, b) => safeParseDate(b.completedAt) - safeParseDate(a.completedAt));
  }

  /**
   * 获取未完成的任务（排除子任务）
   * @returns {Array} 未完成任务列表
   */
  getPending() {
    return this.getTopLevel().filter(task => !task.completed)
      .sort((a, b) => {
        const aTime = a.startTime ? safeParseDate(a.startTime) : 0;
        const bTime = b.startTime ? safeParseDate(b.startTime) : 0;
        if (aTime && bTime) return aTime - bTime;
        if (aTime) return -1;
        if (bTime) return 1;
        return safeParseDate(b.createTime) - safeParseDate(a.createTime);
      });
  }

  /**
   * 获取重要任务（排除子任务）
   * @returns {Array} 重要任务列表
   */
  getImportant() {
    return this.getTopLevel().filter(task => task.important || task.priority >= 2)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 获取统计数据
   * @returns {Object} 统计信息
   */
  getStats() {
    // 统计仅包含顶层任务，子任务不单独计入
    const allTasks = this.getTopLevel();
    let completed = 0;
    let important = 0;

    for (const task of allTasks) {
      if (task.completed) completed++;
      if (task.important || task.priority >= 2) important++;
    }

    const total = allTasks.length;
    return {
      total,
      completed,
      pending: total - completed,
      important,
      completionRate: total > 0 ? (completed / total * 100).toFixed(2) : 0
    };
  }

  /**
   * 按日期分组任务
   * @param {Array} tasks 任务列表
   * @returns {Array} 分组后的任务
   */
  groupByDate(tasks = this.getAll()) {
    const groups = new Map();

    tasks.forEach(task => {
      // 已完成任务使用完成时间，未完成任务使用开始时间或创建时间
      const dateKey = task.completed
        ? this.getDateKeyForCompleted(task.completedAt)
        : this.getDateKey(task.startTime || task.createTime);
      const timestamp = task.completed
        ? this._parseDate(task.completedAt).getTime()
        : this._parseDate(task.startTime || task.createTime).getTime();

      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          date: dateKey,
          timestamp: timestamp,
          tasks: []
        });
      }
      groups.get(dateKey).tasks.push(task);
    });

    return Array.from(groups.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 保存到存储（带防抖和脏月优化）
   * - 防抖：500ms 内合并多次调用，避免高频写入
   * - 脏月追踪：只重写被修改过的月份数据，而非全部
   * @param {boolean} immediate 是否立即保存（忽略防抖和脏月优化）
   * @returns {boolean} 是否成功
   */
  save(immediate = false) {
    // 非立即模式：使用防抖合并高频写入
    if (!immediate) {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
      }
      this._saveTimer = setTimeout(() => {
        this._doSave();
        this._saveTimer = null;
      }, this._saveDelay);
      return true; // 防抖模式下先返回 true，实际写入在定时器中
    }

    return this._doSave();
  }

  /**
   * 实际执行保存（内部方法）
   * @returns {boolean}
   */
  _doSave() {
    try {
      const allTasks = Array.from(this.cache.values());

      // 如果没有脏标记，走全量写入（兜底）
      const hasDirtyMonths = this._dirtyMonths.size > 0;

      // 按 createTime 月份分组
      const monthMap = {};
      allTasks.forEach(task => {
        const key = this._getMonthKey(task);
        if (!monthMap[key]) {
          monthMap[key] = [];
        }
        monthMap[key].push(task);
      });

      // 写入数据
      const months = Object.keys(monthMap).sort();
      if (hasDirtyMonths) {
        // 只写入脏月份数据
        this._dirtyMonths.forEach(key => {
          if (monthMap[key]) {
            StorageManager.set(key, monthMap[key]);
          } else {
            // 该月已无数据，删除对应键
            StorageManager.remove(key);
          }
        });
        this._dirtyMonths.clear();
      } else {
        // 全量写入（兜底：首次保存、replaceAll 等）
        months.forEach(key => {
          StorageManager.set(key, monthMap[key]);
        });
      }

      // 清理已无数据的旧月份键（无论哪种模式都执行）
      this._activeMonths.forEach(oldKey => {
        if (!monthMap[oldKey]) {
          StorageManager.remove(oldKey);
        }
      });

      this._activeMonths = months;
      StorageManager.set('task_months', months);

      return true;
    } catch (error) {
      ErrorHandler.handle(error, '保存任务失败');
      return false;
    }
  }

  /**
   * 创建备份（延迟执行，避免频繁IO）
   * 30秒内无新操作才真正执行备份
   */
  createBackup() {
    if (this._backupTimer) {
      clearTimeout(this._backupTimer);
    }
    this._backupTimer = setTimeout(() => {
      this._doBackup();
      this._backupTimer = null;
    }, this._backupDelay);
  }

  /**
   * 立即执行备份（内部方法）
   * 包含任务数据和附件文件清单，恢复时可用于检测缺失文件
   */
  _doBackup() {
    try {
      // 备份元数据：月份列表 + 各月份数据
      const backup = {
        months: this._activeMonths,
        data: {},
        // 附件文件清单：记录所有被任务引用的附件路径
        attachmentManifest: []
      };

      // 收集所有任务引用的附件路径
      const allTasks = Array.from(this.cache.values());
      allTasks.forEach(task => {
        if (task.attachments && Array.isArray(task.attachments)) {
          task.attachments.forEach(att => {
            if (att && att.path && att.path.startsWith(wx.env.USER_DATA_PATH)) {
              backup.attachmentManifest.push({
                path: att.path,
                taskId: task.id,
                type: att.type || 'unknown',
                size: att.size || ''
              });
            }
          });
        }
      });

      this._activeMonths.forEach(key => {
        backup.data[key] = StorageManager.get(key, []);
      });
      StorageManager.set(StorageManager.KEYS.TASKS_BACKUP, backup);
    } catch (error) {
      console.error('创建备份失败:', error);
    }
  }

  /**
   * 立即创建备份（不延迟，用于关键操作前）
   */
  backupNow() {
    if (this._backupTimer) {
      clearTimeout(this._backupTimer);
      this._backupTimer = null;
    }
    this._doBackup();
  }

  /**
   * 从备份恢复
   * 恢复后会检查附件文件是否存在，缺失的会从 attachments 数组中移除
   * @returns {{success: boolean, missingFiles: number, totalAttachments: number}}
   */
  restoreFromBackup() {
    try {
      const backup = StorageManager.get(StorageManager.KEYS.TASKS_BACKUP);

      // 兼容旧版备份格式（纯数组）
      if (Array.isArray(backup) && backup.length > 0) {
        this.cache.clear();
        backup.forEach(task => this.cache.set(task.id, task));
        this._dirtyMonths.clear();
        this.save(true);
        this.initialized = true;
        // 旧版备份无附件清单，跳过检测
        return { success: true, missingFiles: 0, totalAttachments: 0 };
      }

      // 新版备份格式（{months, data, attachmentManifest}）
      if (backup && backup.months && backup.data) {
        this.cache.clear();

        // 恢复各月份数据
        backup.months.forEach(key => {
          const tasks = backup.data[key] || [];
          tasks.forEach(task => this.cache.set(task.id, task));
        });

        // 检查附件文件是否存在，移除缺失的附件
        let missingFiles = 0;
        let totalAttachments = 0;
        const fs = wx.getFileSystemManager();
        this.cache.forEach(task => {
          if (task.attachments && Array.isArray(task.attachments) && task.attachments.length > 0) {
            totalAttachments += task.attachments.length;
            const validAttachments = task.attachments.filter(att => {
              if (!att || !att.path) return false;
              if (!att.path.startsWith(wx.env.USER_DATA_PATH)) return true; // 非本地文件保留
              try {
                fs.accessSync(att.path);
                return true;
              } catch (e) {
                missingFiles++;
                return false;
              }
            });
            if (validAttachments.length !== task.attachments.length) {
              task.attachments = validAttachments;
              this.cache.set(task.id, task);
            }
          }
        });

        this._activeMonths = backup.months;
        this._dirtyMonths.clear();
        this.save(true);
        this.initialized = true;

        if (missingFiles > 0) {
          console.warn(`备份恢复完成，有 ${missingFiles} 个附件文件缺失已移除`);
        }

        return { success: true, missingFiles, totalAttachments };
      }

      return { success: false, missingFiles: 0, totalAttachments: 0 };
    } catch (error) {
      ErrorHandler.handle(error, '恢复备份失败');
      return { success: false, missingFiles: 0, totalAttachments: 0 };
    }
  }

  /**
   * 替换所有任务（用于同步恢复）
   * @param {Array} tasks 新的任务列表
   * @returns {boolean} 是否成功
   */
  replaceAll(tasks) {
    try {
      if (!Array.isArray(tasks)) {
        throw new Error('参数必须是数组');
      }
      this.cache.clear();
      this._activeMonths = [];
      tasks.forEach(task => this.cache.set(task.id, task));
      this._dirtyMonths.clear();
      this.save(true);
      this.createBackup();
      return true;
    } catch (error) {
      ErrorHandler.handle(error, '替换任务失败');
      return false;
    }
  }

  /**
   * 删除任务附件（旧版逻辑兼容）
   * @param {string} taskId 任务ID
   */
  deleteAttachments(taskId) {
    try {
      const attachments = StorageManager.get(StorageManager.KEYS.ATTACHMENTS, {});
      if (attachments[taskId]) {
        delete attachments[taskId];
        StorageManager.set(StorageManager.KEYS.ATTACHMENTS, attachments);
      }
    } catch (error) {
      console.error('删除附件失败:', error);
    }
  }

  /**
   * 生成任务ID
   * @returns {string} 任务ID
   */
  generateId() {
    return Date.now().toString() + Math.random().toString(36).slice(2, 11);
  }

  /**
   * 验证任务数据
   * @param {Object} task 任务数据
   * @returns {Array} 错误信息数组
   */
  validateTask(task) {
    const errors = [];

    if (!task.title || task.title.trim().length === 0) {
      errors.push('任务标题不能为空');
    }

    if (task.title && task.title.length > 100) {
      errors.push('任务标题不能超过100个字符');
    }

    if (task.notes && task.notes.length > 1000) {
      errors.push('任务备注不能超过1000个字符');
    }

    return errors;
  }

  /**
   * 安全解析日期字符串（兼容 iOS）
   * @param {string|Date} date 日期字符串或 Date 对象
   * @returns {Date} 解析后的 Date 对象
   */
  _parseDate(date) {
    return safeParseDate(date);
  }

  /**
   * 获取日期分组键
   * @param {string|Date} date 日期
   * @returns {string} 日期键
   */
  getDateKey(date) {
    const d = this._parseDate(date);
    const today = new Date();

    if (this.isSameDay(d, today)) {
      return '今天';
    } else if (this.isSameDay(d, this.addDays(today, 1))) {
      return '明天';
    } else if (this.isSameDay(d, this.addDays(today, 2))) {
      return '后天';
    } else {
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
  }

  /**
   * 获取已完成任务的日期分组键（不显示"明天"等未来日期）
   * @param {string|Date} date 日期
   * @returns {string} 日期键
   */
  getDateKeyForCompleted(date) {
    const d = this._parseDate(date);
    const today = new Date();
    const yesterday = this.addDays(today, -1);

    // 只显示"今天"和"昨天"，其他显示具体日期
    if (this.isSameDay(d, today)) {
      return '今天';
    } else if (this.isSameDay(d, yesterday)) {
      return '昨天';
    } else {
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
  }

  /**
   * 判断是否是同一天
   */
  isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  /**
   * 按时间远近分层分组（待办视图专用）
   * 已过期 → 今天 → 明天 → 本周 → 最近7天 → 本月 → 最近半月 → 更远 → 没有日期
   * @param {Array} tasks 任务列表
   * @returns {Array} 分组列表 [{title, tasks}]
   */
  groupByTimeBucket(tasks = []) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = this.addDays(today, 1);
    // 本周结束：周日（weekStartDay=1 即周一起始）
    // 如果今天已经是周日，本周到此结束，"本周"桶为空
    const weekEnd = today.getDay() === 0
      ? new Date(today)
      : this.addDays(today, 7 - today.getDay());
    const within7Days = this.addDays(today, 7);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1); // 下月1号
    const within15Days = this.addDays(today, 15);
    // 排除空组
    const buckets = [
      { title: '已过期', tasks: [] },     // 0
      { title: '今天', tasks: [] },        // 1
      { title: '明天', tasks: [] },        // 2
      { title: '本周', tasks: [] },        // 3
      { title: '最近7天', tasks: [] },     // 4
      { title: '本月', tasks: [] },        // 5
      { title: '最近半月', tasks: [] },    // 6
      { title: '更远', tasks: [] },        // 7
      { title: '没有日期', tasks: [] }     // 8
    ];

    tasks.forEach(task => {
      const startTime = task.startTime ? this._parseDate(task.startTime) : null;

      if (!startTime || isNaN(startTime.getTime())) {
        buckets[8].tasks.push(task);
      } else if (startTime < today) {
        buckets[0].tasks.push(task);
      } else if (this.isSameDay(startTime, today)) {
        buckets[1].tasks.push(task);
      } else if (this.isSameDay(startTime, tomorrow)) {
        buckets[2].tasks.push(task);
      } else if (startTime < weekEnd) {
        buckets[3].tasks.push(task);
      } else if (startTime < within7Days) {
        buckets[4].tasks.push(task);
      } else if (startTime < endOfMonth) {
        buckets[5].tasks.push(task);
      } else if (startTime < within15Days) {
        buckets[6].tasks.push(task);
      } else {
        buckets[7].tasks.push(task);
      }
    });

    // 过滤掉空分组
    return buckets.filter(g => g.tasks.length > 0);
  }

  /**
   * 添加天数
   */
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}

// 导出单例
const taskModel = new TaskModel();

module.exports = taskModel;
