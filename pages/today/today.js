Page({
  data: { todayLabel: '', plan: {}, status: {}, recommendation: {}, trainingLabel: '未记录', latestMood: '未记录', cycleLabel: '未记录', trendPercent: 14, trendText: '先建立你的个人节律', logCount: 0 },

  onShow() {
    const profile = wx.getStorageSync('herRhymeProfile') || {}
    const logs = wx.getStorageSync('herRhymeLogs') || []
    const cycleLength = profile.cycleLength || 28
    this.setData({
      todayLabel: this.formatDate(new Date()),
      plan: profile.plan || {},
      logCount: logs.length,
      status: { cycle: cycleLength ? `周期约 ${cycleLength} 天` : '周期待记录', sleep: '睡眠待记录', energy: '状态待记录' },
      recommendation: { title: logs.length ? '继续听见身体的反馈' : '从一句话记录开始', detail: logs.length ? '今天不需要做完美，只需要留下一个真实的身体信号。' : '记录饮食、心情、训练或经期状态，Her Rhyme 会逐步建立你的个人基线。' },
      trainingLabel: logs.find(item => item.type === 'training')?.summary || '未记录',
      latestMood: logs.find(item => item.type === 'mood')?.summary || '未记录',
      cycleLabel: logs.find(item => item.type === 'cycle')?.summary || '未记录',
      trendPercent: Math.min(100, logs.length * 14),
      trendText: logs.length ? '你的身体地图正在形成' : '先建立你的个人节律'
    })
  },

  formatDate(date) {
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  }
})
