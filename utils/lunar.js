/**
 * 农历转换工具
 * 基于经典农历数据表实现公历转农历
 */

// 农历数据 1900-2100，每个年份用一个十六进制数编码
// bit[19:16] 闰月月份（0无闰月），bit[15:4] 1~12月大小月（1=30天 0=29天），bit[3:0] 闰月大小月
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,
  0x0d520
]

// 天干
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
// 地支
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
// 生肖
const SHENG_XIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
// 农历月名
const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
// 农历日名
const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
]

// 节气数据（近似计算）
const SOLAR_TERMS = [
  [0, 6], [15, 20], [30, 4], [45, 20], [60, 5], [75, 21],
  [90, 6], [105, 22], [120, 6], [135, 21], [150, 6], [165, 22],
  [180, 7], [195, 23], [210, 8], [225, 23], [240, 8], [255, 23],
  [270, 9], [285, 24], [300, 8], [315, 23], [330, 8], [345, 22]
]
const TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
]

/**
 * 获取农历某年的总天数
 */
function _lunarYearDays(y) {
  let sum = 348
  let info = LUNAR_INFO[y - 1900]
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (info & i) ? 1 : 0
  }
  return sum + _leapDays(y)
}

/**
 * 获取闰月天数，无闰月返回 0
 */
function _leapDays(y) {
  if (_leapMonth(y)) {
    return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29
  }
  return 0
}

/**
 * 获取闰月月份，无闰月返回 0
 */
function _leapMonth(y) {
  return LUNAR_INFO[y - 1900] & 0xf
}

/**
 * 获取农历某年某月天数
 */
function _monthDays(y, m) {
  return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29
}

/**
 * 公历转农历
 * @param {number} year  公历年
 * @param {number} month 公历月（1-12）
 * @param {number} day   公历日
 * @returns {object} { lunarYear, lunarMonth, lunarDay, isLeap, dayStr, monthStr, termStr, isTerm, isFestival }
 */
function solarToLunar(year, month, day) {
  // 基准日：1900年1月31日 = 农历正月初一
  const baseDate = new Date(1900, 0, 31)
  const targetDate = new Date(year, month - 1, day)
  let offset = Math.floor((targetDate - baseDate) / 86400000)

  let lunarYear, lunarMonth, lunarDay, isLeap = false

  // 计算农历年
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
    const yearDays = _lunarYearDays(lunarYear)
    offset -= yearDays
  }
  if (offset < 0) {
    offset += _lunarYearDays(--lunarYear)
  }

  // 计算农历月
  const leap = _leapMonth(lunarYear)
  for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
    // 闰月
    if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) {
      --lunarMonth
      isLeap = true
      const days = _leapDays(lunarYear)
      offset -= days
    } else {
      offset -= _monthDays(lunarYear, lunarMonth)
    }
    if (isLeap && lunarMonth === (leap + 1)) isLeap = false
  }
  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) {
      isLeap = false
    } else {
      isLeap = true
      --lunarMonth
    }
  }
  if (offset < 0) {
    offset += isLeap ? _leapDays(lunarYear) : _monthDays(lunarYear, lunarMonth)
    --lunarMonth
  }

  lunarDay = offset + 1

  // 生成显示文本
  const dayStr = DAY_NAMES[lunarDay - 1] || ''
  const monthStr = (isLeap ? '闰' : '') + MONTH_NAMES[lunarMonth - 1] + '月'

  // 节气计算（近似）
  const termStr = _getSolarTerm(year, month, day)

  // 农历节日
  const festival = _getLunarFestival(lunarMonth, lunarDay, isLeap)

  // 优先显示：节气 > 农历节日 > 初一显示月名 > 初二~廿九显示日名
  let displayStr = dayStr
  let displayType = 'day' // day | month | term | festival

  if (termStr) {
    displayStr = termStr
    displayType = 'term'
  } else if (festival) {
    displayStr = festival
    displayType = 'festival'
  } else if (lunarDay === 1) {
    displayStr = monthStr
    displayType = 'month'
  }

  return {
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeap,
    dayStr,
    monthStr,
    termStr,
    isTerm: !!termStr,
    isFestival: !!festival,
    displayStr,
    displayType
  }
}

/**
 * 近似计算节气（仅精确到日期）
 */
function _getSolarTerm(year, month, day) {
  const dayOfYear = _dayOfYear(year, month, day)
  for (let i = 0; i < SOLAR_TERMS.length; i++) {
    if (dayOfYear === SOLAR_TERMS[i][0]) {
      return TERM_NAMES[i]
    }
  }
  return ''
}

/**
 * 计算一年中第几天
 */
function _dayOfYear(year, month, day) {
  const daysInMonth = [31, _isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let doy = 0
  for (let i = 0; i < month - 1; i++) {
    doy += daysInMonth[i]
  }
  doy += day
  return doy
}

function _isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
}

/**
 * 农历节日（常用）
 */
function _getLunarFestival(month, day, isLeap) {
  if (isLeap) return ''
  const key = month + '-' + day
  const festivals = {
    '1-1': '春节',
    '1-15': '元宵节',
    '2-2': '龙抬头',
    '5-5': '端午节',
    '7-7': '七夕',
    '7-15': '中元节',
    '8-15': '中秋节',
    '9-9': '重阳节',
    '12-8': '腊八节',
    '12-30': '除夕',
    '12-29': '除夕'
  }
  return festivals[key] || ''
}

/**
 * 获取农历干支纪年
 */
function getGanZhiYear(lunarYear) {
  const ganIdx = (lunarYear - 4) % 10
  const zhiIdx = (lunarYear - 4) % 12
  return TIAN_GAN[ganIdx] + DI_ZHI[zhiIdx]
}

/**
 * 获取生肖
 */
function getShengXiao(lunarYear) {
  return SHENG_XIAO[(lunarYear - 4) % 12]
}

module.exports = {
  solarToLunar,
  getGanZhiYear,
  getShengXiao
}
