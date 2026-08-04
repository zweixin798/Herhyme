const TYPE_ORDER = ['diet', 'training', 'sleep', 'cycle', 'mood']
const TYPE_LABELS = {
  diet: '饮食',
  training: '训练',
  sleep: '睡眠',
  cycle: '经期',
  mood: '心情'
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

function daysSince(value, now) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Infinity
  return Math.floor((startOfDay(now) - startOfDay(date)) / 86400000)
}

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

Page({
  data: {
    ranges: [
      { label: '周', value: 'week' },
      { label: '月', value: 'month' },
      { label: '年', value: 'year' }
    ],
    activeRange: 'week',
    counts: { diet: 0, training: 0, sleep: 0, cycle: 0, mood: 0 },
    chartItems: [],
    rangeTitle: '最近 7 天',
    rangeStats: { records: 0, activeDays: 0 },
    rangeInsight: '真实记录会逐渐连成你的身体节律。',
    recovery: {
      status: '等待身体信号',
      label: 'RECOVERY · 待建立',
      summary: '有了睡眠、训练或心情记录后，这里会开始呈现恢复状态。',
      tone: 'empty'
    },
    trendSignals: [],
    recommendations: [],
    completenessText: '0 / 7 天',
    coverageText: '0 / 5 类'
  },

  onShow() {
    this.loadLogs()
  },

  selectRange(event) {
    this.setData({ activeRange: event.currentTarget.dataset.range })
    this.loadLogs()
  },

  loadLogs() {
    const source = wx.getStorageSync('herRhymeLogs') || []
    const logs = source
      .filter(item => item && TYPE_ORDER.includes(item.type) && !Number.isNaN(new Date(item.createdAt).getTime()))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const now = new Date()
    this.applyRange(logs, now)
    this.applyRecentTrends(logs, now)
  },

  applyRange(logs, now) {
    const rangeLogs = logs.filter(item => this.isInRange(new Date(item.createdAt), now, this.data.activeRange))
    const counts = { diet: 0, training: 0, sleep: 0, cycle: 0, mood: 0 }
    rangeLogs.forEach(item => {
      if (counts[item.type] !== undefined) counts[item.type] += 1
    })

    const activeDays = new Set(rangeLogs.map(item => dateKey(new Date(item.createdAt)))).size
    const topType = TYPE_ORDER.slice().sort((a, b) => counts[b] - counts[a])[0]
    let rangeInsight = '真实记录会逐渐连成你的身体节律。'
    if (rangeLogs.length > 0 && rangeLogs.length < 5) rangeInsight = '已经有一些身体信号，再多记录几天会更容易看见变化。'
    if (rangeLogs.length >= 5) rangeInsight = `${TYPE_LABELS[topType]}是这段时间出现最多的信号，可以和睡眠、训练及心情一起观察。`

    this.setData({
      counts,
      chartItems: this.buildChart(rangeLogs, now, this.data.activeRange),
      rangeTitle: this.rangeTitle(now, this.data.activeRange),
      rangeStats: { records: rangeLogs.length, activeDays },
      rangeInsight
    })
  },

  applyRecentTrends(logs, now) {
    const recentLogs = logs.filter(item => {
      const days = daysSince(item.createdAt, now)
      return days >= 0 && days <= 6
    })
    const byType = type => recentLogs.filter(item => item.type === type)
    const trainingLogs = byType('training')
    const sleepLogs = byType('sleep')
    const moodLogs = byType('mood')
    const cycleLogs = byType('cycle')
    const dietLogs = byType('diet')
    const activeDays = new Set(recentLogs.map(item => dateKey(new Date(item.createdAt)))).size
    const coveredDomains = TYPE_ORDER.filter(type => byType(type).length > 0).length

    const trainingMinutes = trainingLogs
      .map(item => finiteNumber(item.parsed?.training?.duration_min))
      .filter(value => value !== null)
    const totalTrainingMinutes = trainingMinutes.length
      ? trainingMinutes.reduce((sum, value) => sum + value, 0)
      : null
    const sleepMinutes = sleepLogs
      .map(item => finiteNumber(item.parsed?.sleep?.duration_min))
      .filter(value => value !== null && value > 0)
    const averageSleepMinutes = sleepMinutes.length
      ? Math.round(sleepMinutes.reduce((sum, value) => sum + value, 0) / sleepMinutes.length)
      : null
    const negativeMoods = moodLogs.filter(item => ['tired', 'stressed', 'low'].includes(item.parsed?.mood))
    const highPain = cycleLogs.some(item => {
      const pain = finiteNumber(item.parsed?.cycle?.pain_level)
      return pain !== null && pain >= 7
    })
    const latestTraining = trainingLogs[0]
    const latestTrainingDays = latestTraining ? daysSince(latestTraining.createdAt, now) : Infinity
    const strengthPattern = /力量|抗阻|深蹲|硬拉|卧推|器械|练腿|练背|练胸/
    const latestActivity = latestTraining?.parsed?.training?.activity || latestTraining?.content || ''
    const recentStrength = latestTrainingDays <= 2 && strengthPattern.test(latestActivity)

    const recoverySignalCount = trainingLogs.length + sleepLogs.length + moodLogs.length + cycleLogs.length
    let recovery = {
      status: '恢复信号正在形成',
      label: 'RECOVERY · BUILDING',
      summary: '近期已经有一些身体反馈，再积累几天睡眠、训练和心情信号后判断会更可靠。',
      tone: 'recovering'
    }
    if (!recentLogs.length) {
      recovery = {
        status: '等待身体信号',
        label: 'RECOVERY · 待建立',
        summary: '有了睡眠、训练或心情记录后，这里会开始呈现恢复状态。',
        tone: 'empty'
      }
    } else if (highPain) {
      recovery = {
        status: '今天优先照顾不适',
        label: 'RECOVERY · 留意',
        summary: '近期记录了较高疼痛程度，先降低负担；若持续、加重或伴随严重不适，请及时寻求专业帮助。',
        tone: 'attention'
      }
    } else if ((averageSleepMinutes !== null && averageSleepMinutes < 360) || negativeMoods.length >= 2) {
      recovery = {
        status: '恢复空间有些不足',
        label: 'RECOVERY · SLOW DOWN',
        summary: '近期睡眠或情绪负荷信号偏多，今天适合把训练强度和日程留出余量。',
        tone: 'attention'
      }
    } else if (latestTrainingDays <= 1) {
      recovery = {
        status: '身体正在恢复',
        label: 'RECOVERY · IN PROGRESS',
        summary: `最近刚完成${strengthPattern.test(latestActivity) ? '力量训练' : '训练'}，今天留意酸痛、疲惫和睡眠反馈。`,
        tone: 'recovering'
      }
    } else if (recoverySignalCount >= 3 && activeDays >= 3) {
      recovery = {
        status: '当前节奏平稳',
        label: 'RECOVERY · STABLE',
        summary: '最近没有出现明显的恢复负担信号，继续留意睡眠和训练后的感受。',
        tone: 'steady'
      }
    }

    const dietEstimates = dietLogs.filter(item => (item.parsed?.diet_items || []).some(food => finiteNumber(food.calories_est) !== null)).length
    const trendSignals = [
      {
        key: 'diet',
        label: '饮食',
        value: dietLogs.length ? `${dietLogs.length} 次记录` : '待记录',
        detail: dietLogs.length ? `${dietEstimates} 次含营养估算` : '还没有近期饮食信号'
      },
      {
        key: 'training',
        label: '训练',
        value: trainingLogs.length ? `${trainingLogs.length} 次` : '待记录',
        detail: totalTrainingMinutes === null ? (trainingLogs.length ? '还缺少训练时长' : '还没有近期训练信号') : `累计 ${Math.round(totalTrainingMinutes)} 分钟`
      },
      {
        key: 'sleep',
        label: '睡眠',
        value: averageSleepMinutes === null ? (sleepLogs.length ? '已记录' : '待记录') : `均值 ${(averageSleepMinutes / 60).toFixed(1)} 小时`,
        detail: sleepMinutes.length ? `${sleepMinutes.length} 次有效时长记录` : '还缺少睡眠时长'
      },
      {
        key: 'cycle',
        label: '经期',
        value: cycleLogs.length ? `${cycleLogs.length} 次记录` : '待记录',
        detail: cycleLogs.length ? '已进入近期身体信号' : '还没有近期周期信号'
      },
      {
        key: 'mood',
        label: '心情',
        value: moodLogs.length ? (negativeMoods.length ? `${negativeMoods.length} 次负荷信号` : '整体平稳') : '待记录',
        detail: moodLogs.length ? `${moodLogs.length} 次心情记录` : '还没有近期心情信号'
      }
    ]

    const recommendations = []
    if (highPain) recommendations.push('今天先选择低负担活动或休息，并持续观察疼痛变化。')
    if (averageSleepMinutes !== null && averageSleepMinutes < 360) recommendations.push('近期睡眠均值偏短，优先为今晚保留更完整的睡眠时间。')
    if (recentStrength) recommendations.push('力量训练后 48 小时内，可以安排轻量活动和温和拉伸。')
    if (negativeMoods.length >= 2) recommendations.push('近期疲惫、压力或低落信号较多，计划可以先留出一点弹性。')
    if (activeDays < 3) recommendations.push(`近 7 天已有 ${activeDays} 个记录日，再连续记录几天后趋势会更可靠。`)
    if (coveredDomains < 3 && recentLogs.length) recommendations.push('可以补一条睡眠或心情记录，让恢复判断更完整。')
    if (!recommendations.length) recommendations.push('当前节奏没有明显偏离，继续保持记录并观察训练后的恢复感受。')

    this.setData({
      recovery,
      trendSignals,
      recommendations: recommendations.slice(0, 3),
      completenessText: `${activeDays} / 7 天`,
      coverageText: `${coveredDomains} / 5 类`
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
    const items = []
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
  }
})
