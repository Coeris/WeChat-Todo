// WebDAV 客户端工具类
class WebDAVClient {
  constructor(config) {
    this.url = config.url || '';
    this.username = config.username || '';
    this.password = config.password || '';
    this.path = config.path || '/WeChat-Todo/';
    this.timeout = 10000;
  }

  // 更新配置
  updateConfig(config) {
    if (config.url !== undefined) this.url = config.url;
    if (config.username !== undefined) this.username = config.username;
    if (config.password !== undefined) this.password = config.password;
    if (config.path !== undefined) this.path = config.path;
  }

  // 获取完整的文件路径
  getFilePath(filename) {
    // 确保路径以/开头和结尾
    let path = this.path.startsWith('/') ? this.path : '/' + this.path;
    path = path.endsWith('/') ? path : path + '/';
    return path + filename;
  }

  // 获取完整的URL
  getFullUrl(filepath) {
    let url = this.url;
    if (!url.endsWith('/')) {
      url += '/';
    }
    return url + filepath;
  }

  // 创建请求头
  getHeaders() {
    const credentials = this.username + ':' + this.password;
    // 将字符串转为 ArrayBuffer 再编码为 Base64（微信小程序不支持直接 Base64 编码字符串）
    const buffer = new Uint8Array([...credentials].map(c => c.charCodeAt(0))).buffer;
    return {
      'Authorization': 'Basic ' + wx.arrayBufferToBase64(buffer),
      'Content-Type': 'application/json',
    };
  }

  // 测试连接
  async testConnection() {
    try {
      const result = await this.request('PROPFIND', this.getFilePath(''));
      return { success: true, message: '连接成功' };
    } catch (error) {
      console.error('WebDAV 连接测试失败:', error);
      return { success: false, message: error.message || '连接失败' };
    }
  }

  // 上传文件
  async uploadFile(filename, data) {
    try {
      const jsonStr = JSON.stringify(data);
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      if (jsonStr.length > MAX_SIZE) {
        return { success: false, message: `数据过大（${(jsonStr.length / 1024 / 1024).toFixed(1)}MB），无法上传` };
      }
      const filepath = this.getFilePath(filename);
      const url = this.getFullUrl(filepath);

      const result = await wx.request({
        url: url,
        method: 'PUT',
        data: jsonStr,
        header: this.getHeaders(),
        timeout: this.timeout
      });

      if (result.statusCode >= 200 && result.statusCode < 300) {
        return { success: true, message: '上传成功' };
      } else {
        return { success: false, message: `上传失败: ${result.statusCode}` };
      }
    } catch (error) {
      console.error('上传文件失败:', error);
      return { success: false, message: error.message || '上传失败' };
    }
  }

  // 下载文件
  async downloadFile(filename) {
    try {
      const filepath = this.getFilePath(filename);
      const url = this.getFullUrl(filepath);

      const result = await wx.request({
        url: url,
        method: 'GET',
        header: this.getHeaders(),
        timeout: this.timeout
      });

      if (result.statusCode === 200) {
        try {
          const data = JSON.parse(result.data);
          return { success: true, data };
        } catch (parseError) {
          return { success: false, message: '数据解析失败' };
        }
      } else if (result.statusCode === 404) {
        return { success: false, message: '文件不存在' };
      } else {
        return { success: false, message: `下载失败: ${result.statusCode}` };
      }
    } catch (error) {
      console.error('下载文件失败:', error);
      return { success: false, message: error.message || '下载失败' };
    }
  }

  // 删除文件
  async deleteFile(filename) {
    try {
      const filepath = this.getFilePath(filename);
      const url = this.getFullUrl(filepath);

      const result = await wx.request({
        url: url,
        method: 'DELETE',
        header: this.getHeaders(),
        timeout: this.timeout
      });

      if (result.statusCode >= 200 && result.statusCode < 300) {
        return { success: true, message: '删除成功' };
      } else if (result.statusCode === 404) {
        return { success: true, message: '文件不存在' };
      } else {
        return { success: false, message: `删除失败: ${result.statusCode}` };
      }
    } catch (error) {
      console.error('删除文件失败:', error);
      return { success: false, message: error.message || '删除失败' };
    }
  }

  // 通用请求方法
  async request(method, filepath, data = null) {
    const url = this.getFullUrl(filepath);
    const options = {
      url: url,
      method: method,
      header: this.getHeaders(),
      timeout: this.timeout
    };

    if (data) {
      options.data = data;
    }

    const result = await wx.request(options);
    return result;
  }

  // 同步任务列表
  async syncTasks(tasks) {
    const filename = 'tasks.json';
    const result = await this.uploadFile(filename, {
      tasks: tasks,
      syncTime: new Date().toISOString(),
      version: '1.0'
    });
    return result;
  }

  // 下载任务列表
  async loadTasks() {
    const filename = 'tasks.json';
    const result = await this.downloadFile(filename);
    return result;
  }

  // 更新同步状态
  async updateSyncStatus(status) {
    const filename = 'sync_status.json';
    const data = {
      ...status,
      lastSyncTime: new Date().toISOString()
    };
    const result = await this.uploadFile(filename, data);
    return result;
  }
}

// 创建全局实例
const webdavClient = new WebDAVClient({
  url: '',
  username: '',
  password: '',
  path: '/WeChat-Todo/'
});

module.exports = webdavClient;
