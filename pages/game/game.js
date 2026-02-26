const COLS = 10
const ROWS = 20
const BLOCK_SIZE = 30

// Audio clip definitions (offset, duration in seconds)
// Based on gameA's music.mp3 structure - adjust these values to match your audio file
const AUDIO_CLIPS = {
  start: { offset: 3.7202, duration: 3.6224 },    // 游戏开始
  clear: { offset: 0, duration: 0.7675 },          // 消除方块
  fall: { offset: 1.2558, duration: 0.3546 },      // 立即下落
  gameover: { offset: 8.1276, duration: 1.1437 },  // 游戏结束
  rotate: { offset: 2.2471, duration: 0.0807 },    // 旋转
  move: { offset: 2.9088, duration: 0.1437 }       // 移动
}

// Tetromino shapes
const SHAPES = [
  // I
  [[1, 1, 1, 1]],
  // O
  [[1, 1],
   [1, 1]],
  // T
  [[0, 1, 0],
   [1, 1, 1]],
  // S
  [[0, 1, 1],
   [1, 1, 0]],
  // Z
  [[1, 1, 0],
   [0, 1, 1]],
  // J
  [[1, 0, 0],
   [1, 1, 1]],
  // L
  [[0, 0, 1],
   [1, 1, 1]]
]

const COLORS = [
  '#00f0f0', // I - Cyan
  '#f0f000', // O - Yellow
  '#a000f0', // T - Purple
  '#00f000', // S - Green
  '#f00000', // Z - Red
  '#0000f0', // J - Blue
  '#f0a000'  // L - Orange
]

