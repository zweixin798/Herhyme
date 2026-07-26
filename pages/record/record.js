const { request } = require('../../utils/api')

const TYPES = [
  { label: '饮食', value: 'diet' },
  { label: '训练', value: 'training' },
  { label: '睡眠', value: 'sleep' },
  { label: '经期', value: 'cycle' },
  { label: '心情', value: 'mood' }
]

const TYPE_LABELS = TYPES.reduce((labels, item) => ({ ...labels, [item.value]: item.label }), {})

const PROMPTS = {
  diet: '可以写：今天吃了什么、食欲如何，或者有没有特别想吃的东西。',
  training: '可以写：练了什么、多久，结束后感觉轻松还是疲劳。',
  sleep: '可以写：几点入睡、睡了多久、夜间是否醒来以及醒来后的感觉。',
  cycle: '可以写：周期第几天、疼痛、流量或其他身体变化。',
  mood: '可以写：今天的情绪、压力、动力和身体感受。'
}

const PLACEHOLDERS = {
  diet: '例如：早餐吃了鸡蛋和全麦面包，午后食欲比较稳定。',
  training: '例如：完成 30 分钟下肢训练，最后两组有些吃力。',
  sleep: '例如：昨晚睡了 6 小时，今天醒来有点沉。',
  cycle: '例如：周期第 2 天，有轻微腹痛，能量比平时低。',
  mood: '例如：下午有点焦虑，但散步后感觉平静了一些。'
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    types: TYPES,
    ranges: [
      { label: '周', value: 'week' },
      { label: '月', value: 'month' },
      { label: '年', value: 'year' }
    ],
    activeType: 'diet',
    activeRange: 'week',
    message: '',
    prompt: PROMPTS.diet,
    placeholder: PLACEHOLDERS.diet,
    saved: false,
    counts: { diet: 0, training: 0, sleep: 0, cycle: 0, mood: 0 },
    chartItems: [],
    recentLogs: [],
    rangeTitle: '最近 7 天',
    rangeStats: { records: 0, activeDays: 0 },
    rangeInsight: '先留下第一条真实记录，身体地图会从这里开始。'
  },

  onLoad(options) {
    if (options.type && TYPE_LABELS[options.type]) this.selectTypeValue(options.type)
  },

  onShow() {
    const pendingType = wx.getStorageSync('herRhymePendingRecordType')
    if (pendingType && TYPE_LABELS[pendingType]) {
      this.selectTypeValue(pendingType)
      wx.removeStorageSync('herRhymePendingRecordType')
    }
    this.loadLogs()
  },

  selectType(event) {
    this.selectTypeValue(event.currentTarget.dataset.type)
  },

  selectTypeValue(type) {
    this.setData({ activeType: type, prompt: PROMPTS[type], placeholder: PLACEHOLDERS[type], saved: false })
  },

  selectRange(event) {
    this.setData({ activeRange: event.currentTarget.dataset.range })
    this.loadLogs()
  },

  onMessageInput(event) {
    this.setData({ message: event.detail.value, saved: false })
  },

  loadLogs() {
    const source = wx.getStorageSync('herRhymeLogs') || []
    let changed = false
    const logs = source.map((item, index) => {
      if (item.id) return item
      changed = true
      const timestamp = new Date(item.createdAt || Date.now()).getTime()
      return { ...item, id: `log-${timestamp}-${index}` }
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    if (changed) wx.setStorageSync('herRhymeLogs', logs)
    this.applyRange(logs)
  },

  applyRange(logs) {
    const now = new Date()
    const rangeLogs = logs.filter(item => this.isInRange(new Date(item.createdAt), now, this.data.activeRange))
    const counts = { diet: 0, training: 0, sleep: 0, cycle: 0, mood: 0 }
    rangeLogs.forEach(item => {
      if (counts[item.type] !== undefined) counts[item.type] += 1
    })

    const chartItems = this.buildChart(rangeLogs, now, this.data.activeRange)
    const activeDays = new Set(rangeLogs.map(item => dateKey(new Date(item.createdAt)))).size
    const topType = TYPES.slice().sort((a, b) => counts[b.value] - counts[a.value])[0]
    let rangeInsight = '先留下第一条真实记录，身体地图会从这里开始。'
    if (rangeLogs.length > 0 && rangeLogs.length < 5) rangeInsight = '已有一些身体信号，继续记录几天后再判断规律。'
    if (rangeLogs.length >= 5) rangeInsight = `${topType.label}是这个阶段记录最多的信号，可以结合其他状态一起观察。`

    this.setData({
      counts,
      chartItems,
      rangeTitle: this.rangeTitle(now, this.data.activeRange),
      rangeStats: { records: rangeLogs.length, activeDays },
      rangeInsight,
      recentLogs: rangeLogs.slice(0, 8).map(item => ({
        ...item,
        typeLabel: TYPE_LABELS[item.type] || '身体',
        dateLabel: this.formatDate(item.createdAt)
      }))
    })
  },

  isInRange(date, now, range) {
    if (Number.isNaN(date.getTime())) return false
    if (range === 'week') {
      const start = startOfDay(now)
      start.setDate(start.getDate() - 6)
      return date >= start && date <= now
    }
    if (range === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    return date.getFullYear() === now.getFullYear()
  },

  buildChart(logs, now, range) {
    let items = []
    if (range === 'week') {
      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      for (let offset = 6; offset >= 0; offset -= 1) {
        const date = startOfDay(now)
        date.setDate(date.getDate() - offset)
        const key = dateKey(date)
        items.push({ key, label: weekdays[date.getDay()], count: logs.filter(item => dateKey(new Date(item.createdAt)) === key).length })
      }
    } else if (range === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const bucketCount = Math.ceil(daysInMonth / 7)
      for (let index = 0; index < bucketCount; index += 1) {
        const start = index * 7 + 1
        const end = Math.min(daysInMonth, start + 6)
        const count = logs.filter(item => {
          const day = new Date(item.createdAt).getDate()
          return day >= start && day <= end
        }).length
        items.push({ key: `week-${index}`, label: `${index + 1}周`, count })
      }
    } else {
      for (let month = 0; month < 12; month += 1) {
        items.push({
          key: `month-${month}`,
          label: `${month + 1}`,
          count: logs.filter(item => new Date(item.createdAt).getMonth() === month).length
        })
      }
    }

    const max = Math.max(...items.map(item => item.count), 1)
    return items.map(item => ({ ...item, height: item.count ? Math.max(22, Math.round(item.count / max * 100)) : 8 }))
  },

  rangeTitle(date, range) {
    if (range === 'week') return '最近 7 天'
    if (range === 'month') return `${date.getMonth() + 1} 月`
    return `${date.getFullYear()} 年`
  },

  save() {
    const content = this.data.message.trim()
    if (!content) {
      wx.showToast({ title: '先写下一点今天的状态', icon: 'none' })
      return
    }
    const logs = wx.getStorageSync('herRhymeLogs') || []
    const log = {
      id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: this.data.activeType,
      content,
      summary: content.slice(0, 12),
      source: 'natural_language',
      createdAt: new Date().toISOString()
    }
    logs.unshift(log)
    wx.setStorageSync('herRhymeLogs', logs)
    request('/api/logs', 'POST', log).catch(() => {})
    this.setData({ saved: true, message: '' })
    this.loadLogs()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  deleteLog(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后，它将不再参与身体地图和基线统计。',
      confirmText: '删除',
      confirmColor: '#9b4d46',
      success: result => {
        if (!result.confirm) return
        const logs = (wx.getStorageSync('herRhymeLogs') || []).filter(item => item.id !== id)
        wx.setStorageSync('herRhymeLogs', logs)
        this.loadLogs()
      }
    })
  },

  formatDate(iso) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '日期未知'
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`
  }
})
