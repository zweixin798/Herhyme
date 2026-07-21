App({
  globalData: {
    brand: 'Her Rhyme'
  },

  onLaunch() {
    const profile = wx.getStorageSync('herRhymeProfile')
    if (!profile) {
      wx.setStorageSync('herRhymeLogs', [])
      wx.setStorageSync('herRhymeWeightLogs', [])
    }
  }
})
