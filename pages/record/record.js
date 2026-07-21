const { request } = require('../../utils/api')

Page({
  data: {
    types: [
      { label: '饮食', value: 'diet' },
      { label: '心情', value: 'mood' },
      { label: '训练', value: 'training' },
      { label: '经期', value: 'cycle' }
    ],
    activeType: 'diet',
    message: '',
    prompt: '可以写：吃了什么、今天状态如何、做了什么运动，或者周期到了哪一天。',
    saved: false
  },

  onLoad(options) {
    if (options.type) this.setData({ activeType: options.type })
  },

  selectType(event) {
    const type = event.currentTarget.dataset.type
    const prompts = {
      diet: '可以写：今天吃了什么、食欲如何，或者有没有特别想吃的东西。',
      mood: '可以写：今天的情绪、压力、动力和身体感受。',
      training: '可以写：练了什么、多久、感觉轻松还是疲劳。',
      cycle: '可以写：周期第几天、疼痛、流量或其他变化。'
    }
    this.setData({ activeType: type, prompt: prompts[type] })
  },

  onMessageInput(event) {
    this.setData({ message: event.detail.value })
  },

  save() {
    if (!this.data.message.trim()) {
      wx.showToast({ title: '先写下一点今天的状态', icon: 'none' })
      return
    }
    const logs = wx.getStorageSync('herRhymeLogs') || []
    const log = { type: this.data.activeType, content: this.data.message.trim(), summary: this.data.message.trim().slice(0, 12), createdAt: new Date().toISOString() }
    logs.unshift(log)
    wx.setStorageSync('herRhymeLogs', logs)
    request('/api/logs', 'POST', log).catch(() => {})
    this.setData({ saved: true, message: '' })
    wx.showToast({ title: '已保存', icon: 'success' })
  }
})
