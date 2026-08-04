const GREETINGS = [
  'hi～今天怎么样',
  '要和luna聊聊吗',
  '今天身体感觉如何',
  '慢一点也没关系～'
]

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysSince(date, now = new Date()) {
  const timestamp = new Date(date).getTime()
  if (!Number.isFinite(timestamp)) return Infinity
  return Math.floor((startOfDay(now) - startOfDay(new Date(timestamp))) / 86400000)
}

function latestLog(logs, type) {
  return logs
    .filter(item => item.type === type && Number.isFinite(new Date(item.createdAt).getTime()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
}

function buildRecoveryReminder(logs, now = new Date()) {
  const training = latestLog(logs, 'training')
  if (!training) return ''

  const trainingDays = daysSince(training.createdAt, now)
  if (trainingDays < 0 || trainingDays > 4) return ''

  const activity = training.parsed?.training?.activity || ''
  const strengthPattern = /力量|抗阻|深蹲|硬拉|卧推|器械|练腿|练背|练胸/
  const isStrength = strengthPattern.test(activity) || strengthPattern.test(training.content || '')
  const mood = latestLog(logs, 'mood')
  const sleep = latestLog(logs, 'sleep')
  const hasRecoverySignal = (
    mood && daysSince(mood.createdAt, now) <= 1 && ['tired', 'stressed', 'low'].includes(mood.parsed?.mood)
  ) || (
    sleep && daysSince(sleep.createdAt, now) <= 1 && sleep.parsed?.sleep?.quality === 'poor'
  )

  if (trainingDays > 1 && !isStrength && !hasRecoverySignal) return ''
  if (trainingDays > 3 && !hasRecoverySignal) return ''

  const when = trainingDays === 0 ? '今天' : trainingDays === 1 ? '昨天' : `${trainingDays} 天前`
  const activityLabel = isStrength ? '力量训练' : (activity || '训练')
  return `你${when}刚进行过${activityLabel}，今天注意拉伸和恢复哦～`
}

Page({
  data: {
    todayLabel: '',
    greetingText: GREETINGS[0],
    greetingIndex: 0,
    quickItems: [],
    activePlans: [],
    recoveryReminder: '',
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
    const latest = type => latestLog(logs, type)
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
      logCount: logs.length,
      quickItems: [
        { type: 'diet', label: '饮食', value: profile.plan?.calories ? `${profile.plan.calories} kcal` : latestSummary('diet') },
        { type: 'training', label: '训练', value: latestSummary('training') },
        { type: 'sleep', label: '睡眠', value: latestSummary('sleep') },
        { type: 'cycle', label: '经期', value: latestSummary('cycle', cycleLength ? `周期约 ${cycleLength} 天` : '未记录') },
        { type: 'mood', label: '心情', value: latestSummary('mood') }
      ],
      activePlans: activePlans.slice(0, 3),
      recoveryReminder: buildRecoveryReminder(logs),
      planProgressText: activePlans.length ? `今天完成 ${completedPlans} / ${activePlans.length}` : '还没有启用计划',
      trendPercent: Math.min(100, logs.length * 14),
      trendText: logs.length ? '你的身体地图正在形成' : '先建立你的个人节律'
    })
    this.startGreetingRotation()
  },

  onHide() {
    this.stopGreetingRotation()
  },

  onUnload() {
    this.stopGreetingRotation()
  },

  startGreetingRotation() {
    this.stopGreetingRotation()
    const greetingIndex = Math.floor(Date.now() / 5000) % GREETINGS.length
    this.setData({ greetingIndex, greetingText: GREETINGS[greetingIndex] })
    this.greetingTimer = setInterval(() => {
      const nextIndex = (this.data.greetingIndex + 1) % GREETINGS.length
      this.setData({ greetingIndex: nextIndex, greetingText: GREETINGS[nextIndex] })
    }, 5000)
  },

  stopGreetingRotation() {
    if (!this.greetingTimer) return
    clearInterval(this.greetingTimer)
    this.greetingTimer = null
  },

  openRecord(event) {
    const type = event.currentTarget.dataset.type || ''
    if (type) wx.setStorageSync('herRhymePendingRecordType', type)
    wx.navigateTo({ url: '/pages/checkin/checkin' })
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
