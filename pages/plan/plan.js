const STORAGE_KEY = 'herRhymePlans'

const templates = [
  {
    id: 'fasting-16-8',
    category: 'diet',
    categoryLabel: '饮食节奏',
    name: '16:8 饮食窗口',
    schedule: '每日 10:00 - 18:00',
    detail: '固定 8 小时饮食窗口，窗口外以无热量饮品为主。'
  },
  {
    id: 'weekly-meals',
    category: 'diet',
    categoryLabel: '每周饮食',
    name: '一周均衡饮食',
    schedule: '每周日提前规划',
    detail: '按七天安排主食、蛋白质、蔬果和灵活餐。'
  },
  {
    id: 'daily-training',
    category: 'training',
    categoryLabel: '每日训练',
    name: '每日 30 分钟训练',
    schedule: '每周训练 5 天',
    detail: '力量、低强度有氧和恢复训练交替安排。'
  },
  {
    id: 'cycle-recovery',
    category: 'recovery',
    categoryLabel: '周期恢复',
    name: '周期感知恢复',
    schedule: '按身体状态执行',
    detail: '疲劳或经期不适时，切换为拉伸、散步或休息。'
  },
  {
    id: 'sleep-routine',
    category: 'sleep',
    categoryLabel: '睡眠恢复',
    name: '七日规律入睡',
    schedule: '每日 23:00 前准备入睡',
    detail: '固定睡前节奏，记录睡眠时长与第二天的恢复感受。'
  }
]

function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createPlan(source) {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    templateId: source.id || '',
    category: source.category,
    categoryLabel: source.categoryLabel,
    name: source.name,
    schedule: source.schedule,
    detail: source.detail,
    enabled: true,
    completionDates: [],
    createdAt: new Date().toISOString()
  }
}

Page({
  data: {
    templates,
    plans: [],
    completionValues: [],
    progressText: '还没有启用计划',
    showEditor: false,
    categoryOptions: ['饮食', '训练', '睡眠', '周期恢复', '其他'],
    categoryValues: ['diet', 'training', 'sleep', 'recovery', 'other'],
    categoryIndex: 0,
    cadenceOptions: ['每日', '工作日', '每周 3 次', '每周', '自定义'],
    cadenceIndex: 0,
    customForm: { name: '', schedule: '', detail: '' }
  },

  onShow() {
    this.loadPlans()
  },

  loadPlans() {
    const today = dateKey()
    const source = wx.getStorageSync(STORAGE_KEY) || []
    const plans = source.map(item => ({
      ...item,
      completionDates: item.completionDates || (item.completedOn ? [item.completedOn] : []),
      completedToday: (item.completionDates || []).includes(today) || item.completedOn === today
    }))
    const completionValues = plans.filter(item => item.completedToday).map(item => item.id)
    const enabled = plans.filter(item => item.enabled)
    const completed = enabled.filter(item => item.completedToday).length
    const templateIds = plans.map(item => item.templateId)

    this.setData({
      plans,
      completionValues,
      progressText: enabled.length ? `今天完成 ${completed} / ${enabled.length}` : '还没有启用计划',
      templates: templates.map(item => ({ ...item, added: templateIds.includes(item.id) }))
    })
  },

  savePlans(plans) {
    wx.setStorageSync(STORAGE_KEY, plans)
    this.loadPlans()
  },

  addTemplate(event) {
    const template = templates.find(item => item.id === event.currentTarget.dataset.id)
    if (!template) return
    const plans = wx.getStorageSync(STORAGE_KEY) || []
    if (plans.some(item => item.templateId === template.id)) return
    plans.unshift(createPlan(template))
    this.savePlans(plans)
    wx.showToast({ title: '已加入我的计划', icon: 'success' })
  },

  toggleEditor() {
    this.setData({ showEditor: !this.data.showEditor })
  },

  onCategoryChange(event) {
    this.setData({ categoryIndex: Number(event.detail.value) })
  },

  onCadenceChange(event) {
    this.setData({ cadenceIndex: Number(event.detail.value) })
  },

  onCustomInput(event) {
    this.setData({ [`customForm.${event.currentTarget.dataset.key}`]: event.detail.value })
  },

  saveCustomPlan() {
    const form = this.data.customForm
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写计划名称', icon: 'none' })
      return
    }
    const category = this.data.categoryValues[this.data.categoryIndex]
    const plan = createPlan({
      category,
      categoryLabel: this.data.categoryOptions[this.data.categoryIndex],
      name: form.name.trim(),
      schedule: form.schedule.trim() || this.data.cadenceOptions[this.data.cadenceIndex],
      detail: form.detail.trim() || '按照当天状态完成，并记录身体反馈。'
    })
    const plans = wx.getStorageSync(STORAGE_KEY) || []
    plans.unshift(plan)
    this.setData({ showEditor: false, categoryIndex: 0, cadenceIndex: 0, customForm: { name: '', schedule: '', detail: '' } })
    this.savePlans(plans)
    wx.showToast({ title: '个性计划已创建', icon: 'success' })
  },

  onCompletionChange(event) {
    const selected = event.detail.value || []
    const today = dateKey()
    const plans = (wx.getStorageSync(STORAGE_KEY) || []).map(item => {
      const dates = item.completionDates || (item.completedOn ? [item.completedOn] : [])
      const completionDates = selected.includes(item.id)
        ? Array.from(new Set(dates.concat(today)))
        : dates.filter(date => date !== today)
      return { ...item, completionDates, completedOn: '' }
    })
    this.savePlans(plans)
  },

  togglePlan(event) {
    const id = event.currentTarget.dataset.id
    const enabled = event.detail.value
    const plans = (wx.getStorageSync(STORAGE_KEY) || []).map(item => item.id === id ? { ...item, enabled } : item)
    this.savePlans(plans)
  },

  removePlan(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '移除这项计划？',
      content: '计划模板仍会保留，可以随时再次添加。',
      confirmText: '移除',
      confirmColor: '#9b4d46',
      success: result => {
        if (!result.confirm) return
        const plans = (wx.getStorageSync(STORAGE_KEY) || []).filter(item => item.id !== id)
        this.savePlans(plans)
      }
    })
  }
})
