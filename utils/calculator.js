function calculatePlan(profile) {
  const weight = Number(profile.weight) || 0
  const height = Number(profile.height) || 0
  const age = Number(profile.age) || 0
  const sex = profile.sex === 'male' ? 5 : -161
  const bmr = Math.round(10 * weight + 6.25 * height - 5 * age + sex)
  const activityMap = {
    light: 1.35,
    moderate: 1.5,
    high: 1.65
  }
  const tdee = Math.round(bmr * (activityMap[profile.activity] || 1.35))
  const calories = Math.max(1200, Math.round(tdee - 350))
  const protein = Math.round(weight * 1.6)
  const fat = Math.round((calories * 0.25) / 9)
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))

  return { bmr, tdee, calories, protein, fat, carbs }
}

function average(values) {
  if (!values.length) return 0
  return Math.round((values.reduce((sum, value) => sum + Number(value), 0) / values.length) * 10) / 10
}

function getWeeklyDecision(weightLogs, targetRate = 0.4) {
  if (weightLogs.length < 2) {
    return { status: 'insufficient', label: '继续记录', detail: '至少记录两次体重后，再看趋势会更可靠。' }
  }

  const sorted = weightLogs.slice().sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted.slice(-7)
  const previous = sorted.slice(-14, -7)
  const recentAverage = average(recent.map(item => item.weight))
  const previousAverage = previous.length ? average(previous.map(item => item.weight)) : recentAverage
  const loss = Math.round((previousAverage - recentAverage) * 10) / 10

  if (!previous.length) {
    return { status: 'building', label: '建立趋势', detail: `本周平均体重 ${recentAverage} kg，继续记录后再调整。` }
  }
  if (loss < targetRate * 0.55) {
    return { status: 'slow', label: '下降偏慢', detail: '先观察下一周趋势，可考虑小幅减少碳水。' }
  }
  if (loss > targetRate * 1.8) {
    return { status: 'fast', label: '下降偏快', detail: '先不要继续减量，优先保证恢复和训练状态。' }
  }
  return { status: 'on-track', label: '节奏稳定', detail: '当前趋势接近目标，保持计划即可。' }
}

module.exports = { calculatePlan, average, getWeeklyDecision }
