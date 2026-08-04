const { request } = require('../../utils/api')

const TYPE_ORDER = ['diet', 'training', 'sleep', 'cycle', 'mood']
const TYPE_LABELS = {
  diet: '饮食',
  training: '训练',
  sleep: '睡眠',
  cycle: '经期',
  mood: '心情',
  general: '其他'
}

const MOOD_VALUES = ['', 'happy', 'calm', 'tired', 'stressed', 'low']
const MOOD_LABELS = ['未识别', '开心', '平静', '疲惫', '压力大', '低落']
const FLOW_VALUES = ['', 'light', 'medium', 'heavy']
const FLOW_LABELS = ['未识别', '少量', '中等', '较多']

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
    ranges: [
      { label: '周', value: 'week' },
      { label: '月', value: 'month' },
      { label: '年', value: 'year' }
    ],
    moodLabels: MOOD_LABELS,
    flowLabels: FLOW_LABELS,
    activeRange: 'week',
    message: '',
    placeholder: '例如：早餐吃了鸡蛋和全麦面包，午后食欲比较稳定。',
    saved: false,
    parsing: false,
    parseError: '',
    parsed: null,
    parsePreviewText: '',
    parseNoticeText: '',
    parseEdited: false,
    originalParsed: null,
    parserRules: null,
    promptVersion: '',
    ruleVersion: '',
    pendingLogId: '',
    moodIndex: 0,
    flowIndex: 0,
    counts: { diet: 0, training: 0, sleep: 0, cycle: 0, mood: 0 },
    chartItems: [],
    recentLogs: [],
    rangeTitle: '最近 7 天',
    rangeStats: { records: 0, activeDays: 0 },
    rangeInsight: '先留下第一条真实记录，身体地图会从这里开始。'
  },

  onShow() {
    wx.removeStorageSync('herRhymePendingRecordType')
    this.loadLogs()
  },

  onMessageInput(event) {
    const value = event.detail.value
    this.setData({
      message: value,
      saved: false,
      parsed: null,
      parsePreviewText: '',
      parseNoticeText: this.localSafetyNotice(value),
      parseEdited: false,
      originalParsed: null,
      parserRules: null,
      promptVersion: '',
      ruleVersion: '',
      pendingLogId: '',
      parseError: ''
    })
  },

  selectRange(event) {
    this.setData({ activeRange: event.currentTarget.dataset.range })
    this.loadLogs()
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
    const topType = TYPE_ORDER.slice().sort((a, b) => counts[b] - counts[a])[0]
    let rangeInsight = '先留下第一条真实记录，身体地图会从这里开始。'
    if (rangeLogs.length > 0 && rangeLogs.length < 5) rangeInsight = '已有一些身体信号，继续记录几天后再判断规律。'
    if (rangeLogs.length >= 5) rangeInsight = `${TYPE_LABELS[topType]}是这个阶段记录最多的信号，可以结合其他状态一起观察。`

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
    if (this.data.parsing) return

    this.setData({
      parsing: true,
      parseError: '',
      parsed: null,
      parsePreviewText: '',
      parseNoticeText: this.localSafetyNotice(content),
      parseEdited: false,
      originalParsed: null,
      parserRules: null,
      promptVersion: '',
      ruleVersion: '',
      pendingLogId: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      saved: false
    })
    request('/api/logs/parse', 'POST', { content })
      .then(payload => {
        const parsed = this.normalizeParsed(payload.parsed)
        this.setData({
          parsing: false,
          parsed,
          originalParsed: JSON.parse(JSON.stringify(payload.parsed || {})),
          parserRules: payload.rules || null,
          promptVersion: payload.prompt_version || 'record_parser_unknown',
          ruleVersion: payload.rule_version || payload.rules?.rule_version || 'record_rules_unknown',
          moodIndex: Math.max(0, MOOD_VALUES.indexOf(parsed.mood)),
          flowIndex: Math.max(0, FLOW_VALUES.indexOf(parsed.cycle?.flow)),
          parsePreviewText: this.describeParsed(parsed),
          parseNoticeText: this.describeRules(payload.rules) || this.localSafetyNotice(content)
        })
      })
      .catch(error => {
        this.setData({ parsing: false, parseError: this.parseErrorMessage(error) })
      })
  },

  normalizeParsed(input) {
    const parsed = input && typeof input === 'object' ? { ...input } : {}
    if (!TYPE_LABELS[parsed.type]) parsed.type = 'general'
    parsed.typeLabel = TYPE_LABELS[parsed.type]
    if (parsed.type === 'training') parsed.training = parsed.training || {}
    if (parsed.type === 'cycle') parsed.cycle = parsed.cycle || {}
    if (parsed.type === 'sleep') parsed.sleep = parsed.sleep || {}
    if (parsed.type === 'diet' && !Array.isArray(parsed.diet_items)) parsed.diet_items = []
    if (Array.isArray(parsed.diet_items)) {
      parsed.diet_items = parsed.diet_items.map(item => ({
        name: item.name || '',
        amount: item.amount || '',
        calories_est: item.calories_est === undefined ? '' : item.calories_est,
        protein_est: item.protein_est === undefined ? '' : item.protein_est
      }))
    }
    return parsed
  },

  describeParsed(parsed) {
    if (!parsed || !parsed.type) return '没有识别到明确分类，对吗？'
    if (parsed.type === 'diet') {
      const items = (parsed.diet_items || []).filter(item => item.name).map(item => `${item.name}${item.amount ? ` ${item.amount}` : ''}`)
      const calories = (parsed.diet_items || []).reduce((sum, item) => sum + (Number(item.calories_est) || 0), 0)
      const protein = (parsed.diet_items || []).reduce((sum, item) => sum + (Number(item.protein_est) || 0), 0)
      const totals = calories ? ` ~${Math.round(calories)}kcal` : ''
      const proteinText = protein ? `，蛋白质约 ${Math.round(protein)}g` : ''
      return `识别到：${items.join('、') || '一条饮食记录'}${totals}${proteinText}，对吗？`
    }
    if (parsed.type === 'mood') return `识别到：心情为${this.moodLabel(parsed.mood)}，对吗？`
    if (parsed.type === 'training') {
      const activity = parsed.training?.activity || '一项训练'
      const duration = parsed.training?.duration_min ? ` ${parsed.training.duration_min} 分钟` : ''
      return `识别到：${activity}${duration}，对吗？`
    }
    if (parsed.type === 'cycle') {
      const parts = []
      if (parsed.cycle?.is_period_start) parts.push('经期开始')
      if (parsed.cycle?.day) parts.push(`周期第 ${parsed.cycle.day} 天`)
      if (parsed.cycle?.pain_level !== undefined) parts.push(`疼痛 ${parsed.cycle.pain_level}/10`)
      if (parsed.cycle?.flow) parts.push(`${parsed.cycle.flow === 'light' ? '少量' : parsed.cycle.flow === 'medium' ? '中等' : '较多'}流量`)
      return `识别到：${parts.join('，') || '一条经期记录'}，对吗？`
    }
    if (parsed.type === 'sleep') {
      const duration = parsed.sleep?.duration_min ? `${parsed.sleep.duration_min} 分钟` : '睡眠时长'
      return `识别到：睡眠 ${duration}${parsed.sleep?.quality ? `，质量 ${parsed.sleep.quality}` : ''}，对吗？`
    }
    return '识别到一条其他身体记录，对吗？'
  },

  describeRules(rules) {
    if (!rules) return ''
    if (rules.flags?.includes('self_harm_language')) {
      return '如果你现在可能伤害自己，请立即联系当地紧急服务，并尽快让一位可信赖的人陪在你身边。'
    }
    if (rules.flags?.includes('urgent_physical_symptom_language')) {
      return '这条描述可能需要立即关注。如果你正在经历昏厥、呼吸困难、胸痛或无法控制的出血，请立即联系当地急救服务或就近就医。'
    }
    if (rules.flags?.includes('high_pain_reported')) {
      return '识别到较高疼痛程度。记录可以继续保存；如果疼痛持续、加重或伴随其他严重不适，请及时寻求专业帮助。'
    }
    if (rules.flags?.includes('very_short_sleep_reported')) {
      return '睡眠时长明显偏短，请确认识别结果是否准确。'
    }
    if (rules.flags?.includes('verify_long_training_duration')) {
      return '训练时长较长，请确认分钟数是否准确。'
    }
    if (rules.flags?.includes('diet_estimates_missing')) {
      return '这次没有可靠的营养估算，可以补充份量或手动填写后再保存。'
    }
    const labels = {
      diet_items: '具体食物',
      'diet_items.amount': '食物份量',
      mood: '心情状态',
      'training.activity': '训练项目',
      'training.duration_min': '训练时长',
      'cycle.details': '周期或症状信息',
      'sleep.details': '睡眠时长或质量'
    }
    const missing = (rules.follow_up_fields || []).map(field => labels[field] || field)
    return missing.length ? `还可以补充${missing.join('、')}，也可以先按当前结果保存。` : ''
  },

  localSafetyNotice(text) {
    if (/(不想活|想死|自杀|伤害自己|自残)/i.test(text)) {
      return '如果你现在可能伤害自己，请立即联系当地紧急服务，并尽快让一位可信赖的人陪在你身边。'
    }
    if (/(晕厥|昏厥|失去意识|呼吸困难|胸痛|流血不止|止不住血|一小时.{0,8}(卫生巾|卫生棉|棉条))/i.test(text)) {
      return '这条描述可能需要立即关注。如果你正在经历昏厥、呼吸困难、胸痛或无法控制的出血，请立即联系当地急救服务或就近就医。'
    }
    return ''
  },

  moodLabel(value) {
    const index = MOOD_VALUES.indexOf(value)
    return index >= 0 ? MOOD_LABELS[index] : '未明确'
  },

  onDietFieldInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    const rawValue = event.detail.value
    const value = field === 'name' || field === 'amount' ? rawValue : rawValue === '' ? '' : Number(rawValue)
    this.setData({ [`parsed.diet_items[${index}].${field}`]: value }, () => this.refreshParsedPreview())
  },

  addDietItem() {
    const items = (this.data.parsed?.diet_items || []).concat([{ name: '', amount: '', calories_est: '', protein_est: '' }])
    this.setData({ 'parsed.diet_items': items }, () => this.refreshParsedPreview())
  },

  removeDietItem(event) {
    const index = Number(event.currentTarget.dataset.index)
    const items = (this.data.parsed?.diet_items || []).filter((item, itemIndex) => itemIndex !== index)
    this.setData({ 'parsed.diet_items': items }, () => this.refreshParsedPreview())
  },

  onParsedInput(event) {
    const section = event.currentTarget.dataset.section
    const field = event.currentTarget.dataset.field
    const rawValue = event.detail.value
    const value = rawValue === '' ? '' : Number(rawValue)
    this.setData({ [`parsed.${section}.${field}`]: value }, () => this.refreshParsedPreview())
  },

  onParsedTextInput(event) {
    const section = event.currentTarget.dataset.section
    const field = event.currentTarget.dataset.field
    this.setData({ [`parsed.${section}.${field}`]: event.detail.value }, () => this.refreshParsedPreview())
  },

  onMoodChange(event) {
    const moodIndex = Number(event.detail.value)
    const parsed = { ...this.data.parsed }
    if (MOOD_VALUES[moodIndex]) parsed.mood = MOOD_VALUES[moodIndex]
    else delete parsed.mood
    this.setData({ moodIndex, parsed }, () => this.refreshParsedPreview())
  },

  onFlowChange(event) {
    const flowIndex = Number(event.detail.value)
    const parsed = { ...this.data.parsed, cycle: { ...this.data.parsed.cycle } }
    if (FLOW_VALUES[flowIndex]) parsed.cycle.flow = FLOW_VALUES[flowIndex]
    else delete parsed.cycle.flow
    this.setData({ flowIndex, parsed }, () => this.refreshParsedPreview())
  },

  onPeriodStartChange(event) {
    this.setData({ 'parsed.cycle.is_period_start': Boolean(event.detail.value) }, () => this.refreshParsedPreview())
  },

  refreshParsedPreview() {
    this.setData({
      parsePreviewText: this.describeParsed(this.data.parsed),
      parseEdited: true
    })
  },

  cleanParsedForSave() {
    if (!this.data.parsed || this.data.parsed.type === 'general') return null
    const parsed = JSON.parse(JSON.stringify(this.data.parsed))
    delete parsed.typeLabel
    if (parsed.diet_items) {
      parsed.diet_items = parsed.diet_items.filter(item => String(item.name || '').trim()).map(item => {
        const cleaned = { name: String(item.name).trim() }
        if (item.amount) cleaned.amount = String(item.amount).trim()
        if (item.calories_est !== '' && Number.isFinite(Number(item.calories_est))) cleaned.calories_est = Number(item.calories_est)
        if (item.protein_est !== '' && Number.isFinite(Number(item.protein_est))) cleaned.protein_est = Number(item.protein_est)
        return cleaned
      })
    }
    const numericFields = {
      training: ['duration_min'],
      cycle: ['day', 'pain_level'],
      sleep: ['duration_min']
    }
    Object.keys(numericFields).forEach(section => {
      if (!parsed[section]) return
      numericFields[section].forEach(field => {
        const value = parsed[section][field]
        if (value === '' || value === undefined || value === null) delete parsed[section][field]
        else parsed[section][field] = Number(value)
      })
    })
    if (parsed.training?.activity !== undefined) {
      parsed.training.activity = String(parsed.training.activity).trim()
      if (!parsed.training.activity) delete parsed.training.activity
    }
    return parsed
  },

  confirmParsed() {
    const parsed = this.cleanParsedForSave()
    if (!parsed) {
      wx.showToast({ title: '请先重新识别这条记录', icon: 'none' })
      return
    }
    const validationError = this.clientValidationError(parsed)
    if (validationError) {
      wx.showToast({ title: validationError, icon: 'none' })
      return
    }
    this.recordParserFeedback(parsed, this.data.parseEdited ? 'corrected' : 'accepted')
    this.persistLog(parsed)
  },

  clientValidationError(parsed) {
    for (const item of parsed.diet_items || []) {
      if (item.calories_est !== undefined && (!Number.isFinite(item.calories_est) || item.calories_est < 0 || item.calories_est > 5000)) return '单项热量需在 0 - 5000 kcal'
      if (item.protein_est !== undefined && (!Number.isFinite(item.protein_est) || item.protein_est < 0 || item.protein_est > 500)) return '单项蛋白质需在 0 - 500g'
    }
    if (parsed.training?.duration_min !== undefined && (!Number.isFinite(parsed.training.duration_min) || parsed.training.duration_min < 0 || parsed.training.duration_min > 1440)) return '训练时长需在 0 - 1440 分钟'
    if (parsed.cycle?.day !== undefined && (!Number.isFinite(parsed.cycle.day) || !Number.isInteger(parsed.cycle.day) || parsed.cycle.day < 1 || parsed.cycle.day > 60)) return '周期天数需为 1 - 60 的整数'
    if (parsed.cycle?.pain_level !== undefined && (!Number.isFinite(parsed.cycle.pain_level) || parsed.cycle.pain_level < 0 || parsed.cycle.pain_level > 10)) return '疼痛程度需在 0 - 10'
    if (parsed.sleep?.duration_min !== undefined && (!Number.isFinite(parsed.sleep.duration_min) || parsed.sleep.duration_min < 0 || parsed.sleep.duration_min > 1440)) return '睡眠时长需在 0 - 1440 分钟'
    return ''
  },

  saveWithoutParsing() {
    if (!this.data.message.trim()) return
    this.recordParserFeedback(null, 'saved_without_parsing')
    this.persistLog(null)
  },

  recordParserFeedback(finalParsed, outcome) {
    const feedback = wx.getStorageSync('herRhymeAgentFeedback') || []
    feedback.unshift({
      id: `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      source_log_id: this.data.pendingLogId || '',
      agent_id: 'record_parser',
      prompt_version: this.data.promptVersion || 'record_parser_unavailable',
      rule_version: this.data.ruleVersion || 'record_rules_unavailable',
      outcome,
      original_parsed: this.data.originalParsed || null,
      final_parsed: finalParsed || null,
      rules: this.data.parserRules || null,
      created_at: new Date().toISOString()
    })
    wx.setStorageSync('herRhymeAgentFeedback', feedback.slice(0, 200))
  },

  persistLog(parsed) {
    const content = this.data.message.trim()
    const log = {
      id: this.data.pendingLogId || `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: parsed?.type || 'general',
      content,
      summary: parsed ? this.describeParsed(parsed).replace('，对吗？', '') : content.slice(0, 12),
      parsed: parsed || null,
      source: parsed ? 'natural_language_llm' : 'natural_language_local',
      createdAt: new Date().toISOString()
    }
    const logs = wx.getStorageSync('herRhymeLogs') || []
    logs.unshift(log)
    wx.setStorageSync('herRhymeLogs', logs)
    this.setData({
      saved: true,
      message: '',
      parsing: false,
      parseError: '',
      parsed: null,
      originalParsed: null,
      parserRules: null,
      parseEdited: false,
      promptVersion: '',
      ruleVersion: '',
      pendingLogId: '',
      parsePreviewText: '',
      parseNoticeText: ''
    })
    this.loadLogs()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  retryParse() {
    this.setData({ parseError: '' })
    this.save()
  },

  parseErrorMessage(error) {
    if (error?.code === 'llm_not_configured') return '服务器还没有配置 LLM Key，可以先保存原文。'
    if (error?.code === 'llm_invalid_output') return '模型返回的字段不符合规则，请重新识别或先保存原文。'
    if (error?.code === 'llm_missing_tool_call') return '这句话包含的状态较多，模型没有完成分类，请重新识别。'
    if (error?.code === 'llm_timeout') return '解析服务响应超时，可以稍后重试或先保存原文。'
    if (error?.code === 'rate_limited') return '短时间内识别次数较多，请稍后再试或先保存原文。'
    return '暂时无法连接解析服务，可以重试或先保存原文。'
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
