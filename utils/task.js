// 任务管理工具类 - 重构为使用 TaskModel
const TaskModel = require('../models/task-model');
const { safeParseDate } = require('./helpers');

class TaskManager {
  // 获取所有任务（仅顶层，排除子任务）
  static getTasks() {
    return TaskModel.getTopLevel();
  }

  // 添加任务
  static addTask(task) {
    return TaskModel.add(task);
  }

  // 更新任务
  static updateTask(taskId, updates) {
    return TaskModel.update(taskId, updates);
  }

  // 删除任务
  static deleteTask(taskId) {
    return TaskModel.delete(taskId);
  }

  // 根据ID获取任务
  static getTaskById(taskId) {
    return TaskModel.getById(taskId);
  }

  // 筛选任务
  static filterTasks(filterType) {
    switch (filterType) {
      case 'todo':
        return TaskModel.getPending();
      case 'done':
        return TaskModel.getCompleted();
      case 'important':
        return TaskModel.getImportant();
      case 'quadrant':
        return TaskModel.getPending(); // 象限视图只显示未完成的任务
      default:
        return TaskModel.getAll();
    }
  }

  // 分组任务（按日期分组，适用于已完成视图）
  static groupTasksByDate(tasks) {
    return TaskModel.groupByDate(tasks);
  }

  // 分组任务（按时间远近分层，适用于待办视图）
  static groupTasksByTimeBucket(tasks) {
    return TaskModel.groupByTimeBucket(tasks);
  }

  // 获取统计信息
  static getStats() {
    return TaskModel.getStats();
  }

  // 切换任务状态
  static toggleTaskStatus(taskId) {
    return TaskModel.toggleStatus(taskId);
  }

  // 切换完成状态（别名）
  static toggleComplete(taskId) {
    return TaskModel.toggleStatus(taskId);
  }

  // 更新任务优先级
  static updateTaskPriority(taskId, priority) {
    return TaskModel.updatePriority(taskId, priority);
  }

  // 搜索任务（仅搜索顶层任务）
  static searchTasks(keyword) {
    if (!keyword || keyword.trim() === '') {
      return TaskModel.getTopLevel();
    }

    const lowerKeyword = keyword.toLowerCase();
    return TaskModel.getTopLevel().filter(task => 
      task.title.toLowerCase().includes(lowerKeyword) ||
      (task.notes && task.notes.toLowerCase().includes(lowerKeyword))
    );
  }

