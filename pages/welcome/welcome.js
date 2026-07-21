Page({
  onShow() {
    if (wx.getStorageSync('herRhymeProfile')) {
      wx.switchTab({ url: '/pages/today/today' })
    }
  },

  start() {
    wx.setStorageSync('herRhymeOnboarding', true)
    wx.switchTab({ url: '/pages/profile/profile' })
  }
})
