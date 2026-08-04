const STORAGE_KEY = 'herRhymePlans'
const CATEGORY_OPTIONS = ['饮食', '训练', '睡眠', '周期恢复', '其他']
const CATEGORY_VALUES = ['diet', 'training', 'sleep', 'recovery', 'other']
const CADENCE_OPTIONS = ['每日', '工作日', '每周 3 次', '每周', '自定义']

const templates = [
  {
    id: 'fasting-16-8',
    category: 'diet',
    categoryLabel: '饮食节奏',
    cadence: '每日',
    name: '16:8 饮食窗口',
    schedule: '每日 10:00 - 18:00',
    detail: '固定 8 小时饮食窗口，窗口外以无热量饮品为主。'
  },
  {
    id: 'weekly-meals',
    category: 'diet',
    categoryLabel: '每周饮食',
    cadence: '每周',
    name: '一周均衡饮食',
    schedule: '每周日提前规划',
    detail: '按七天安排主食、蛋白质、蔬果和灵活餐。'
  },
  {
    id: 'daily-training',
    category: 'training',
    categoryLabel: '每日训练',
    cadence: '自定义',
    name: '每日 30 分钟训练',
    schedule: '每周训练 5 天',
    detail: '力量、低强度有氧和恢复训练交替安排。'
  },
  {
    id: 'cycle-recovery',
    category: 'recovery',
    categoryLabel: '周期恢复',
    cadence: '自定义',
    name: '周期感知恢复',
    schedule: '按身体状态执行',
    detail: '疲劳或经期不适时，切换为拉伸、散步或休息。'
  },
  {
    id: 'sleep-routine',
    category: 'sleep',
    categoryLabel: '睡眠恢复',
    cadence: '每日',
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
    templateId: source.templateId || source.id || '',
    category: source.category,
    categoryLabel: source.categoryLabel,
    cadence: source.cadence || '自定义',
    name: source.name,
    schedule: source.schedule,
    detail: source.detail,
    enabled: true,
    completionDates: [],
    createdAt: new Date().toISOString()
  }
}

function emptyEditorState() {
  return {
    showEditor: false,
    editorMode: 'create',
    editorKicker: 'CREATE',
    editorTitle: '创建个性计划',
    saveLabel: '保存个性计划',
    editingPlanId: '',
    editingTemplateId: '',
    categoryIndex: 0,
    cadenceIndex: 0,
    customForm: { name: '', schedule: '', detail: '' }
  }
}

Page({
  data: {
    templates,
    plans: [],
    completionValues: [],
    progressText: '还没有启用计划',
    ...emptyEditorState(),
    categoryOptions: CATEGORY_OPTIONS,
    categoryValues: CATEGORY_VALUES,
    cadenceOptions: CADENCE_OPTIONS
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

    this.setData({
      plans,
      completionValues,
      progressText: enabled.length ? `今天完成 ${completed} / ${enabled.length}` : '还没有启用计划',
      templates: templates.map(item => {
        const plan = plans.find(candidate => candidate.templateId === item.id)
        return { ...item, added: Boolean(plan), planId: plan?.id || '' }
      })
    })
  },

  savePlans(plans) {
    wx.setStorageSync(STORAGE_KEY, plans)
    this.loadPlans()
  },

  addTemplateById(id) {
    const template = templates.find(item => item.id === id)
    if (!template) return
    const plans = wx.getStorageSync(STORAGE_KEY) || []
    if (plans.some(item => item.templateId === template.id)) return
    plans.unshift(createPlan(template))
    this.savePlans(plans)
    wx.showToast({ title: '已加入我的计划', icon: 'success' })
  },

  toggleEditor() {
    if (this.data.showEditor) {
      this.setData(emptyEditorState())
      return
    }
    this.openEditor('create')
  },

  openEditor(mode, source = {}) {
    const categoryIndex = Math.max(0, CATEGORY_VALUES.indexOf(source.category || 'diet'))
    const cadenceIndex = Math.max(0, CADENCE_OPTIONS.indexOf(source.cadence || '自定义'))
    const labels = mode === 'edit'
      ? { editorKicker: 'EDIT', editorTitle: '修改计划', saveLabel: '保存修改' }
      : mode === 'template'
        ? { editorKicker: 'TEMPLATE', editorTitle: '按模板创建计划', saveLabel: '加入我的计划' }
        : { editorKicker: 'CREATE', editorTitle: '创建个性计划', saveLabel: '保存个性计划' }

    this.setData({
      showEditor: true,
      editorMode: mode,
      ...labels,
      editingPlanId: mode === 'edit' ? source.id : '',
      editingTemplateId: mode === 'template' ? source.id : (source.templateId || ''),
      categoryIndex,
      cadenceIndex,
      customForm: {
        name: source.name || '',
        schedule: source.schedule || '',
        detail: source.detail || ''
      }
    }, () => wx.pageScrollTo({ scrollTop: 0, duration: 220 }))
  },

  openPlanEditor(event) {
    const id = event.currentTarget.dataset.id
    const plan = (wx.getStorageSync(STORAGE_KEY) || []).find(item => item.id === id)
    if (plan) this.openEditor('edit', plan)
  },

  openTemplateEditor(event) {
    const id = event.currentTarget.dataset.id
    const plan = (wx.getStorageSync(STORAGE_KEY) || []).find(item => item.templateId === id)
    if (plan) {
      this.openEditor('edit', plan)
      return
    }
    const template = templates.find(item => item.id === id)
    if (template) this.openEditor('template', template)
  },

  handleTemplateAction(event) {
    const id = event.currentTarget.dataset.id
    const plan = (wx.getStorageSync(STORAGE_KEY) || []).find(item => item.templateId === id)
    if (plan) {
      this.openEditor('edit', plan)
      return
    }
    this.addTemplateById(id)
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
    const planValues = {
      category,
      categoryLabel: this.data.categoryOptions[this.data.categoryIndex],
      cadence: this.data.cadenceOptions[this.data.cadenceIndex],
      name: form.name.trim(),
      schedule: form.schedule.trim() || this.data.cadenceOptions[this.data.cadenceIndex],
      detail: form.detail.trim() || '按照当天状态完成，并记录身体反馈。'
    }
    let plans = wx.getStorageSync(STORAGE_KEY) || []
    let toastTitle = '个性计划已创建'

    if (this.data.editingPlanId) {
      plans = plans.map(item => item.id === this.data.editingPlanId
        ? { ...item, ...planValues, updatedAt: new Date().toISOString() }
        : item)
      toastTitle = '计划已更新'
    } else {
      const plan = createPlan({ ...planValues, id: this.data.editingTemplateId })
      plans.unshift(plan)
      if (this.data.editorMode === 'template') toastTitle = '模板计划已创建'
    }

    this.setData(emptyEditorState())
    this.savePlans(plans)
    wx.showToast({ title: toastTitle, icon: 'success' })
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
