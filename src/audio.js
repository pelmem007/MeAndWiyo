// Процедурный звуковой движок на Web Audio API.
// Никаких внешних mp3 или ogg файлов не нужно, всё синтезируется прямо в браузере.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.soundVolume = 0.75;
    this.musicVolume = 0.55;
    this.stepAccum = 0;
    this.noteIndex = 0;
    this.isNight = false;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.soundVolume;
      this.sfxGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume * 0.28;
      this.musicGain.connect(this.ctx.destination);

      this.startAmbientLoop();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setVolumes(soundVolume, musicVolume) {
    this.soundVolume = soundVolume;
    this.musicVolume = musicVolume;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(soundVolume, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(musicVolume * 0.28, this.ctx.currentTime, 0.08);
    }
  }

  setNightMode(isNight) {
    this.isNight = isNight;
  }

  playTone(freq, duration = 0.2, type = 'sine', vol = 0.2, target = 'sfx', delay = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(target === 'music' ? this.musicGain : this.sfxGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playClick() {
    this.unlock();
    this.playTone(540, 0.07, 'triangle', 0.14);
  }

  playJump() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.14);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playStep(dt, speed, inWater = false) {
    if (speed < 0.8) {
      this.stepAccum = 0;
      return;
    }
    this.stepAccum += dt * speed;
    if (this.stepAccum >= 2.2) {
      this.stepAccum = 0;
      if (inWater) {
        this.playTone(220 + Math.random() * 70, 0.09, 'sine', 0.12);
      } else {
        this.playTone(130 + Math.random() * 40, 0.055, 'triangle', 0.07);
      }
    }
  }

  playLanternLit() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.65, 'sine', 0.18, 'sfx', idx * 0.09);
    });
  }

  playQuestComplete() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.45, 'triangle', 0.16, 'sfx', idx * 0.08);
    });
  }

  playCollect() {
    this.playTone(784, 0.16, 'sine', 0.15, 'sfx', 0);
    this.playTone(1174.66, 0.25, 'sine', 0.14, 'sfx', 0.07);
  }

  playEmote() {
    this.playTone(587.33, 0.12, 'sine', 0.13, 'sfx', 0);
    this.playTone(783.99, 0.16, 'sine', 0.12, 'sfx', 0.06);
  }

  playBridgeOpen() {
    [261.63, 329.63, 392, 523.25].forEach((f, idx) => {
      this.playTone(f, 0.7, 'triangle', 0.14, 'sfx', idx * 0.11);
    });
  }

  startAmbientLoop() {
    if (this.musicTimer) return;
    // Мягкая пентатоника: днём светлая (C major pentatonic), ночью более тёплая и тихая
    const dayScale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25];
    const nightScale = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    const pattern = [0, 2, 4, 3, 5, 4, 2, 1];

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.musicVolume <= 0.01) return;
      const scale = this.isNight ? nightScale : dayScale;
      const idx = pattern[this.noteIndex % pattern.length];
      const freq = scale[idx];
      this.playTone(freq, 1.8, 'sine', 0.28, 'music', 0);
      if (this.noteIndex % 4 === 0) {
        this.playTone(freq * 0.5, 2.6, 'triangle', 0.16, 'music', 0.1);
      }
      this.noteIndex += 1;
    }, 1550);
  }

  dispose() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
