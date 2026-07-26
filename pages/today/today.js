Page({
  data: {
    todayLabel: '',
    plan: {},
    status: {},
    recommendation: {},
    quickItems: [],
    activePlans: [],
    planProgressText: '还没有启用计划',
    trendPercent: 0,
    trendText: '先建立你的个人节律',
    logCount: 0
  },

  onShow() {
    const profile = wx.getStorageSync('herRhymeProfile') || {}
    const logs = wx.getStorageSync('herRhymeLogs') || []
    const plans = wx.getStorageSync('herRhymePlans') || []
    const cycleLength = profile.cycleLength || 28
    const today = this.dateKey(new Date())
    const latest = type => logs.find(item => item.type === type)
    const latestSummary = (type, fallback = '未记录') => latest(type)?.summary || fallback
    const activePlans = plans
      .filter(item => item.enabled)
      .map(item => ({
        ...item,
        completedToday: (item.completionDates || []).includes(today) || item.completedOn === today
      }))
    const completedPlans = activePlans.filter(item => item.completedToday).length

    this.setData({
      todayLabel: this.formatDate(new Date()),
      plan: profile.plan || {},
      logCount: logs.length,
      status: {
        cycle: cycleLength ? `周期约 ${cycleLength} 天` : '周期待记录',
        sleep: latestSummary('sleep', '睡眠待记录'),
        energy: latestSummary('mood', '状态待记录')
      },
      recommendation: { title: logs.length ? '继续听见身体的反馈' : '从一句话记录开始', detail: logs.length ? '今天不需要做完美，只需要留下一个真实的身体信号。' : '记录饮食、训练、睡眠、经期或心情，Her Rhyme 会逐步建立你的个人基线。' },
      quickItems: [
        { type: 'diet', label: '饮食', value: profile.plan?.calories ? `${profile.plan.calories} kcal` : latestSummary('diet'), note: profile.plan?.protein ? `${profile.plan.protein}g 蛋白质目标` : '记录今天吃了什么' },
        { type: 'training', label: '训练', value: latestSummary('training'), note: '按今天状态调整' },
        { type: 'sleep', label: '睡眠', value: latestSummary('sleep'), note: '时长与睡眠感受' },
        { type: 'mood', label: '心情', value: latestSummary('mood'), note: '写下情绪和能量' },
        { type: 'cycle', label: '经期', value: latestSummary('cycle'), note: '记录周期信号', wide: true }
      ],
      activePlans: activePlans.slice(0, 3),
      planProgressText: activePlans.length ? `今天完成 ${completedPlans} / ${activePlans.length}` : '还没有启用计划',
      trendPercent: Math.min(100, logs.length * 14),
      trendText: logs.length ? '你的身体地图正在形成' : '先建立你的个人节律'
    })
  },

  openRecord(event) {
    const type = event.currentTarget.dataset.type || ''
    if (type) wx.setStorageSync('herRhymePendingRecordType', type)
    wx.switchTab({ url: '/pages/record/record' })
  },

  openBodyMap() {
    wx.switchTab({ url: '/pages/record/record' })
  },

  openPlans() {
    wx.switchTab({ url: '/pages/plan/plan' })
  },

  openAi() {
    wx.showToast({ title: 'AI 对话正在准备中', icon: 'none' })
  },

  dateKey(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  formatDate(date) {
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  }
})
