# WeChat-Todo

一个功能丰富的微信小程序，集成任务管理、连续日历视图、多功能计算器，支持深色模式与 WebDAV 数据同步。

## 功能概览

### 任务管理
- 任务的创建、编辑、删除、完成状态切换
- 优先级管理：普通、重要、紧急、重要且紧急
- 时间设置：支持开始/结束时间、全天任务
- 提醒设置：5 分钟、15 分钟、30 分钟、1 小时、1 天等选项
- 附件支持：图片、语音等附件上传和预览
- 地点选择与导航
- 关键词搜索、多维度筛选（全部/待办/已完成/重要）
- 按日期分组显示、象限视图（重要紧急矩阵）
- 实时任务统计

### 连续日历
- 类似滴答清单的连续月视图，月份间无分隔
- 动态月份边界分割线
- 有任务的日期标记
- 点击日期查看当天任务、快速添加任务
- 无限滚动加载更多月份
- 返回今天、星期起始设置（周一/周日）
- 农历与节日信息显示

### 多功能计算器
- **基础计算器**：四则运算、百分比、正负切换、运算符优先级、实时结果预览
- **统计计算器**：最多 20 个数字，实时计算总和/平均值/中位数/最大最小值/极差/方差/标准差/乘积/众数/增长率，以及数字关系分析和比例分析
- **百分比计算器**：数值与百分比的互算（差值、增加后、减少后），支持折扣转换
- **单价换算**：重量/长度/面积/容量四类单位，数量与总价联动，多单位单价实时换算
- **股市计算器**：买入价/卖出价/股数/盈亏/盈亏率的全链路双向推导计算
- 模块可折叠、排序、显示/隐藏
- 千分位显示开关
- 深色模式适配

### 数据同步与设置
- WebDAV 协议数据同步，可配置自动同步间隔
- 数据导出（JSON）/ 导入（剪贴板）
- 深色模式主题切换
- 订阅消息通知（需配置）
- 孤立附件自动清理

## 技术架构

```
┌──────────────────────────────────────────────┐
│                 页面层 (Pages)                │
│  task / task/edit / calendar / calculator     │
│  settings / data-manage / calculator-settings │
│  calendar-settings                            │
├──────────────────────────────────────────────┤
│               组件层 (Components)             │
│       search-module / task-list / tab-bar     │
├──────────────────────────────────────────────┤
│               模型层 (Models)                 │
│            TaskModel - 任务数据模型            │
├──────────────────────────────────────────────┤
│               工具层 (Utils)                  │
│  task / task-helpers / db / storage-manager   │
│  sync-manager / webdav / notification         │
│  file-manager / calendar-cache / theme        │
│  lunar / helpers                              │
├──────────────────────────────────────────────┤
│               存储层 (Storage)                │
│        StorageManager / WebDAV / wx.Storage   │
└──────────────────────────────────────────────┘
```

## 项目结构

```
WeChat-Todo/
├── app.js                      # 小程序入口（初始化/主题/同步/通知）
├── app.json                    # 小程序配置（页面路由、TabBar、权限）
├── app.wxss                    # 全局样式（CSS 变量、深色模式、通用组件）
├── sitemap.json                # 搜索配置
│
├── pages/
│   ├── task/                   # 任务列表主页
│   │   ├── index.*             # 任务列表、筛选、搜索、象限视图
│   │   └── edit/               # 任务创建与编辑
│   ├── calendar/               # 连续流畅日历视图
│   ├── calculator/             # 多功能计算器（5 合 1）
│   ├── settings/               # 设置页面（统计、主题、通知、WebDAV）
│   ├── data-manage/            # 数据管理（导入/导出/清除）
│   ├── calculator-settings/    # 计算器模块排序与开关
│   └── calendar-settings/      # 日历设置（星期起始、已完成显示）
│
├── components/
│   ├── search-module/          # 搜索组件
│   └── task-list/              # 任务列表组件
│
├── models/
│   └── task-model.js           # 任务数据模型（CRUD、验证、月度分表）
│
├── utils/
│   ├── task.js                 # 任务管理器（TaskManager）
│   ├── task-helpers.js         # 任务辅助函数
│   ├── db.js                   # 数据库操作类
│   ├── storage-manager.js      # 统一存储管理
│   ├── sync-manager.js         # WebDAV 同步管理
│   ├── webdav.js               # WebDAV 客户端
│   ├── notification.js         # 通知管理
│   ├── file-manager.js         # 附件文件管理
│   ├── calendar-cache.js       # 日历缓存
│   ├── theme.js                # 主题管理（深色模式）
│   ├── lunar.js                # 农历计算
│   └── helpers.js              # 通用工具函数
│
├── custom-tab-bar/             # 自定义 TabBar 组件
├── assets/icons/               # TabBar 图标资源
└── package.json                # 项目依赖配置
```

## 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/your-username/WeChat-Todo.git
cd WeChat-Todo
```

### 2. 安装依赖
```bash
npm install
```

### 3. 导入微信开发者工具
- 打开微信开发者工具，选择「导入项目」
- 选择项目根目录
- 填入自己的 AppID（或使用测试号）
- 编译运行

## 配置说明

### 订阅消息模板
1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 进入「订阅消息」模块，创建消息模板
3. 将模板 ID 配置到 `utils/notification.js` 中

### WebDAV 同步
在设置页面配置：
- 服务器地址
- 用户名
- 密码
- 自动同步间隔

### 权限说明
小程序需要以下权限：
- `scope.userLocation`：位置权限（用于任务地点选择与导航）

## 许可证

MIT License - 详见 [LICENSE](./LICENSE)