Page({
  data: {
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false,
    paused: false,
    grid: [],
    nextPiece: null,
    soundEnabled: true
  },

  canvas: null,
  ctx: null,
  grid: [],
  currentPiece: null,
  nextPiece: null,
  score: 0,
  level: 1,
  lines: 0,
  gameLoop: null,
  dropInterval: 1000,
  lastDropTime: 0,
  isRunning: false,

  // Audio contexts
  bgm: null,
  audioContext: null,
  audioBuffer: null,
  lastMoveSoundTime: 0,

  // Long press state
  isLongPressing: false,
  longPressTimer: null,

  onReady() {
    this.initGame()
  },

  onUnload() {
    this.stopGame()
    this.stopBGM()
    this.onDownTouchEnd() // Clean up long press timer
  },

  // Initialize audio
  initAudio() {
    // Background music
    this.bgm = wx.createInnerAudioContext()
    this.bgm.src = '/audio/bgm.mp3'
    this.bgm.loop = true
    this.bgm.volume = 0.5

    // Load sound effects from single file (like gameA)
    this.loadAudioClips()
  },

  // Load audio file and decode to buffer (similar to gameA's Web Audio API approach)
  loadAudioClips() {
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/music.mp3`
    
    // Copy from local audio folder to temp path if not exists
    try {
      fs.accessSync(filePath)
    } catch (e) {
      // Copy from project audio folder
      fs.copyFileSync('/audio/music.mp3', filePath)
    }

    // Use InnerAudioContext with clip playback
    this.audioContext = wx.createInnerAudioContext()
    this.audioContext.src = '/audio/music.mp3'
    this.audioContext.volume = 0.6
  },

  // Play a specific clip from the audio file
  playClip(clipName, playbackRate = 1) {
    if (!this.data.soundEnabled) return
    
    const clip = AUDIO_CLIPS[clipName]
    if (!clip) return

    const audio = wx.createInnerAudioContext()
    audio.src = '/audio/music.mp3'
    audio.volume = 0.6
    audio.playbackRate = playbackRate
    
    // Seek to clip start position
    audio.seek(clip.offset)
    audio.play()
    
    // Stop after clip duration
    setTimeout(() => {
      audio.stop()
      audio.destroy()
    }, clip.duration * 1000 / playbackRate)
  },

  playBGM() {
    if (this.data.soundEnabled && this.bgm) {
      this.bgm.play()
    }
  },

  stopBGM() {
    if (this.bgm) {
      this.bgm.stop()
    }
  },

  pauseBGM() {
    if (this.bgm) {
      this.bgm.pause()
    }
  },

  resumeBGM() {
    if (this.data.soundEnabled && this.bgm) {
      this.bgm.play()
    }
  },

  playMoveSound() {
    if (!this.data.soundEnabled) return
    
    // Limit sound frequency to avoid overlap
    const now = Date.now()
    if (now - this.lastMoveSoundTime < 50) return
    this.lastMoveSoundTime = now
    
    // Play 'move' clip from the audio file
    this.playClip('move')
  },

  playRotateSound() {
    if (!this.data.soundEnabled) return
    this.playClip('rotate')
  },

  playDropSound(speedFactor = 1) {
    if (!this.data.soundEnabled) return
    
    // Higher speed = higher pitch (using playbackRate)
    // speedFactor: 1 = normal, 2 = fast
    const playbackRate = Math.min(2, 0.8 + speedFactor * 0.4)
    
    // Play 'fall' clip with speed-adjusted pitch
    this.playClip('fall', playbackRate)
  },

  playClearSound() {
    if (!this.data.soundEnabled) return
    this.playClip('clear')
  },

  playGameOverSound() {
    if (!this.data.soundEnabled) return
    this.playClip('gameover')
  },

  playStartSound() {
    if (!this.data.soundEnabled) return
    this.playClip('start')
  },

  toggleSound() {
    const newState = !this.data.soundEnabled
    this.setData({ soundEnabled: newState })
    
    if (newState) {
      if (!this.data.paused && !this.data.gameOver) {
        this.playBGM()
      }
    } else {
      this.stopBGM()
    }
  },

  initGame() {
    // Initialize grid
    this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(0))
    
    // Get canvas context
    const query = wx.createSelectorQuery()
    query.select('#gameCanvas').fields({ node: true, size: true }).exec((res) => {
      this.canvas = res[0].node
      this.ctx = this.canvas.getContext('2d')
      
      const dpr = wx.getSystemInfoSync().pixelRatio
      this.canvas.width = COLS * BLOCK_SIZE * dpr
      this.canvas.height = ROWS * BLOCK_SIZE * dpr
      this.ctx.scale(dpr, dpr)
      
      this.initAudio()
      this.startGame()
      this.playBGM()
    })
  },

  startGame() {
    this.score = 0
    this.level = 1
    this.lines = 0
    this.dropInterval = 1000
    this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(0))
    
    this.spawnPiece()
    this.updateUI()
    
    // Play start sound
    this.playStartSound()
    
    this.lastDropTime = Date.now()
    this.isRunning = true
    this.gameLoop = setInterval(this.gameUpdate.bind(this), 16)
  },

  stopGame() {
    if (this.gameLoop) {
      clearInterval(this.gameLoop)
      this.gameLoop = null
    }
    this.isRunning = false
    this.stopBGM()
  },

  gameUpdate() {
    if (this.data.gameOver || this.data.paused || !this.isRunning) {
      return
    }

    const now = Date.now()
    if (now - this.lastDropTime > this.dropInterval) {
      this.moveDown()
      this.lastDropTime = now
    }

    this.draw()
  },

  spawnPiece() {
    if (this.nextPiece) {
      this.currentPiece = this.nextPiece
    } else {
      this.currentPiece = this.createPiece()
    }
    this.nextPiece = this.createPiece()
    
    this.setData({ nextPiece: this.nextPiece })

    // Check game over
    if (!this.isValidPosition(this.currentPiece, this.currentPiece.x, this.currentPiece.y)) {
      this.gameOver()
    }
  },

  createPiece() {
    const type = Math.floor(Math.random() * SHAPES.length)
    return {
      shape: SHAPES[type],
      color: COLORS[type],
      x: Math.floor(COLS / 2) - Math.floor(SHAPES[type][0].length / 2),
      y: 0,
      type: type
    }
  },

  moveDown() {
    if (this.isValidPosition(this.currentPiece, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y++
    } else {
      this.lockPiece()
      this.clearLines()
      this.spawnPiece()
    }
  },

  moveLeft() {
    if (this.isValidPosition(this.currentPiece, this.currentPiece.x - 1, this.currentPiece.y)) {
      this.currentPiece.x--
      this.playMoveSound()
    }
  },

  moveRight() {
    if (this.isValidPosition(this.currentPiece, this.currentPiece.x + 1, this.currentPiece.y)) {
      this.currentPiece.x++
      this.playMoveSound()
    }
  },

  rotate() {
    const rotated = this.rotateShape(this.currentPiece.shape)
    const oldShape = this.currentPiece.shape
    this.currentPiece.shape = rotated
    
    let rotatedSuccess = false
    if (!this.isValidPosition(this.currentPiece, this.currentPiece.x, this.currentPiece.y)) {
      // Try wall kicks
      let kicked = false
      for (let offset of [-1, 1, -2, 2]) {
        if (this.isValidPosition(this.currentPiece, this.currentPiece.x + offset, this.currentPiece.y)) {
          this.currentPiece.x += offset
          kicked = true
          rotatedSuccess = true
          break
        }
      }
      if (!kicked) {
        this.currentPiece.shape = oldShape
      }
    } else {
      rotatedSuccess = true
    }
    
    if (rotatedSuccess) {
      this.playRotateSound()
    }
  },

  rotateShape(shape) {
    const rows = shape.length
    const cols = shape[0].length
    const rotated = Array(cols).fill(null).map(() => Array(rows).fill(0))
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        rotated[x][rows - 1 - y] = shape[y][x]
      }
    }
    return rotated
  },

  hardDrop() {
    let dropDistance = 0
    while (this.isValidPosition(this.currentPiece, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y++
      this.score += 2
      dropDistance++
    }
    // Fast drop - higher pitch
    this.playDropSound(2)
    this.moveDown()
  },

  isValidPosition(piece, x, y) {
    for (let py = 0; py < piece.shape.length; py++) {
      for (let px = 0; px < piece.shape[py].length; px++) {
        if (piece.shape[py][px]) {
          const newX = x + px
          const newY = y + py
          
          if (newX < 0 || newX >= COLS || newY >= ROWS) {
            return false
          }
          if (newY >= 0 && this.grid[newY][newX]) {
            return false
          }
        }
      }
    }
    return true
  },

  lockPiece() {
    for (let y = 0; y < this.currentPiece.shape.length; y++) {
      for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
        if (this.currentPiece.shape[y][x]) {
          const gridY = this.currentPiece.y + y
          const gridX = this.currentPiece.x + x
          if (gridY >= 0) {
            this.grid[gridY][gridX] = this.currentPiece.color
          }
        }
      }
    }
  },

  clearLines() {
    let linesCleared = 0
    
    for (let y = ROWS - 1; y >= 0; y--) {
      if (this.grid[y].every(cell => cell !== 0)) {
        this.grid.splice(y, 1)
        this.grid.unshift(Array(COLS).fill(0))
        linesCleared++
        y++
      }
    }
    
    if (linesCleared > 0) {
      this.lines += linesCleared
      this.score += [0, 100, 300, 500, 800][linesCleared] * this.level
      
      // Level up every 10 lines
      this.level = Math.floor(this.lines / 10) + 1
      this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 100)
      
      // Play clear sound
      this.playClearSound()
      
      this.updateUI()
    }
  },

  draw() {
    if (!this.ctx) return

    // Clear canvas
    this.ctx.fillStyle = '#0a0a0a'
    this.ctx.fillRect(0, 0, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE)

    // Draw grid lines
    this.ctx.strokeStyle = '#1a1a1a'
    this.ctx.lineWidth = 1
    for (let x = 0; x <= COLS; x++) {
      this.ctx.beginPath()
      this.ctx.moveTo(x * BLOCK_SIZE, 0)
      this.ctx.lineTo(x * BLOCK_SIZE, ROWS * BLOCK_SIZE)
      this.ctx.stroke()
    }
    for (let y = 0; y <= ROWS; y++) {
      this.ctx.beginPath()
      this.ctx.moveTo(0, y * BLOCK_SIZE)
      this.ctx.lineTo(COLS * BLOCK_SIZE, y * BLOCK_SIZE)
      this.ctx.stroke()
    }

    // Draw locked pieces
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y][x]) {
          this.drawBlock(x, y, this.grid[y][x])
        }
      }
    }

    // Draw current piece
    if (this.currentPiece) {
      for (let y = 0; y < this.currentPiece.shape.length; y++) {
        for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
          if (this.currentPiece.shape[y][x]) {
            this.drawBlock(
              this.currentPiece.x + x,
              this.currentPiece.y + y,
              this.currentPiece.color
            )
          }
        }
      }
      
      // Draw ghost piece
      this.drawGhost()
    }
  },

  drawBlock(x, y, color) {
    const px = x * BLOCK_SIZE
    const py = y * BLOCK_SIZE
    
    // Main block
    this.ctx.fillStyle = color
    this.ctx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2)
    
    // Highlight
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    this.ctx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, 4)
    this.ctx.fillRect(px + 1, py + 1, 4, BLOCK_SIZE - 2)
    
    // Shadow
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    this.ctx.fillRect(px + 1, py + BLOCK_SIZE - 5, BLOCK_SIZE - 2, 4)
    this.ctx.fillRect(px + BLOCK_SIZE - 5, py + 1, 4, BLOCK_SIZE - 2)
  },

  drawGhost() {
    let ghostY = this.currentPiece.y
    while (this.isValidPosition(this.currentPiece, this.currentPiece.x, ghostY + 1)) {
      ghostY++
    }
    
    if (ghostY !== this.currentPiece.y) {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      this.ctx.lineWidth = 2
      this.ctx.setLineDash([4, 4])
      
      for (let y = 0; y < this.currentPiece.shape.length; y++) {
        for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
          if (this.currentPiece.shape[y][x]) {
            const px = (this.currentPiece.x + x) * BLOCK_SIZE
            const py = (ghostY + y) * BLOCK_SIZE
            this.ctx.strokeRect(px + 2, py + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4)
          }
        }
      }
      
      this.ctx.setLineDash([])
    }
  },

  updateUI() {
    this.setData({
      score: this.score,
      level: this.level,
      lines: this.lines
    })
  },

  gameOver() {
    this.stopGame()
    this.setData({ gameOver: true })
    
    // Play game over sound
    this.playGameOverSound()
    
    // Save high score
    const highScore = wx.getStorageSync('tetris_high_score') || 0
    if (this.score > highScore) {
      wx.setStorageSync('tetris_high_score', this.score)
    }
  },

  // Touch controls
  onTouchStart(e) {
    this.touchStartX = e.touches[0].clientX
    this.touchStartY = e.touches[0].clientY
    this.touchStartTime = Date.now()
  },

  onTouchEnd(e) {
    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const touchDuration = Date.now() - this.touchStartTime
    
    const dx = touchEndX - this.touchStartX
    const dy = touchEndY - this.touchStartY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    
    // Tap for rotate
    if (absDx < 10 && absDy < 10 && touchDuration < 200) {
      this.rotate()
      return
    }
    
    // Swipe
    if (absDx > absDy) {
      if (dx > 30) {
        this.moveRight()
      } else if (dx < -30) {
        this.moveLeft()
      }
    } else {
      if (dy > 30) {
        this.hardDrop()
      } else if (dy < -30) {
        this.rotate()
      }
    }
  },

  // Button controls
  onLeft() {
    this.moveLeft()
  },

  onRight() {
    this.moveRight()
  },

  onRotate() {
    this.rotate()
  },

  onDown() {
    this.moveDown()
    this.playMoveSound()
    this.score += 1
    this.updateUI()
  },

  // Long press down for continuous soft drop
  onDownLongPress() {
    this.isLongPressing = true
    this.continuousDrop()
  },

  onDownTouchEnd() {
    this.isLongPressing = false
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
  },

  continuousDrop() {
    if (!this.isLongPressing || this.data.paused || this.data.gameOver) {
      return
    }

    this.moveDown()
    this.playMoveSound()
    this.score += 1
    this.updateUI()

    // Fixed interval for smooth continuous drop (20ms)
    // Not affected by level, provides consistent experience
    this.longPressTimer = setTimeout(() => {
      this.continuousDrop()
    }, 20)
  },

  onDrop() {
    this.hardDrop()
    this.updateUI()
  },

  onPause() {
    const newPaused = !this.data.paused
    this.setData({ paused: newPaused })
    
    if (newPaused) {
      this.pauseBGM()
    } else {
      this.resumeBGM()
    }
  },

  onRestart() {
    this.setData({ gameOver: false, paused: false })
    this.startGame()
  },

  onBack() {
    wx.navigateBack()
  }
})
