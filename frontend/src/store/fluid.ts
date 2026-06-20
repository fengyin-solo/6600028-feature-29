import { defineStore } from 'pinia'
import { SPHEngine, DEFAULT_PARAMS, PRESETS } from '../utils/sph-engine'
import type { SimParams, Preset, Particle } from '../types'

export const useFluidStore = defineStore('fluid', {
  state: () => ({
    engine: null as SPHEngine | null,
    isRunning: false,
    particleCount: 800,
    currentPreset: PRESETS[0],
    params: { ...DEFAULT_PARAMS } as SimParams,
    fps: 0,
    frameCount: 0,
    _animId: null as number | null,
    _lastTime: 0,
    _fpsAccum: 0,
    _fpsFrames: 0,
    isStepping: false,
    stepFlashActive: false,
    stepStats: {
      avgDisplacement: 0,
      maxDisplacement: 0,
      avgVelocityChange: 0,
      densityChange: 0,
      stepNumber: 0,
    } as {
      avgDisplacement: number
      maxDisplacement: number
      avgVelocityChange: number
      densityChange: number
      stepNumber: number
    },
    _prevParticleSnapshot: [] as Array<{ x: number; y: number; vx: number; vy: number; density: number }>,
  }),
  getters: {
    particleArray: (state) => state.engine?.particles ?? [],
    avgDensity: (state) => {
      if (!state.engine || state.engine.particles.length === 0) return 0
      const sum = state.engine.particles.reduce((s, p) => s + p.density, 0)
      return sum / state.engine.particles.length
    },
    maxVelocity: (state) => {
      if (!state.engine || state.engine.particles.length === 0) return 0
      return Math.max(...state.engine.particles.map(p => Math.sqrt(p.vx * p.vx + p.vy * p.vy)))
    },
  },
  actions: {
    initSimulation(preset?: Preset) {
      if (preset) {
        this.currentPreset = preset
        this.params = { ...DEFAULT_PARAMS, ...preset.params }
        this.particleCount = preset.particleCount
      }
      const canvas = { width: 800, height: 500 }
      this.engine = new SPHEngine(this.particleCount, canvas.width, canvas.height, this.params)
      this.engine.initParticles(this.currentPreset.initialConfig, this.particleCount)
      this.frameCount = 0
      this.fps = 0
      this.stepStats = {
        avgDisplacement: 0,
        maxDisplacement: 0,
        avgVelocityChange: 0,
        densityChange: 0,
        stepNumber: 0,
      }
      this._prevParticleSnapshot = []
      this.stepFlashActive = false
      this.isStepping = false
    },
    start() {
      if (this.isRunning || !this.engine) return
      this.isRunning = true
      this._lastTime = performance.now()
      this._fpsAccum = 0
      this._fpsFrames = 0
      const loop = (now: number) => {
        if (!this.isRunning || !this.engine) return
        const elapsed = now - this._lastTime
        this._lastTime = now
        this._fpsAccum += elapsed
        this._fpsFrames++
        if (this._fpsAccum >= 500) {
          this.fps = Math.round(this._fpsFrames / (this._fpsAccum / 1000))
          this._fpsAccum = 0
          this._fpsFrames = 0
        }
        // Sub-steps for stability
        const subSteps = 3
        for (let s = 0; s < subSteps; s++) {
          this.engine.step()
        }
        this.frameCount++
        this._animId = requestAnimationFrame(loop)
      }
      this._animId = requestAnimationFrame(loop)
    },
    stop() {
      this.isRunning = false
      if (this._animId !== null) {
        cancelAnimationFrame(this._animId)
        this._animId = null
      }
    },
    reset() {
      this.stop()
      this.initSimulation(this.currentPreset)
    },
    stepOnce() {
      if (!this.engine || this.isRunning) return

      this.isStepping = true

      const particles = this.engine.particles
      this._prevParticleSnapshot = particles.map(p => ({
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        density: p.density,
      }))

      const prevAvgDensity = particles.reduce((s, p) => s + p.density, 0) / particles.length

      const subSteps = 3
      for (let s = 0; s < subSteps; s++) {
        this.engine.step()
      }
      this.frameCount++

      let totalDisp = 0
      let maxDisp = 0
      let totalVelChange = 0
      for (let i = 0; i < particles.length; i++) {
        const prev = this._prevParticleSnapshot[i]
        const curr = particles[i]
        const dx = curr.x - prev.x
        const dy = curr.y - prev.y
        const disp = Math.sqrt(dx * dx + dy * dy)
        totalDisp += disp
        if (disp > maxDisp) maxDisp = disp

        const prevSpeed = Math.sqrt(prev.vx * prev.vx + prev.vy * prev.vy)
        const currSpeed = Math.sqrt(curr.vx * curr.vx + curr.vy * curr.vy)
        totalVelChange += Math.abs(currSpeed - prevSpeed)
      }

      const newAvgDensity = particles.reduce((s, p) => s + p.density, 0) / particles.length

      this.stepStats = {
        avgDisplacement: totalDisp / particles.length,
        maxDisplacement: maxDisp,
        avgVelocityChange: totalVelChange / particles.length,
        densityChange: newAvgDensity - prevAvgDensity,
        stepNumber: this.frameCount,
      }

      this.stepFlashActive = true
      setTimeout(() => {
        this.stepFlashActive = false
      }, 300)

      setTimeout(() => {
        this.isStepping = false
      }, 100)
    },
    clearStepFlash() {
      this.stepFlashActive = false
    },
    updateParam(key: keyof SimParams, value: number) {
      this.params[key] = value
      if (this.engine) {
        this.engine.params[key] = value
        if (key === 'smoothingRadius') {
          this.engine['cellSize'] = value
        }
      }
    },
  },
})
