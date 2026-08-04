const { calculatePlan } = require('../../utils/calculator')
const { buildResearchPackage } = require('../../utils/body-memory')

const PROFILE_KEY = 'herRhymeProfile'
const MEMORY_KEY = 'herRhymeAgentMemories'
const MEMORY_INITIALIZED_KEY = 'herRhymeMemoryInitialized'
const RESEARCH_CONSENT_KEY = 'herRhymeResearchConsent'
const RAW_TEXT_CONSENT_KEY = 'herRhymeResearchRawTextConsent'
const PARTICIPANT_ID_KEY = 'herRhymeResearchParticipantId'

const EMPTY_FORM = {
  sex: 'female',
  age: '',
  height: '',
  weight: '',
  targetWeight: '',
  activity: 'light',
  cycleLength: ''
}

Page({
  data: {
    onboarding: false,
    hasProfile: false,
    editing: false,
    sexOptions: ['女性', '男性'],
    sexValues: ['female', 'male'],
    sexIndex: 0,
    activityOptions: ['light', 'moderate', 'high'],
    activityLabels: ['轻量运动', '每周规律训练', '高强度训练'],
    activityIndex: 0,
    form: { ...EMPTY_FORM },
    plan: {},
    profileSummary: {},
    memories: [],
    enabledMemoryCount: 0,
    showMemoryEditor: false,
    memoryForm: { title: '', content: '' },
    researchConsent: false,
    includeRawText: false,
    researchParticipantId: '',
    researchSummary: { records: 0, corrections: 0 }
  },

  onLoad(options) {
    const onboarding = Boolean(options.onboarding === '1' || wx.getStorageSync('herRhymeOnboarding'))
    wx.removeStorageSync('herRhymeOnboarding')
    this.setData({ onboarding, editing: onboarding })
    this.loadData()
  },

  onShow() {
    this.loadMemories()
    this.loadResearchSettings()
  },

  loadData() {
    const profile = wx.getStorageSync(PROFILE_KEY)
    if (!profile) {
      this.setData({ hasProfile: false, editing: true, form: { ...EMPTY_FORM }, plan: {} })
      this.loadMemories()
      return
    }

    const sexIndex = this.data.sexValues.indexOf(profile.sex)
    const activityIndex = this.data.activityOptions.indexOf(profile.activity)
    this.setData({
      hasProfile: true,
      form: { ...EMPTY_FORM, ...profile },
      sexIndex: sexIndex < 0 ? 0 : sexIndex,
      activityIndex: activityIndex < 0 ? 0 : activityIndex,
      plan: profile.plan || {},
      profileSummary: {
        age: profile.age || '--',
        height: profile.height || '--',
        weight: profile.weight || '--',
        targetWeight: profile.targetWeight || '--',
        cycleLength: profile.cycleLength || '--',
        activity: this.data.activityLabels[activityIndex < 0 ? 0 : activityIndex]
      }
    })
    this.initializeProfileMemory(profile)
    this.loadMemories()
  },

  initializeProfileMemory(profile) {
    const memories = wx.getStorageSync(MEMORY_KEY) || []
    const initialized = wx.getStorageSync(MEMORY_INITIALIZED_KEY)
    const existingIndex = memories.findIndex(item => item.id === 'profile-baseline')
    const content = this.profileMemoryContent(profile)

    if (existingIndex >= 0) {
      if (memories[existingIndex].content !== content) {
        memories[existingIndex] = { ...memories[existingIndex], content, updatedAt: new Date().toISOString() }
        wx.setStorageSync(MEMORY_KEY, memories)
      }
      return
    }
    if (initialized) return

    memories.unshift({
      id: 'profile-baseline',
      title: '身体档案基线',
      content,
      enabled: true,
      source: '个人档案',
      createdAt: new Date().toISOString()
    })
    wx.setStorageSync(MEMORY_KEY, memories)
    wx.setStorageSync(MEMORY_INITIALIZED_KEY, true)
  },

  profileMemoryContent(profile) {
    const parts = []
    if (profile.weight) parts.push(`当前体重 ${profile.weight} kg`)
    if (profile.targetWeight) parts.push(`目标体重 ${profile.targetWeight} kg`)
    if (profile.cycleLength) parts.push(`平均周期 ${profile.cycleLength} 天`)
    const activityIndex = this.data.activityOptions.indexOf(profile.activity)
    if (activityIndex >= 0) parts.push(this.data.activityLabels[activityIndex])
    return parts.length ? parts.join('；') : '已建立个人身体档案。'
  },

  loadMemories() {
    const memories = (wx.getStorageSync(MEMORY_KEY) || []).map(item => ({
      ...item,
      source: item.source || '手动添加',
      dateLabel: this.formatDate(item.updatedAt || item.createdAt)
    }))
    this.setData({
      memories,
      enabledMemoryCount: memories.filter(item => item.enabled).length
    })
  },

  loadResearchSettings() {
    const logs = wx.getStorageSync('herRhymeLogs') || []
    const feedback = wx.getStorageSync('herRhymeAgentFeedback') || []
    this.setData({
      researchConsent: Boolean(wx.getStorageSync(RESEARCH_CONSENT_KEY)),
      includeRawText: Boolean(wx.getStorageSync(RAW_TEXT_CONSENT_KEY)),
      researchParticipantId: wx.getStorageSync(PARTICIPANT_ID_KEY) || '',
      researchSummary: {
        records: logs.length,
        corrections: feedback.filter(item => item.outcome === 'corrected').length
      }
    })
  },

  onResearchConsentChange(event) {
    const enabled = Boolean(event.detail.value)
    wx.setStorageSync(RESEARCH_CONSENT_KEY, enabled)
    if (!enabled) {
      wx.setStorageSync(RAW_TEXT_CONSENT_KEY, false)
      this.setData({ researchConsent: false, includeRawText: false })
      return
    }
    this.setData({ researchConsent: true })
  },

  onRawTextConsentChange(event) {
    if (!this.data.researchConsent) {
      this.setData({ includeRawText: false })
      wx.showToast({ title: '请先允许导出研究数据', icon: 'none' })
      return
    }
    const enabled = Boolean(event.detail.value)
    wx.setStorageSync(RAW_TEXT_CONSENT_KEY, enabled)
    this.setData({ includeRawText: enabled })
  },

  getResearchParticipantId() {
    let id = wx.getStorageSync(PARTICIPANT_ID_KEY)
    if (!id) {
      id = `hr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      wx.setStorageSync(PARTICIPANT_ID_KEY, id)
      this.setData({ researchParticipantId: id })
    }
    return id
  },

  exportResearchData() {
    if (!this.data.researchConsent) {
      wx.showToast({ title: '请先开启研究数据导出授权', icon: 'none' })
      return
    }
    const participantId = this.getResearchParticipantId()
    const researchPackage = buildResearchPackage({
      participantId,
      profile: wx.getStorageSync(PROFILE_KEY) || {},
      plans: wx.getStorageSync('herRhymePlans') || [],
      logs: wx.getStorageSync('herRhymeLogs') || [],
      agentFeedback: wx.getStorageSync('herRhymeAgentFeedback') || []
    }, { includeRawText: this.data.includeRawText })
    const json = JSON.stringify(researchPackage, null, 2)
    const filePath = `${wx.env.USER_DATA_PATH}/her-rhyme-${participantId}.json`
    wx.getFileSystemManager().writeFile({
      filePath,
      data: json,
      encoding: 'utf8',
      success: () => this.shareResearchFile(filePath, json),
      fail: () => wx.showToast({ title: '生成数据包失败，请稍后重试', icon: 'none' })
    })
  },

  shareResearchFile(filePath, json) {
    if (typeof wx.shareFileMessage !== 'function') {
      this.copyResearchJson(json)
      return
    }
    wx.shareFileMessage({
      filePath,
      fileName: 'Her-Rhyme-研究数据.json',
      success: () => wx.showToast({ title: '数据包已生成', icon: 'success' }),
      fail: () => this.copyResearchJson(json)
    })
  },

  copyResearchJson(json) {
    wx.setClipboardData({
      data: json,
      success: () => wx.showModal({
        title: '数据已复制',
        content: '当前环境无法直接分享文件，研究数据 JSON 已复制到剪贴板。',
        showCancel: false
      }),
      fail: () => wx.showToast({ title: '导出失败，请在手机上重试', icon: 'none' })
    })
  },

  startEditing() {
    this.setData({ editing: true })
  },

  cancelEditing() {
    if (!this.data.hasProfile) return
    this.setData({ editing: false })
    this.loadData()
  },

  onInput(event) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value })
  },

  onSexChange(event) {
    const sexIndex = Number(event.detail.value)
    this.setData({ sexIndex, 'form.sex': this.data.sexValues[sexIndex] })
  },

  onActivityChange(event) {
    const activityIndex = Number(event.detail.value)
    this.setData({ activityIndex, 'form.activity': this.data.activityOptions[activityIndex] })
  },

  save() {
    const form = this.data.form
    if (!form.age || !form.height || !form.weight) {
      wx.showToast({ title: '请先补充年龄、身高和体重', icon: 'none' })
      return
    }
    const plan = calculatePlan(form)
    const profile = { ...form, plan, updatedAt: new Date().toISOString() }
    wx.setStorageSync(PROFILE_KEY, profile)
    this.initializeProfileMemory(profile)
    this.setData({ plan, hasProfile: true, editing: false })
    this.loadData()
    wx.showToast({ title: '档案已保存', icon: 'success' })
    if (this.data.onboarding) {
      this.setData({ onboarding: false })
      setTimeout(() => wx.switchTab({ url: '/pages/today/today' }), 500)
    }
  },

  toggleMemoryEditor() {
    this.setData({ showMemoryEditor: !this.data.showMemoryEditor })
  },

  onMemoryInput(event) {
    this.setData({ [`memoryForm.${event.currentTarget.dataset.key}`]: event.detail.value })
  },

  addMemory() {
    const form = this.data.memoryForm
    if (!form.title.trim() || !form.content.trim()) {
      wx.showToast({ title: '请填写记忆名称和内容', icon: 'none' })
      return
    }
    const memories = wx.getStorageSync(MEMORY_KEY) || []
    memories.unshift({
      id: `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: form.title.trim(),
      content: form.content.trim(),
      enabled: true,
      source: '手动添加',
      createdAt: new Date().toISOString()
    })
    wx.setStorageSync(MEMORY_KEY, memories)
    wx.setStorageSync(MEMORY_INITIALIZED_KEY, true)
    this.setData({ showMemoryEditor: false, memoryForm: { title: '', content: '' } })
    this.loadMemories()
    wx.showToast({ title: '记忆已添加', icon: 'success' })
  },

  toggleMemory(event) {
    const id = event.currentTarget.dataset.id
    const enabled = event.detail.value
    const memories = (wx.getStorageSync(MEMORY_KEY) || []).map(item => item.id === id ? { ...item, enabled } : item)
    wx.setStorageSync(MEMORY_KEY, memories)
    this.loadMemories()
  },

  deleteMemory(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记忆？',
      content: '未来的 AI 对话将不再参考它。',
      confirmText: '删除',
      confirmColor: '#9b4d46',
      success: result => {
        if (!result.confirm) return
        const memories = (wx.getStorageSync(MEMORY_KEY) || []).filter(item => item.id !== id)
        wx.setStorageSync(MEMORY_KEY, memories)
        wx.setStorageSync(MEMORY_INITIALIZED_KEY, true)
        this.loadMemories()
      }
    })
  },

  clearMemories() {
    if (!this.data.memories.length) return
    wx.showModal({
      title: '清空全部 Agent 记忆？',
      content: '身体档案和日常记录会保留，但未来 AI 不再拥有这些长期偏好。',
      confirmText: '清空',
      confirmColor: '#9b4d46',
      success: result => {
        if (!result.confirm) return
        wx.setStorageSync(MEMORY_KEY, [])
        wx.setStorageSync(MEMORY_INITIALIZED_KEY, true)
        this.loadMemories()
      }
    })
  },

  deleteProfile() {
    wx.showModal({
      title: '删除个人档案？',
      content: '热量、营养和身体基线会被删除，日常记录与计划仍会保留。',
      confirmText: '删除',
      confirmColor: '#9b4d46',
      success: result => {
        if (!result.confirm) return
        wx.removeStorageSync(PROFILE_KEY)
        wx.removeStorageSync(MEMORY_INITIALIZED_KEY)
        const memories = (wx.getStorageSync(MEMORY_KEY) || []).filter(item => item.id !== 'profile-baseline')
        wx.setStorageSync(MEMORY_KEY, memories)
        wx.reLaunch({ url: '/pages/welcome/welcome' })
      }
    })
  },

  clearAllData() {
    wx.showModal({
      title: '清除全部本地数据？',
      content: '档案、计划、记录、体重和 Agent 记忆都会从当前设备删除，且无法恢复。',
      confirmText: '全部清除',
      confirmColor: '#9b4d46',
      success: result => {
        if (!result.confirm) return
        const keys = ['herRhymeProfile', 'herRhymePlans', 'herRhymeLogs', 'herRhymeWeightLogs', 'herRhymePendingRecordType', 'herRhymeOnboarding', 'herRhymeUserId', 'herRhymeAgentFeedback', MEMORY_KEY, MEMORY_INITIALIZED_KEY, RESEARCH_CONSENT_KEY, RAW_TEXT_CONSENT_KEY, PARTICIPANT_ID_KEY]
        keys.forEach(key => wx.removeStorageSync(key))
        wx.setStorageSync('herRhymePlans', [])
        wx.setStorageSync('herRhymeLogs', [])
        wx.setStorageSync('herRhymeWeightLogs', [])
        wx.setStorageSync(MEMORY_KEY, [])
        wx.removeStorageSync(MEMORY_INITIALIZED_KEY)
        wx.reLaunch({ url: '/pages/welcome/welcome' })
      }
    })
  },

  formatDate(iso) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
})
