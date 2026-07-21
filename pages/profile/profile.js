const { calculatePlan } = require('../../utils/calculator')
const { request } = require('../../utils/api')

Page({
  data: {
    onboarding: false,
    sexOptions: ['女性', '男性'],
    sexValues: ['female', 'male'],
    sexIndex: 0,
    activityOptions: ['light', 'moderate', 'high'],
    activityLabels: ['轻量运动', '每周规律训练', '高强度训练'],
    activityIndex: 0,
    form: { sex: 'female', age: '', height: '', weight: '', targetWeight: '', activity: 'light', cycleLength: '' },
    plan: {}
  },

  onLoad(options) {
    const profile = wx.getStorageSync('herRhymeProfile')
    const onboarding = Boolean(options.onboarding === '1' || wx.getStorageSync('herRhymeOnboarding'))
    wx.removeStorageSync('herRhymeOnboarding')
    if (profile) {
      const sexIndex = this.data.sexValues.indexOf(profile.sex)
      const activityIndex = this.data.activityOptions.indexOf(profile.activity)
      this.setData({ form: profile, sexIndex: sexIndex < 0 ? 0 : sexIndex, activityIndex: activityIndex < 0 ? 0 : activityIndex, plan: profile.plan || {}, onboarding })
    } else {
      this.setData({ onboarding })
    }
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
    wx.setStorageSync('herRhymeProfile', profile)
    this.setData({ plan })
    request('/api/profile', 'POST', profile).catch(() => {})
    wx.showToast({ title: '计划已生成', icon: 'success' })
    if (this.data.onboarding) {
      setTimeout(() => wx.switchTab({ url: '/pages/today/today' }), 500)
    }
  }
})