  // 获取今日任务
  static getTodayTasks() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return TaskModel.filter(task => {
      if (task.parentId) return false; // 排除子任务
      if (!task.startTime) return false;
      const startTime = safeParseDate(task.startTime);
      return startTime >= today && startTime < tomorrow;
    });
  }

  // 获取本周任务
  static getWeekTasks() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return TaskModel.filter(task => {
      if (task.parentId) return false; // 排除子任务
      if (!task.startTime) return false;
      const startTime = safeParseDate(task.startTime);
      return startTime >= startOfWeek && startTime < endOfWeek;
    });
  }

  // 获取逾期任务
  static getOverdueTasks() {
    const now = new Date();
    return TaskModel.filter(task => {
      if (task.parentId) return false; // 排除子任务
      if (!task.dueDate || task.completed) return false;
      return safeParseDate(task.dueDate) < now;
    });
  }

  // 获取子任务列表
  static getSubtasks(parentId) {
    return TaskModel.getByParentId(parentId);
  }

  /**
   * 获取任务的所有后代数量（递归，带循环引用保护）
   * @param {string} taskId 任务ID
   * @param {Set} visited 已访问节点集合（内部使用，防止循环引用导致栈溢出）
   * @returns {number} 后代总数
   */
  static getDescendantCount(taskId, visited) {
    if (!visited) visited = new Set();
    if (visited.has(taskId)) return 0; // 循环引用，停止
    visited.add(taskId);
    const children = TaskManager.getSubtasks(taskId);
    let count = children.length;
    children.forEach(child => {
      count += TaskManager.getDescendantCount(child.id, visited);
    });
    return count;
  }

  // 添加子任务
  static addSubtask(parentId, subtaskData) {
    return TaskModel.add({
      ...subtaskData,
      parentId: parentId
    });
  }

  /**
   * 获取任务深度
   * @param {string} taskId 任务ID
   * @returns {number} 深度（0=顶层）
   */
  static getTaskDepth(taskId) {
    return TaskModel.getTaskDepth(taskId);
  }

  /**
   * 递归展开子任务为平铺列表（按层级顺序排列）
   * 每个子任务会附带 _depth 字段表示嵌套层级
   * @param {Array} tasks 顶层任务列表
   * @returns {Array} 展开后的平铺列表
   */
  static expandSubtasks(tasks) {
    const result = [];

    const expandRecursive = (taskList, depth) => {
      taskList.forEach(task => {
        result.push({ ...task, _depth: depth });
        const children = TaskManager.getSubtasks(task.id);
        if (children.length > 0) {
          const enrichedChildren = children.map(child => ({
            ...child,
            startTimeDisplay: child.startTime ? TaskManager.formatTime(child.startTime) : '',
            endTimeDisplay: child.dueDate ? TaskManager.formatTime(child.dueDate) : ''
          }));
          expandRecursive(enrichedChildren, depth + 1);
        }
      });
    };

    expandRecursive(tasks, 0);
    return result;
  }

  // 数据迁移：将旧格式 subtasks 数组升级为独立 task 记录
  // 迁移逻辑：遍历所有顶层任务，将 subtasks 数组中的条目创建为独立 task
  // 迁移完成后清空原任务的 subtasks 字段
  static migrateSubtasks() {
    try {
      const allTasks = TaskModel.getTopLevel();
      let migratedCount = 0;

      allTasks.forEach(task => {
        const subtasks = task.subtasks;
        if (!Array.isArray(subtasks) || subtasks.length === 0) return;

        subtasks.forEach(st => {
          if (!st || !st.title || !st.title.trim()) return;

          // 创建独立的子任务记录
          const subtask = TaskModel.add({
            title: st.title.trim(),
            completed: st.completed || false,
            priority: 0,
            parentId: task.id,
            createTime: task.createTime,
            updateTime: new Date().toISOString()
          });

          if (subtask) {
            migratedCount++;
          }
        });

        // 清空原任务的 subtasks 字段
        TaskModel.update(task.id, { subtasks: [] });
      });

      return migratedCount;
    } catch (error) {
      console.error('迁移子任务失败:', error);
      return 0;
    }
  }

  // 批量删除任务
  static batchDeleteTasks(taskIds) {
    let successCount = 0;
    taskIds.forEach(taskId => {
      if (TaskModel.delete(taskId)) {
        successCount++;
      }
    });
    return successCount;
  }

  // 批量更新任务状态
  static batchUpdateStatus(taskIds, completed) {
    let successCount = 0;
    taskIds.forEach(taskId => {
      const task = TaskModel.getById(taskId);
      if (task && task.completed !== completed) {
        const updated = TaskModel.toggleStatus(taskId);
        if (updated) successCount++;
      }
    });
    return successCount;
  }

  // 导出任务
  static exportTasks(format = 'json') {
    const tasks = TaskModel.getAll();
    
    if (format === 'json') {
      return JSON.stringify(tasks, null, 2);
    } else if (format === 'csv') {
      let csv = 'ID,标题,备注,开始时间,截止时间,完成状态,优先级\n';
      tasks.forEach(task => {
        csv += `${task.id},"${task.title}","${task.notes}",${task.startTime || ''},${task.dueDate || ''},${task.completed},${task.priority}\n`;
      });
      return csv;
    }
    
    return JSON.stringify(tasks, null, 2);
  }

  // 导入任务
  static importTasks(data, format = 'json') {
    try {
      let tasks = [];

      if (format === 'json') {
        tasks = typeof data === 'string' ? JSON.parse(data) : data;
      } else if (format === 'csv') {
        const lines = data.split('\n');
        const headers = lines[0].split(',');

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length >= 2) {
            tasks.push({
              title: values[1]?.replace(/"/g, '') || '',
              notes: values[2]?.replace(/"/g, '') || '',
              completed: values[5] === 'true',
              priority: parseInt(values[6]) || 0
            });
          }
        }
      }

      let importedCount = 0;
      tasks.forEach(task => {
        if (TaskModel.add(task)) {
          importedCount++;
        }
      });

      return { success: true, count: importedCount };
    } catch (error) {
      console.error('导入任务失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 格式化时间（支持部分时间显示）
  static formatTime(timestamp) {
    if (!timestamp) return '';
    const date = safeParseDate(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    // 如果有小时和分钟，显示时分
    if (hours !== '00' || minutes !== '00') {
      if (date >= today && date < tomorrow) {
        // 今天，只显示时分
        return `${hours}:${minutes}`;
      } else if (year === now.getFullYear()) {
        // 今年，显示月日时分
        return `${month}-${day} ${hours}:${minutes}`;
      } else {
        // 其他年份，显示年月日时分
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      }
    } else {
      // 没有具体时间，只显示日期
      if (date >= today && date < tomorrow) {
        return '今天';
      } else if (year === now.getFullYear()) {
        return `${month}-${day}`;
      } else {
        return `${year}-${month}-${day}`;
      }
    }
  }

  // 获取优先级文本
  static getPriorityText(priority) {
    const priorityMap = {
      0: '普通',
      1: '重要',
      2: '紧急',
      3: '重要且紧急'
    };
    return priorityMap[priority] || '普通';
  }
}

module.exports = TaskManager;
