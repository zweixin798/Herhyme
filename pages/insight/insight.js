const { request } = require('../../utils/api')

Page({
  data: { logs: [], counts: { diet: 0, training: 0, sleep: 0, mood: 0, cycle: 0 }, insightText: '记录得越真实，越容易看见自己的规律。' },

  onShow() {
    this.loadLocalLogs()
    request('/api/insights').then(payload => {
      const remoteLogs = payload.insight?.logs || []
      if (remoteLogs.length) this.applyLogs(remoteLogs.map(item => ({ ...item, createdAt: item.created_at })))
    }).catch(() => {})
  },

  loadLocalLogs() {
    this.applyLogs(wx.getStorageSync('herRhymeLogs') || [])
  },

  applyLogs(sourceLogs) {
    const typeLabels = { diet: '饮食', training: '训练', sleep: '睡眠', mood: '心情', cycle: '经期' }
    const logs = sourceLogs.map(item => ({
      ...item,
      typeLabel: typeLabels[item.type] || '身体',
      dateLabel: this.formatDate(item.createdAt || item.created_at)
    }))
    const counts = { diet: 0, training: 0, sleep: 0, mood: 0, cycle: 0 }
    logs.forEach(item => { if (counts[item.type] !== undefined) counts[item.type] += 1 })
    this.setData({ logs: logs.slice(0, 8), counts, insightText: logs.length >= 3 ? '你的身体地图已经有一些线索了，继续记录同一类状态，规律会更清晰。' : '先不急着下结论，给自己一周时间留下真实记录。' })
  },

  formatDate(iso) {
    const date = new Date(iso)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
})
