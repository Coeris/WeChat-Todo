const TaskManager = require('../../../utils/task')
const ThemeManager = require('../../../utils/theme')
const { safeParseDate } = require('../../../utils/helpers')
const {
  confirmDeleteTaskSimple,
  previewAttachment: previewAttachmentFn,
  formatFileSize,
  formatDuration,
  stopAudio
} = require('../../../utils/task-helpers')
const FileManager = require('../../../utils/file-manager')

Page({
  data: {
    darkMode: false,
    focused: false,
    isEdit: false,
    taskId: null,
    parentId: null,
    autoSaving: false,
    completed: false,
    // 创建信息
    createTimeDisplay: '',
    updateTimeDisplay: '',
    completedAtDisplay: '',
    form: {
      title: '',
      priority: 0,
      startTime: null,
      endTime: null,
      location: '',
      locations: [],
      notes: '',
      url: '',
      links: [],
      reminder: '',
      repeat: '',
      tags: [],
      subtasks: []
    },
    // 子任务列表（从独立 task 加载）
    subtasks: [],
    // 模块面板展开状态
    showLocationPanel: false,
    showLinkPanel: false,
    showSubtaskPanel: false,
    // 时间输入字段（年月日时分）
    startTime: {
      year: '',
      month: '',
      day: '',
      hour: '',
      minute: ''
    },
    endTime: {
      year: '',
      month: '',
      day: '',
      hour: '',
      minute: ''
    },
    hasStartTime: false,
    showStartTime: false,
    currentTimeParts: {
      year: '',
      month: '',
      day: '',
      hour: '',
      minute: ''
    },
    // 格式化后的标签显示
    repeatLabel: '',
    submitLoading: false,
    attachments: [],
    showRepeatPicker: false,
    repeatOptions: [
      { label: '每天', value: 'daily' },
      { label: '每周', value: 'weekly' },
      { label: '每月', value: 'monthly' },
      { label: '工作日', value: 'workdays' },
      { label: '周末', value: 'weekends' }
    ]
  },

  onLoad(options) {
    // 首次加载时执行子任务数据迁移（从旧格式升级，仅执行一次）
    if (!getApp()._subtaskMigrated) {
      TaskManager.migrateSubtasks();
      getApp()._subtaskMigrated = true;
    }

    // 初始化录音管理器监听器（全局单例，使用闭包标记防止重复注册）
    this._recorderManager = wx.getRecorderManager();
    if (!this._recorderManager._wechatTodoListenersAdded) {
      this._recorderManager._wechatTodoListenersAdded = true;
      this._recorderManager.onStop(async (res) => {
      if (!res.tempFilePath) {
        console.error('录音未返回文件路径');
        wx.showToast({ title: '录音失败', icon: 'none' });
        return;
      }

      // 通过页面栈获取当前最新的编辑页面实例
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (!currentPage || !currentPage.data || currentPage.route !== 'pages/task/edit/index') return;

      const taskId = currentPage.data.taskId || 'new';
      try {
        const saved = await FileManager.saveTempFile(res.tempFilePath, taskId);
        const voiceFile = {
          type: 'voice',
          path: saved.path,
          size: formatFileSize(saved.size || 0),
          duration: formatDuration(res.duration || 0)
        };
        currentPage.setData({
          attachments: [...currentPage.data.attachments, voiceFile]
        }, () => {
          if (typeof currentPage.triggerAutoSave === 'function') {
            currentPage.triggerAutoSave();
          }
        });
      } catch (err) {
        console.error('保存录音失败:', err);
        wx.showToast({ title: '保存录音失败', icon: 'none' });
      }
    });

    this._recorderManager.onError((err) => {
      console.error('录音错误:', err);
      wx.showToast({
        title: '录音失败',
        icon: 'none'
      });
    });

    // 初始化标签
    this.initLabels();

    // 编辑模式
    if (options.id) {
      this.setData({ isEdit: true, taskId: options.id });
      this.loadTask(options.id);
    } else {
      this._wasNewTask = true
      // 新建模式：检查是否传入优先级
      if (options.priority !== undefined) {
        this.setData({ 'form.priority': parseInt(options.priority) })
      }
      // 检查是否从日历传入日期
      if (options.year && options.month && options.day) {
        const year = parseInt(options.year);
        const month = parseInt(options.month);
        const day = parseInt(options.day);

        if (year && month && day) {
          this.initDateTime(year, month, day);
        } else {
          this.initCurrentTime();
        }
      } else {
        // 新建模式：初始化开始时间为当前时间，结束时间为空
        this.initCurrentTime();
      }
    }

    // 如果传入了 parentId，说明是创建/编辑子任务
    if (options.parentId) {
      this.setData({ parentId: options.parentId });
    }
  },

  onShow() {
    ThemeManager.applyToPage(this)
    // 从子任务编辑页面返回时刷新子任务列表
    if (this.data.taskId) {
      this.loadSubtasks(this.data.taskId);
    }
  },

  // 初始化当前时间（默认不展开日期区域）
  initCurrentTime() {
    const now = new Date();
    const displayTimeParts = this.getDisplayTimeParts(now);
    this.setData({
      showStartTime: false,
      hasStartTime: false,
      startTime: { year: '', month: '', day: '', hour: '', minute: '' },
      endTime: { year: '', month: '', day: '', hour: '', minute: '' },
      currentTimeParts: displayTimeParts
    });
  },

  // 初始化指定日期的时间
  initDateTime(year, month, day) {
    const date = new Date(year, month - 1, day, 9, 0);
    const timeParts = this.getTimeParts(date);
    const displayTimeParts = this.getDisplayTimeParts(date);
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const timeStr = '09:00';

    this.setData({
      startTime: { ...timeParts, dateValue: dateStr, timeValue: timeStr },
      endTime: { year: year.toString(), month: month.toString().padStart(2, '0'), day: day.toString().padStart(2, '0'), hour: '', minute: '', dateValue: dateStr, timeValue: '' },
      showStartTime: true,
      hasStartTime: true,
      currentTimeParts: displayTimeParts,
      'form.startTime': date.getTime()
    });
  },

  // 格式化日期字符串 yyyy-MM-dd
  formatDateStr(year, month, day) {
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  },

  // 格式化时间字符串 HH:mm
  formatTimeStr(hour, minute) {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  },

  // 获取时间的年月日时分部分（用于显示占位符，不补零）
  getDisplayTimeParts(date) {
    return {
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString(),
      day: date.getDate().toString(),
      hour: date.getHours().toString(),
      minute: date.getMinutes().toString()
    };
  },

  // 获取时间的年月日时分部分（用于数据处理，补零）
  getTimeParts(date) {
    return {
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString().padStart(2, '0'),
      day: date.getDate().toString().padStart(2, '0'),
      hour: date.getHours().toString().padStart(2, '0'),
      minute: date.getMinutes().toString().padStart(2, '0')
    };
  },

  // 初始化提醒和重复标签
  initLabels() {
    const repeatLabel = this.getRepeatLabel(this.data.form.repeat);
    this.setData({ repeatLabel });
  },

  // 加载任务（编辑模式）
  loadTask(taskId) {
    const task = TaskManager.getTaskById(taskId);
    if (task) {
      // 获取重复的标签
      const repeatLabel = this.getRepeatLabel(task.repeat);

      // 解析时间
      const startTimeDate = task.startTime ? safeParseDate(task.startTime) : null;
      const endTimeDate = task.dueDate ? safeParseDate(task.dueDate) : null;
      const startTime = startTimeDate ? {
        ...this.getTimeParts(startTimeDate),
        dateValue: `${startTimeDate.getFullYear()}-${(startTimeDate.getMonth() + 1).toString().padStart(2, '0')}-${startTimeDate.getDate().toString().padStart(2, '0')}`,
        timeValue: `${startTimeDate.getHours().toString().padStart(2, '0')}:${startTimeDate.getMinutes().toString().padStart(2, '0')}`
      } : { year: '', month: '', day: '', hour: '', minute: '' };
      const endTime = endTimeDate ? {
        ...this.getTimeParts(endTimeDate),
        dateValue: `${endTimeDate.getFullYear()}-${(endTimeDate.getMonth() + 1).toString().padStart(2, '0')}-${endTimeDate.getDate().toString().padStart(2, '0')}`,
        timeValue: `${endTimeDate.getHours().toString().padStart(2, '0')}:${endTimeDate.getMinutes().toString().padStart(2, '0')}`
      } : { year: '', month: '', day: '', hour: '', minute: '' };
      const hasStartTime = !!task.startTime;
      const showEndTime = !!task.dueDate;

      // 初始化占位符为当前时间
      const now = new Date();
      const currentTimeParts = this.getDisplayTimeParts(now);
      const defaultDateStr = this.formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const defaultTimeStr = this.formatTimeStr(now.getHours(), now.getMinutes());

      // 解析链接（将逗号分隔的 url 转换为数组）
      const links = task.url ? task.url.split(',').filter(link => link && link.trim()) : [];

      // 确保空的时间也有默认 picker 值
      if (!startTime.dateValue) startTime.dateValue = defaultDateStr;
      if (!startTime.timeValue) startTime.timeValue = defaultTimeStr;
      if (!endTime.dateValue) endTime.dateValue = defaultDateStr;
      if (!endTime.timeValue) endTime.timeValue = defaultTimeStr;

      this.setData({
        form: {
          title: task.title || '',
          priority: task.priority || 0,
          startTime: task.startTime || null,
          endTime: task.dueDate || null,
          location: task.location || '',
          locations: this._parseLocations(task.location || '', task.locationCoords),
          notes: task.notes || '',
          url: task.url || '',
          links: links,
          reminder: task.reminder || '',
          repeat: task.repeat || '',
          tags: task.tags || [],
          subtasks: []
        },
        startTime,
        endTime,
        showStartTime: hasStartTime,
        hasStartTime,
        currentTimeParts,
        repeatLabel,
        attachments: task.attachments || [],
        parentId: task.parentId || null,
        completed: !!task.completed,
        createTimeDisplay: this._formatTime(task.createTime),
        updateTimeDisplay: this._formatTime(task.updateTime),
        completedAtDisplay: this._formatTime(task.completedAt)
      });

      // 迁移旧版临时路径附件为永久路径
      this._migrateAttachments(task.id || taskId);

      // 加载子任务列表
      this.loadSubtasks(taskId);
    }
  },

  // 加载子任务列表（从独立 task 记录加载）
  loadSubtasks(taskId, callback) {
    const subtasks = TaskManager.getSubtasks(taskId);
    this.setData({ subtasks }, callback);
  },

  // 输入处理（触发自动保存）
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    this.setData({
      [`form.${field}`]: value
    }, () => {
      this.triggerAutoSave();
    });
  },

  // 设置优先级（触发自动保存）
  setPriority(e) {
    const priority = parseInt(e.currentTarget.dataset.priority);
    this.setData({
      'form.priority': priority
    }, () => {
      this.triggerAutoSave();
    });
  },

  // 标题输入框获得焦点
  onTitleFocus() {
    this.setData({ focused: true });
  },

  // 标题输入框失去焦点
  onTitleBlur() {
    this.setData({ focused: false });
  },

  // 开始时间各字段输入
  onStartTimeUnitInput(e) {
    const { unit } = e.currentTarget.dataset;
    const value = e.detail.value.replace(/[^\d]/g, '');
    this.setData({ [`startTime.${unit}`]: value });
  },

  // 开始时间失焦：补零并同步表单
  onStartTimeBlur(e) {
    const { unit } = e.currentTarget.dataset;
    const val = this.data.startTime[unit];
    if (val && val.length === 1 && ['month', 'day', 'hour', 'minute'].includes(unit)) {
      this.setData({ [`startTime.${unit}`]: val.padStart(2, '0') });
    }
    this.syncStartTimeToForm();
  },

  // 结束时间各字段输入
  onEndTimeUnitInput(e) {
    const { unit } = e.currentTarget.dataset;
    const value = e.detail.value.replace(/[^\d]/g, '');
    this.setData({ [`endTime.${unit}`]: value });
  },

  // 结束时间失焦：补零并同步表单
  onEndTimeBlur(e) {
    const { unit } = e.currentTarget.dataset;
    const val = this.data.endTime[unit];
    if (val && val.length === 1 && ['month', 'day', 'hour', 'minute'].includes(unit)) {
      this.setData({ [`endTime.${unit}`]: val.padStart(2, '0') });
    }
    this.syncEndTimeToForm();
  },

  // 同步开始时间到表单
  syncStartTimeToForm() {
    const { startTime } = this.data;
    const dateValue = startTime.year && startTime.month && startTime.day
      ? `${startTime.year}-${startTime.month.padStart(2, '0')}-${startTime.day.padStart(2, '0')}`
      : '';
    const timeValue = startTime.hour && startTime.minute
      ? `${startTime.hour.padStart(2, '0')}:${startTime.minute.padStart(2, '0')}`
      : '';
    this.setData({
      'startTime.dateValue': dateValue,
      'startTime.timeValue': timeValue
    }, () => {
      this.updateHasStartTime();
      this.updateFormStartTime();
    });
  },

  // 同步结束时间到表单
  syncEndTimeToForm() {
    const { endTime } = this.data;
    const dateValue = endTime.year && endTime.month && endTime.day
      ? `${endTime.year}-${endTime.month.padStart(2, '0')}-${endTime.day.padStart(2, '0')}`
      : '';
    const timeValue = endTime.hour && endTime.minute
      ? `${endTime.hour.padStart(2, '0')}:${endTime.minute.padStart(2, '0')}`
      : '';
    this.setData({
      'endTime.dateValue': dateValue,
      'endTime.timeValue': timeValue
    }, () => {
      this.updateFormEndTime();
    });
  },

  // 时钟选择开始时间（时分）
  onStartTimePick(e) {
    const timeStr = e.detail.value;
    const [hour, minute] = timeStr.split(':');
    const updates = {
      'startTime.hour': hour,
      'startTime.minute': minute,
      'startTime.timeValue': timeStr
    };
    // 如果日期为空，自动填充当前日期
    const { startTime } = this.data;
    if (!startTime.year || !startTime.month || !startTime.day) {
      const now = new Date();
      const dateStr = this.formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
      updates['startTime.year'] = now.getFullYear().toString();
      updates['startTime.month'] = (now.getMonth() + 1).toString().padStart(2, '0');
      updates['startTime.day'] = now.getDate().toString().padStart(2, '0');
      updates['startTime.dateValue'] = dateStr;
    }
    this.setData(updates, () => {
      this.updateHasStartTime();
      this.updateFormStartTime();
    });
  },

  // 时钟选择结束时间（时分）
  onEndTimePick(e) {
    const timeStr = e.detail.value;
    const [hour, minute] = timeStr.split(':');
    const updates = {
      'endTime.hour': hour,
      'endTime.minute': minute,
      'endTime.timeValue': timeStr
    };
    // 如果日期为空，自动使用开始日期，开始日期也为空则用当前日期
    const { endTime, startTime } = this.data;
    if (!endTime.year || !endTime.month || !endTime.day) {
      const refDate = (startTime && startTime.year) ? startTime : null;
      const y = refDate ? parseInt(refDate.year) : new Date().getFullYear();
      const m = refDate ? parseInt(refDate.month) : new Date().getMonth() + 1;
      const d = refDate ? parseInt(refDate.day) : new Date().getDate();
      const dateStr = this.formatDateStr(y, m, d);
      updates['endTime.year'] = y.toString();
      updates['endTime.month'] = m.toString().padStart(2, '0');
      updates['endTime.day'] = d.toString().padStart(2, '0');
      updates['endTime.dateValue'] = dateStr;
    }
    this.setData(updates, () => {
      this.updateFormEndTime();
    });
  },

  // 日历选择开始日期
  onStartDatePick(e) {
    const dateStr = e.detail.value;
    const [year, month, day] = dateStr.split('-');
    const updates = {
      'startTime.year': year,
      'startTime.month': month,
      'startTime.day': day,
      'startTime.dateValue': dateStr
    };
    // 如果时间为空，自动填充当前时间
    const { startTime } = this.data;
    if (!startTime.hour || !startTime.minute) {
      const now = new Date();
      const timeStr = this.formatTimeStr(now.getHours(), now.getMinutes());
      updates['startTime.hour'] = now.getHours().toString().padStart(2, '0');
      updates['startTime.minute'] = now.getMinutes().toString().padStart(2, '0');
      updates['startTime.timeValue'] = timeStr;
    }
    this.setData(updates, () => {
      this.updateHasStartTime();
      this.updateFormStartTime();
    });
  },

  // 日历选择结束日期
  onEndDatePick(e) {
    const dateStr = e.detail.value;
    const [year, month, day] = dateStr.split('-');
    const updates = {
      'endTime.year': year,
      'endTime.month': month,
      'endTime.day': day,
      'endTime.dateValue': dateStr
    };
    // 如果时间为空，自动使用开始时间，开始时间也为空则用当前时间
    const { endTime, startTime } = this.data;
    if (!endTime.hour || !endTime.minute) {
      const refTime = (startTime && startTime.hour) ? startTime : null;
      const h = refTime ? parseInt(refTime.hour) : new Date().getHours();
      const m = refTime ? parseInt(refTime.minute) : new Date().getMinutes();
      const timeStr = this.formatTimeStr(h, m);
      updates['endTime.hour'] = h.toString().padStart(2, '0');
      updates['endTime.minute'] = m.toString().padStart(2, '0');
      updates['endTime.timeValue'] = timeStr;
    }
    this.setData(updates, () => {
      this.updateFormEndTime();
    });
  },

  // 更新 hasStartTime 状态
  updateHasStartTime() {
    const { startTime } = this.data;
    const hasValue = Object.values(startTime).some(val => val && val.trim() !== '');
    this.setData({ hasStartTime: hasValue });
  },

  // 切换日期时间区域显示
  toggleStartTime() {
    if (this.data.showStartTime) {
      // 收起：清空日期时间，同步清除重复设置
      this.setData({
        showStartTime: false,
        hasStartTime: false,
        'form.startTime': null,
        'form.endTime': null,
        'form.repeat': '',
        repeatLabel: '',
        startTime: { year: '', month: '', day: '', hour: '', minute: '' },
        endTime: { year: '', month: '', day: '', hour: '', minute: '' }
      });
      this.triggerAutoSave();
    } else {
      // 展开：用当前日期时间预填充开始和结束时间
      const now = new Date();
      const dateStr = this.formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const timeStr = this.formatTimeStr(now.getHours(), now.getMinutes());
      this.setData({
        showStartTime: true,
        hasStartTime: true,
        'form.startTime': now.getTime(),
        startTime: {
          year: now.getFullYear().toString(),
          month: (now.getMonth() + 1).toString().padStart(2, '0'),
          day: now.getDate().toString().padStart(2, '0'),
          hour: now.getHours().toString().padStart(2, '0'),
          minute: now.getMinutes().toString().padStart(2, '0'),
          dateValue: dateStr,
          timeValue: timeStr
        },
        endTime: {
          year: now.getFullYear().toString(),
          month: (now.getMonth() + 1).toString().padStart(2, '0'),
          day: now.getDate().toString().padStart(2, '0'),
          hour: '',
          minute: '',
          dateValue: dateStr,
          timeValue: ''
        },
        currentTimeParts: this.getDisplayTimeParts(now)
      });
      this.triggerAutoSave();
    }
  },

  // 更新表单开始时间
  updateFormStartTime() {
    const timestamp = this.convertToCompleteTime(this.data.startTime);
    this.setData({
      'form.startTime': timestamp
    }, () => {
      this.triggerAutoSave();
    });
  },

  // 更新表单结束时间
  updateFormEndTime() {
    const timestamp = this.convertToCompleteTime(this.data.endTime);
    this.setData({
      'form.endTime': timestamp
    }, () => {
      this.triggerAutoSave();
    });
  },

  // 将部分时间转换为完整时间戳
  convertToCompleteTime(timeData) {
    const { year, month, day, hour, minute } = timeData;
    const now = new Date();

    // 如果没有任何输入，返回 null
    if (!year && !month && !day && !hour && !minute) {
      return null;
    }

    // 使用用户输入的值，未输入的使用默认值
    const completeYear = year ? parseInt(year) : now.getFullYear();
    const completeMonth = month ? parseInt(month) - 1 : now.getMonth(); // 未输入月份默认当前月
    const completeDay = day ? parseInt(day) : 1;
    const completeHour = hour ? parseInt(hour) : 0;
    const completeMinute = minute ? parseInt(minute) : 0;

    const date = new Date(completeYear, completeMonth, completeDay, completeHour, completeMinute);
    return date.getTime();
  },

  // 解析地点数据为数组（兼容旧数据）
  _parseLocations(locationStr, locationCoordsStr) {
    if (!locationStr) return []
    const texts = locationStr.split(',').map(s => s.trim()).filter(Boolean)
    // 尝试解析坐标 JSON
    let coords = null
    try {
      coords = locationCoordsStr ? JSON.parse(locationCoordsStr) : null
    } catch (e) {
      coords = null
    }
    return texts.map((text, i) => ({
      text,
      lat: (coords && coords[i] && coords[i].lat) || null,
      lng: (coords && coords[i] && coords[i].lng) || null
    }))
  },

  // 模块面板切换（互斥：打开一个时关闭其他，已有内容不新增行）
  toggleLocationPanel() {
    const isOpen = this.data.showLocationPanel
    this._cleanEmptyLinks()
    this._cleanEmptySubtasks()
    if (isOpen) {
      // 面板已打开，再次点击才添加新行
      this.addLocation()
    } else {
      // 面板关闭，打开面板；如果无内容才自动添加一行
      const locations = this.data.form.locations || []
      if (locations.length === 0) this.addLocation()
    }
    this.setData({ showLocationPanel: true, showLinkPanel: false, showSubtaskPanel: false })
  },
  toggleLinkPanel() {
    const isOpen = this.data.showLinkPanel
    this._cleanEmptyLocations()
    this._cleanEmptySubtasks()
    if (isOpen) {
      this.addLink()
    } else {
      const links = this.data.form.links || []
      if (links.length === 0) this.addLink()
    }
    this.setData({ showLocationPanel: false, showLinkPanel: true, showSubtaskPanel: false })
  },
  toggleSubtaskPanel() {
    const isOpen = this.data.showSubtaskPanel
    this._cleanEmptyLocations()
    this._cleanEmptyLinks()
    if (isOpen) {
      this.addSubtask()
    } else {
      const subtasks = this.data.subtasks || []
      if (subtasks.length === 0) this.addSubtask()
    }
    this.setData({ showLocationPanel: false, showLinkPanel: false, showSubtaskPanel: true })
  },

  // 清理空的地点（只保留有文字的）
  _cleanEmptyLocations() {
    const locations = (this.data.form.locations || []).filter(l => l && l.text && l.text.trim())
    if (locations.length !== (this.data.form.locations || []).length) {
      this.setData({ 'form.locations': locations })
    }
  },

  // 清理空的链接
  _cleanEmptyLinks() {
    const links = (this.data.form.links || []).filter(l => l && l.trim())
    if (links.length !== (this.data.form.links || []).length) {
      this.setData({ 'form.links': links })
    }
  },

  // 清理空的子任务
  _cleanEmptySubtasks() {
    const subtasks = (this.data.subtasks || []).filter(s => {
      if (s._isNew) return false
      return s && s.title && s.title !== '_new_'
    })
    if (subtasks.length !== (this.data.subtasks || []).length) {
      this.setData({ subtasks })
    }
  },

  // 添加地点
  addLocation() {
    const locations = this.data.form.locations || []
    locations.push({ text: '', lat: null, lng: null })
    this.setData({ 'form.locations': locations })
  },

  // 更新地点文本
  updateLocation(e) {
    const { index } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`form.locations[${index}].text`]: value
    }, () => {
      this.triggerAutoSave()
    })
  },

  // 删除地点
  deleteLocation(e) {
    const { index } = e.currentTarget.dataset
    const locations = this.data.form.locations || []
    locations.splice(index, 1)
    const updateData = { 'form.locations': locations }
    if (locations.length === 0) updateData.showLocationPanel = false
    this.setData(updateData, () => {
      this.triggerAutoSave()
    })
  },

  // 选择地点（通过地图选取）
  chooseLocation(e) {
    const { index } = e.currentTarget.dataset
    const locations = this.data.form.locations || []
    const loc = (index !== undefined && index != null) ? locations[index] : null
    const text = (loc && loc.text) ? loc.text.trim() : ''

    // 复制地点文字到剪贴板
    if (text) {
      wx.setClipboardData({
        data: text,
        showTips: false
      })
    }

    // 有坐标 → 跳转地图查看
    if (loc && loc.lat != null && loc.lng != null) {
      wx.openLocation({
        latitude: loc.lat,
        longitude: loc.lng,
        name: text || '地点',
        scale: 15
      })
      return
    }

    // 无坐标 → 打开地图选点（用户可在地图搜索栏搜索后选取，自动保存坐标）
    wx.chooseLocation({
      success: (res) => {
        const chosen = (res.address || '') + (res.name || '')
        if (index !== undefined && index != null) {
          this.setData({
            [`form.locations[${index}].text`]: chosen,
            [`form.locations[${index}].lat`]: res.latitude,
            [`form.locations[${index}].lng`]: res.longitude
          }, () => {
            this.triggerAutoSave()
          })
        } else {
          locations.push({ text: chosen, lat: res.latitude, lng: res.longitude })
          this.setData({ 'form.locations': locations }, () => {
            this.triggerAutoSave()
          })
        }
      },
      fail: (err) => {
        console.error('选择地点失败:', err)
      }
    });
  },

  // 切换重复（触发自动保存）
  toggleRepeat() {
    const newRepeat = this.data.form.repeat ? '' : 'daily';
    const label = this.getRepeatLabel(newRepeat);
    this.setData({
      'form.repeat': newRepeat,
      repeatLabel: label
    }, () => {
      this.triggerAutoSave();
    });
  },

  // 显示重复选择器
  showRepeatPicker() {
    this.setData({ showRepeatPicker: true });
  },

  // 隐藏重复选择器
  hideRepeatPicker() {
    this.setData({ showRepeatPicker: false });
  },

  // 选择重复周期（触发自动保存）
  selectRepeat(e) {
    const { value } = e.currentTarget.dataset;
    const label = this.getRepeatLabel(value);
    this.setData({
      'form.repeat': value,
      repeatLabel: label,
      showRepeatPicker: false
    }, () => {
      this.triggerAutoSave();
    });
  },

  // 获取重复标签
  getRepeatLabel(value) {
    const option = this.data.repeatOptions.find(opt => opt.value === value);
    return option ? option.label : '';
  },

  // 添加子任务
  addSubtask() {
    const { taskId } = this.data;

    if (taskId) {
      // 已有 taskId，直接创建子任务
      const subtask = TaskManager.addSubtask(taskId, {
        title: '_new_',
        completed: false
      });
      if (subtask) {
        this.loadSubtasks(taskId);
        const idx = this.data.subtasks.length - 1;
        const key = `subtasks[${idx}]._focus`;
        this.setData({ [key]: true });
      }
    } else {
      // 无 taskId（任务未保存），添加临时子任务到本地数组
      const subtasks = [...this.data.subtasks, {
        id: '_temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: '_new_',
        completed: this.data.completed || false,
        _isNew: true
      }];
      this.setData({
        subtasks,
        showSubtaskPanel: true
      });
      const idx = subtasks.length - 1;
      const key = `subtasks[${idx}]._focus`;
      this.setData({ [key]: true });
    }
  },

  // 子任务名称输入完成（触发更新子任务标题）
  updateSubtaskTitle(e) {
    const { index } = e.currentTarget.dataset;
    const { value } = e.detail;
    const { subtasks } = this.data;
    const subtask = subtasks[index];
    if (!subtask) return;

    const title = value.trim() || '_new_';
    subtasks[index].title = title;
    this.setData({ subtasks });

    // 只有非临时子任务才更新存储
    if (!subtask._isNew && this.data.taskId) {
      TaskManager.updateTask(subtask.id, { title });
    }
  },

  // 子任务输入框回车确认：失焦
  onSubtaskInputConfirm(e) {
    const { index } = e.currentTarget.dataset;
    const key = `subtasks[${index}]._focus`;
    this.setData({ [key]: false });
  },

  // 切换子任务状态
  toggleSubtask(e) {
    const { index } = e.currentTarget.dataset;
    const { subtasks } = this.data;
    const subtask = subtasks[index];
    if (!subtask || subtask._isNew) return; // 临时子任务跳过

    const updated = TaskManager.toggleTaskStatus(subtask.id);
    if (updated) {
      subtasks[index].completed = updated.completed;
      this.setData({ subtasks });
    }
  },

  // 删除子任务
  deleteSubtask(e) {
    const { index } = e.currentTarget.dataset;
    const { subtasks, taskId } = this.data;
    const subtask = subtasks[index];
    if (!subtask) return;

    // 临时子任务直接从本地数组移除
    if (subtask._isNew) {
      subtasks.splice(index, 1);
      this.setData({
        subtasks,
        showSubtaskPanel: subtasks.length > 0
      });
      return;
    }

    const descendantCount = TaskManager.getDescendantCount(subtask.id);
    if (descendantCount > 0) {
      wx.showModal({
        title: '包含子任务',
        content: `该子任务下有 ${descendantCount} 个子任务也将被删除，确定继续吗？`,
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            TaskManager.deleteTask(subtask.id, true);
            this.loadSubtasks(taskId, () => {
              if (this.data.subtasks.length === 0) {
                this.setData({ showSubtaskPanel: false })
              }
            });
          }
        }
      });
    } else {
      TaskManager.deleteTask(subtask.id, true);
      this.loadSubtasks(taskId, () => {
        if (this.data.subtasks.length === 0) {
          this.setData({ showSubtaskPanel: false })
        }
      });
    }
  },

  // 点击子任务名称跳转到编辑页
  onSubtaskTap(e) {
    const { index } = e.currentTarget.dataset;
    const { subtasks } = this.data;
    const subtask = subtasks[index];
    if (!subtask || !subtask.id || subtask._isNew) return; // 临时子任务跳过

    wx.navigateTo({
      url: `/pages/task/edit/index?id=${subtask.id}&parentId=${this.data.taskId}`
    });
  },

  // 显示附件菜单
  showAttachmentMenu() {
    wx.showActionSheet({
      itemList: ['拍摄照片', '从相册选择', '录制语音', '选择文档'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0:
            this.takePhoto();
            break;
          case 1:
            this.chooseImage();
            break;
          case 2:
            this.recordVoice();
            break;
          case 3:
            this.chooseDocument();
            break;
        }
      }
    });
  },

  // 拍照（触发自动保存）
  takePhoto() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: async (res) => {
        if (!res.tempFiles || res.tempFiles.length === 0) {
          wx.showToast({ title: '未获取到图片', icon: 'none' });
          return;
        }

        const taskId = this.data.taskId || 'new';
        wx.showLoading({ title: '保存图片中...', mask: true });
        try {
          const files = await FileManager.saveTempFiles(res.tempFiles, taskId);
          if (files.length > 0) {
            this.setData({
              attachments: [...this.data.attachments, ...files]
            }, () => {
              this.triggerAutoSave();
            });
          }
        } catch (err) {
          console.error('保存图片失败:', err);
          wx.showToast({ title: '保存图片失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
      fail: (err) => {
        console.error('拍照失败:', err);
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '拍照失败', icon: 'none' });
        }
      }
    });
  },

  // 选择图片（触发自动保存）
  chooseImage() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album'],
      success: async (res) => {
        if (!res.tempFiles || res.tempFiles.length === 0) {
          wx.showToast({ title: '未获取到图片', icon: 'none' });
          return;
        }

        const taskId = this.data.taskId || 'new';
        wx.showLoading({ title: '保存图片中...', mask: true });
        try {
          const files = await FileManager.saveTempFiles(res.tempFiles, taskId);
          if (files.length > 0) {
            this.setData({
              attachments: [...this.data.attachments, ...files]
            }, () => {
              this.triggerAutoSave();
            });
          }
        } catch (err) {
          console.error('保存图片失败:', err);
          wx.showToast({ title: '保存图片失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择失败', icon: 'none' });
        }
      }
    });
  },

  // 录音
  recordVoice() {
    wx.showModal({
      title: '开始录音',
      content: '点击确定开始录音，完成后再次点击结束',
      success: (res) => {
        if (res.confirm) {
          try {
            this._recorderManager.start({
              format: 'mp3',
              duration: 600000
            });

            wx.showModal({
              title: '录音中...',
              content: '点击确定结束录音',
              success: (res) => {
                if (res.confirm) {
                  this._recorderManager.stop();
                }
              }
            });
          } catch (error) {
            console.error('开始录音失败:', error);
            wx.showToast({
              title: '录音失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 选择文档（从微信会话中选择文件）
  chooseDocument() {
    wx.chooseMessageFile({
      count: 9,
      type: 'all',
      success: async (res) => {
        if (!res.tempFiles || res.tempFiles.length === 0) {
          wx.showToast({ title: '未选择文件', icon: 'none' });
          return;
        }

        const taskId = this.data.taskId || 'new';
        wx.showLoading({ title: '保存文档中...', mask: true });
        try {
          const files = [];
          for (const f of res.tempFiles) {
            try {
              const saved = await FileManager.saveTempFile(f.path, taskId);
              files.push({
                type: 'document',
                path: saved.path,
                size: formatFileSize(saved.size || f.size || 0),
                name: f.name || '未命名文档'
              });
            } catch (e) {
              console.error('保存文档失败:', f.name, e);
              wx.showToast({ title: `${f.name} 保存失败`, icon: 'none' });
            }
          }
          if (files.length > 0) {
            this.setData({
              attachments: [...this.data.attachments, ...files]
            }, () => {
              this.triggerAutoSave();
            });
          }
        } catch (err) {
          console.error('保存文档失败:', err);
          wx.showToast({ title: '保存文档失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
      fail: (err) => {
        console.error('选择文档失败:', err);
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择失败', icon: 'none' });
        }
      }
    });
  },

  // 删除附件（触发自动保存）
  deleteAttachment(e) {
    const { index } = e.currentTarget.dataset;
    const attachments = [...this.data.attachments];
    const removed = attachments.splice(index, 1)[0];

    // 删除磁盘上的文件
    if (removed && removed.path) {
      FileManager.removeFile(removed.path);
    }

    this.setData({ attachments }, () => {
      this.triggerAutoSave();
    });
  },

  // 预览附件
  previewAttachment(e) {
    const { index } = e.currentTarget.dataset;
    previewAttachmentFn(this.data.attachments, index);
  },

  // 触发自动保存（防抖）
  triggerAutoSave() {
    // 清除之前的定时器
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // 设置新的定时器（800ms）
    this.autoSaveTimer = setTimeout(() => {
      this.autoSave();
    }, 800);
  },

  // 自动保存（静默保存）
  autoSave() {
    const { form, isEdit, taskId } = this.data;

    // 如果没有标题，不保存
    if (!form.title || !form.title.trim()) {
      return;
    }

    // 如果是编辑模式但没有有效的 taskId，不保存
    if (isEdit && !taskId) {
      console.warn('编辑模式但 taskId 无效，跳过自动保存');
      return;
    }

    // 保存前强制同步显示字段 → form，防止不同步导致时间丢失
    const startTs = this.convertToCompleteTime(this.data.startTime);
    const endTs = this.convertToCompleteTime(this.data.endTime);
    const syncUpdates = {};
    if (startTs !== form.startTime) syncUpdates['form.startTime'] = startTs;
    if (endTs !== form.endTime) syncUpdates['form.endTime'] = endTs;
    if (Object.keys(syncUpdates).length > 0) {
      this.setData(syncUpdates);
      // 同步内存中的 form 引用，确保 buildTaskData 使用最新值（setData 是异步的）
      if (syncUpdates['form.startTime'] !== undefined) form.startTime = syncUpdates['form.startTime'];
      if (syncUpdates['form.endTime'] !== undefined) form.endTime = syncUpdates['form.endTime'];
    }

    this.setData({ autoSaving: true });

    try {
      const taskData = this.buildTaskData();

      if (isEdit && taskId) {
        // 编辑模式：更新任务
        const existingTask = TaskManager.getTaskById(taskId);
        if (!existingTask) {
          console.warn('任务不存在，切换为新增模式');
          // 切换到新增模式
          this.setData({ isEdit: false, taskId: null });
          // 重新执行自动保存（这次会走新增逻辑）
          return this.autoSave();
        }
        TaskManager.updateTask(taskId, taskData);
      } else {
        // 新增模式：添加任务
        const newTask = TaskManager.addTask(taskData);
        if (newTask && newTask.id) {
          // 同步临时子任务到存储
          const tempSubtasks = (this.data.subtasks || []).filter(s => s._isNew);
          tempSubtasks.forEach(s => {
            if (s.title && s.title !== '_new_') {
              TaskManager.addSubtask(newTask.id, {
                title: s.title,
                completed: s.completed || false
              });
            }
          });
          if (tempSubtasks.length > 0) {
            this.loadSubtasks(newTask.id);
          }
          // 切换到编辑模式，标记已保存防止 onUnload 误删
          this._wasNewTask = false;
          this.setData({
            isEdit: true,
            taskId: newTask.id
          });
        } else {
          console.error('添加任务失败');
        }
      }

      // 完成
    } catch (error) {
      console.error('自动保存失败:', error);
    } finally {
      this.setData({ autoSaving: false });
    }
  },

  // 取消编辑
  cancelEdit() {
    // 新建模式下，删除自动保存的任务
    if (this._wasNewTask && this.data.taskId) {
      TaskManager.deleteTask(this.data.taskId)
      this._wasNewTask = false // 标记已清理，防止 onUnload 重复删除
    }
    wx.navigateBack()
  },

  // 手动保存
  manualSave() {
    const { form } = this.data

    if (!form.title || !form.title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' })
      return
    }

    // 先清除自动保存定时器，立即保存一次
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer)
      this.autoSaveTimer = null
    }

    this.autoSave();
    this._wasNewTask = false; // 标记已保存，防止 onUnload 误删
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 800)
  },

  // 切换完成状态
  toggleComplete() {
    const { taskId, isEdit } = this.data;
    if (!isEdit || !taskId) return;

    try {
      const updated = TaskManager.toggleTaskStatus(taskId);
      if (updated) {
        this.setData({
          completed: !!updated.completed,
          completedAtDisplay: this._formatTime(updated.completedAt),
          updateTimeDisplay: this._formatTime(updated.updateTime)
        });
        wx.showToast({
          title: updated.completed ? '已完成' : '未完成',
          icon: 'success'
        });
      }
    } catch (error) {
      console.error('切换完成状态失败:', error);
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },

  // 格式化时间戳为可读字符串
  _formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp instanceof Date ? timestamp : safeParseDate(timestamp);
    if (!date || isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 删除任务
  deleteTask() {
    if (!this.data.isEdit || !this.data.taskId) {
      return;
    }

    confirmDeleteTaskSimple(this.data.taskId, '确定要删除这个任务吗？', () => {
      this._doDelete(this.data.taskId);
    });
  },

  // 执行删除
  _doDelete(taskId) {
    if (TaskManager.deleteTask(taskId)) {
      wx.navigateBack();
    } else {
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    }
  },

  // 验证表单
  validateForm() {
    const { title } = this.data.form;

    if (!title || !title.trim()) {
      wx.showToast({
        title: '请输入任务标题',
        icon: 'none'
      });
      return false;
    }

    // 验证日期时间
    const startTime = this.convertToCompleteTime(this.data.startTime);
    const endTime = this.convertToCompleteTime(this.data.endTime);
    if (startTime && endTime && startTime > endTime) {
      wx.showToast({
        title: '开始时间不能晚于结束时间',
        icon: 'none'
      });
      return false;
    }

    return true;
  },

  // 构建任务数据
  buildTaskData() {
    const { form, attachments, parentId, isEdit } = this.data;
    const now = Date.now();

    // 过滤空的链接
    const validLinks = (form.links || []).filter(link => link && link.trim());

    const taskData = {
      title: form.title.trim(),
      notes: form.notes.trim(),
      priority: form.priority,
      startTime: form.startTime,
      dueDate: form.endTime,
      isAllDay: false,
      location: (form.locations || []).filter(l => l && (l.text || '').trim()).map(l => l.text.trim()).join(','),
      locationCoords: (form.locations || []).filter(l => l && l.text && l.text.trim()).map(l => ({ lat: l.lat, lng: l.lng })),
      url: validLinks.length > 0 ? validLinks.join(',') : '',
      reminder: form.reminder,
      repeat: form.repeat,
      tags: form.tags,
      attachments: attachments,
      subtasks: [],
      completed: this.data.completed || false,
      important: form.priority >= 2,
      parentId: parentId || null,
      updateTime: now
    };

    // 新建模式才设置 createTime，编辑模式保留原值
    if (!isEdit) {
      taskData.createTime = now;
    }

    return taskData;
  },

  // 解析日期
  parseDate(dateStr) {
    return safeParseDate(dateStr).getTime();
  },

  // 添加链接
  addLink() {
    const links = this.data.form.links || [];
    links.push('');
    this.setData({
      'form.links': links
    });
  },

  // 更新链接
  updateLink(e) {
    const { index } = e.currentTarget.dataset;
    const value = e.detail.value;
    const links = [...this.data.form.links];
    links[index] = value;
    this.setData({
      'form.links': links
    }, () => {
      this.triggerAutoSave();
    });
  },

  // 复制链接到剪贴板，提示去浏览器打开
  openLink(e) {
    const { index } = e.currentTarget.dataset
    const links = this.data.form.links || []
    const url = (links[index] || '').trim()
    if (!url) return
    wx.setClipboardData({
      data: url.startsWith('http') ? url : 'https://' + url,
      showTips: false,
      success() {
        wx.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none' })
      }
    })
  },

  // 删除链接
  deleteLink(e) {
    const { index } = e.currentTarget.dataset;
    const links = [...this.data.form.links];
    links.splice(index, 1);
    const updateData = { 'form.links': links };
    if (links.length === 0) updateData.showLinkPanel = false;
    this.setData(updateData, () => {
      this.triggerAutoSave();
    });
  },

  // 页面卸载时清理定时器和占位子任务
  onUnload() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    // 停止正在播放的音频
    stopAudio();
    // 新建模式下删除未保存的任务（deleteTask 内部会清理附件文件）
    if (this._wasNewTask && this.data.taskId) {
      TaskManager.deleteTask(this.data.taskId);
    }
    // 清理未命名的占位子任务
    this._cleanupPlaceholderSubtasks();
  },

  // 清理标题为 _new_ 的占位子任务
  _cleanupPlaceholderSubtasks() {
    const { taskId, subtasks } = this.data;
    if (!taskId || !subtasks || subtasks.length === 0) return;
    subtasks.forEach(st => {
      if (st.title === '_new_') {
        TaskManager.deleteTask(st.id, true);
      }
    });
  },

  // 迁移旧版临时路径附件为永久路径
  async _migrateAttachments(taskId) {
    const attachments = this.data.attachments;
    if (!attachments || attachments.length === 0) return;

    const hasTemp = attachments.some(a => a.path && !a.path.startsWith(wx.env.USER_DATA_PATH));
    if (!hasTemp) return;

    try {
      const migrated = await FileManager.migrateTempAttachments(attachments, taskId);
      if (migrated.length !== attachments.length) {
        // 有附件丢失，更新数据
        this.setData({ attachments: migrated }, () => {
          this.triggerAutoSave();
        });
      } else if (migrated.length > 0) {
        // 路径变了但数量一致，静默更新
        this.setData({ attachments: migrated }, () => {
          this.triggerAutoSave();
        });
      }
    } catch (err) {
      console.error('迁移附件失败:', err);
    }
  }
});
