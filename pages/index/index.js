Page({
  data: {
    highScore: 0
  },

  onLoad() {
    const highScore = wx.getStorageSync('tetris_high_score') || 0
    this.setData({ highScore })
  },

  startGame() {
    wx.navigateTo({
      url: '/pages/game/game'
    })
  },

  onShareAppMessage() {
    return {
      title: '俄罗斯方块 - 经典怀旧小游戏',
      path: '/pages/index/index'
    }
  }
})
