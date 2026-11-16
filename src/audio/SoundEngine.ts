export class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private masterGain: GainNode | null = null;

  public unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.32;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // Игнорируем ограничения мобильного аудио до первого тапа
    }
  }

  public setMuted(muted: boolean): void {
    this.enabled = !muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.32, this.ctx.currentTime);
    }
  }

  public isMuted(): boolean {
    return !this.enabled;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.35
  ): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoiseBurst(duration: number, filterFreq: number, volume = 0.28): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const sampleCount = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sampleCount, 1.5);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
  }

  public playMeleeSwing(): void {
    this.playNoiseBurst(0.11, 900, 0.26);
    this.playTone(230, 85, 0.11, 'sawtooth', 0.18);
  }

  public playRangedShot(isSniper = false): void {
    if (isSniper) {
      this.playNoiseBurst(0.18, 1800, 0.42);
      this.playTone(720, 120, 0.22, 'sawtooth', 0.34);
    } else {
      this.playTone(540, 210, 0.1, 'triangle', 0.22);
    }
  }

  public playHitConfirm(isCrit = false): void {
    if (isCrit) {
      this.playTone(880, 1320, 0.09, 'sine', 0.32);
      this.playNoiseBurst(0.07, 2400, 0.24);
    } else {
      this.playTone(420, 260, 0.06, 'triangle', 0.2);
    }
  }

  public playParryClang(): void {
    this.playTone(1240, 1860, 0.18, 'sine', 0.44);
    this.playTone(620, 930, 0.22, 'triangle', 0.36);
    this.playNoiseBurst(0.12, 3400, 0.35);
  }

  public playSlideWhoosh(): void {
    this.playNoiseBurst(0.24, 680, 0.26);
    this.playTone(190, 95, 0.2, 'sine', 0.18);
  }

  public playDenySound(): void {
    this.playTone(660, 440, 0.11, 'square', 0.22);
  }

  public playWardPlace(): void {
    this.playTone(520, 880, 0.14, 'sine', 0.26);
  }

  public playBkbRoar(): void {
    this.playTone(140, 280, 0.42, 'sawtooth', 0.38);
    this.playNoiseBurst(0.32, 900, 0.3);
  }

  public playHookLaunch(): void {
    this.playNoiseBurst(0.22, 2600, 0.34);
    this.playTone(320, 640, 0.18, 'sawtooth', 0.24);
  }

  public playSpellCast(kind: 'ice' | 'fire' | 'shadow' | 'earth' | 'ult'): void {
    switch (kind) {
      case 'ice':
        this.playTone(950, 480, 0.22, 'sine', 0.3);
        this.playNoiseBurst(0.14, 3200, 0.2);
        break;
      case 'fire':
        this.playNoiseBurst(0.35, 520, 0.42);
        this.playTone(180, 62, 0.36, 'sawtooth', 0.32);
        break;
      case 'shadow':
        this.playNoiseBurst(0.16, 1900, 0.25);
        this.playTone(460, 190, 0.18, 'sine', 0.22);
        break;
      case 'earth':
        this.playNoiseBurst(0.32, 340, 0.44);
        this.playTone(135, 48, 0.34, 'triangle', 0.38);
        break;
      case 'ult':
        this.playTone(220, 660, 0.28, 'sawtooth', 0.36);
        this.playNoiseBurst(0.38, 1200, 0.36);
        break;
    }
  }

  public playGoldCoin(): void {
    this.playTone(988, 1318, 0.09, 'sine', 0.24);
    setTimeout(() => this.playTone(1318, 1760, 0.12, 'sine', 0.22), 55);
  }

  public playTowerWarning(): void {
    this.playTone(740, 740, 0.08, 'square', 0.2);
    setTimeout(() => this.playTone(880, 880, 0.1, 'square', 0.22), 100);
  }

  public playRockShatter(isMassive = false): void {
    this.playNoiseBurst(isMassive ? 0.52 : 0.28, isMassive ? 380 : 620, isMassive ? 0.48 : 0.34);
    this.playTone(isMassive ? 115 : 175, 36, isMassive ? 0.45 : 0.24, 'sawtooth', isMassive ? 0.42 : 0.28);
  }

  public playTreeTimber(): void {
    this.playNoiseBurst(0.32, 820, 0.3);
    this.playTone(210, 68, 0.28, 'triangle', 0.25);
  }

  public playRagdollImpact(): void {
    this.playNoiseBurst(0.14, 460, 0.22);
    this.playTone(130, 52, 0.12, 'sine', 0.2);
  }

  public playKillFanfare(streak: number): void {
    const notes =
      streak >= 4
        ? [392, 494, 587, 784]
        : streak >= 2
          ? [330, 440, 554]
          : [293, 440];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, freq * 1.02, 0.24, 'triangle', 0.32);
      }, idx * 95);
    });
  }
}
