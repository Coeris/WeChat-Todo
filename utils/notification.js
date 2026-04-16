// 通知管理工具类
const StorageManager = require('./storage-manager');

class NotificationManager {
  // 通知配置
  static config = {
    // 订阅消息模板ID (需要在微信公众平台配置)
    templateIds: [],
    
    // 提醒时间选项(分钟)
    reminderOptions: [5, 15, 30, 60, 1440] // 5分钟, 15分钟, 30分钟, 1小时, 1天
  };

  // 本地存储key（与 StorageManager.KEYS.NOTIFICATIONS 保持一致）
  static STORAGE_KEY = 'notifications';

  // 获取所有通知
  static getNotifications() {
    try {
      return StorageManager.get(this.STORAGE_KEY, []);
    } catch (error) {
      console.error('获取通知失败:', error);
      return [];
    }
  }

  // 保存通知列表
  static saveNotifications(notifications) {
    try {
      return StorageManager.set(this.STORAGE_KEY, notifications);
    } catch (error) {
      console.error('保存通知失败:', error);
      return false;
    }
  }

  // 添加通知
  static addNotification(notification) {
    try {
      const notifications = this.getNotifications();
      notification.id = notification.id || Date.now().toString();
      notification.createTime = Date.now();
      notification.read = notification.read || false;
      
      notifications.push(notification);
      this.saveNotifications(notifications);
      
      return notification;
    } catch (error) {
      console.error('添加通知失败:', error);
      return null;
    }
  }

  // 标记通知为已读
  static markAsRead(notificationId) {
    try {
      const notifications = this.getNotifications();
      const index = notifications.findIndex(n => n.id === notificationId);
      
      if (index !== -1) {
        notifications[index].read = true;
        this.saveNotifications(notifications);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('标记已读失败:', error);
      return false;
    }
  }

  // 标记所有通知为已读
  static markAllAsRead() {
    try {
      const notifications = this.getNotifications();
      notifications.forEach(n => {
        n.read = true;
      });
      this.saveNotifications(notifications);
      return true;
    } catch (error) {
      console.error('全部标记已读失败:', error);
      return false;
    }
  }

  // 删除通知
  static deleteNotification(notificationId) {
    try {
      let notifications = this.getNotifications();
      const initialLength = notifications.length;
      notifications = notifications.filter(n => n.id !== notificationId);
      
      if (notifications.length < initialLength) {
        this.saveNotifications(notifications);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('删除通知失败:', error);
      return false;
    }
  }

  // 清空所有通知
  static clearAllNotifications() {
    try {
      return StorageManager.remove(this.STORAGE_KEY);
    } catch (error) {
      console.error('清空通知失败:', error);
      return false;
    }
  }

  // 获取未读通知数量
  static getUnreadCount() {
    const notifications = this.getNotifications();
    return notifications.filter(n => !n.read).length;
  }

  // 订阅消息
  static async subscribeMessage(_task) {
    try {
      if (this.config.templateIds.length === 0) {
        console.log('未配置订阅消息模板ID');
        return false;
      }

      const res = await wx.requestSubscribeMessage({
        tmplIds: this.config.templateIds
      });

      console.log('订阅消息结果:', res);
      return true;
    } catch (error) {
      console.error('订阅消息失败:', error);
      return false;
    }
  }

  // 清理过期通知
  static checkAndTriggerNotifications() {
    try {
      const notifications = this.getNotifications();
      const now = Date.now();
      let triggered = false;

      notifications.forEach(notification => {
        if (!notification.triggered && notification.triggerTime <= now) {
          this.triggerNotification(notification);
          notification.triggered = true;
          triggered = true;
        }
      });

      if (triggered) {
        this.saveNotifications(notifications);
      }
    } catch (error) {
      console.error('检查通知失败:', error);
    }
  }

  // 触发通知
  static triggerNotification(notification) {
    try {
      // 使用本地通知
      wx.showToast({
        title: notification.title,
        icon: 'none',
        duration: 3000
      });

      // 也可以使用系统通知 (需要用户授权)
      // wx.showModal({
      //   title: notification.title,
      //   content: notification.content,
      //   showCancel: false
      // });
    } catch (error) {
      console.error('触发通知失败:', error);
    }
  }

  // 格式化相对时间
  static formatRelativeTime(timestamp) {
    if (!timestamp) return '';

    const now = Date.now();
    const diff = timestamp - now;
    const absDiff = Math.abs(diff);
    const suffix = diff >= 0 ? '后' : '前';

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (absDiff < minute) {
      return '现在';
    } else if (absDiff < hour) {
      const mins = Math.floor(absDiff / minute);
      return `${mins}分钟${suffix}`;
    } else if (absDiff < day) {
      const hours = Math.floor(absDiff / hour);
      return `${hours}小时${suffix}`;
    } else {
      const days = Math.floor(absDiff / day);
      return `${days}天${suffix}`;
    }
  }

  // 清理过期通知
  static cleanExpiredNotifications(days = 30) {
    try {
      const notifications = this.getNotifications();
      const expireTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      const filtered = notifications.filter(n => 
        n.createTime > expireTime || !n.read
      );
      
      this.saveNotifications(filtered);
      return true;
    } catch (error) {
      console.error('清理过期通知失败:', error);
      return false;
    }
  }
}

module.exports = NotificationManager;
