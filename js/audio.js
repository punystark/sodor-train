// Web Audio API synthesizer for steam chuffs, brass whistle, switch clack, and brake hiss
class TrainAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
    this.chuffTimer = 0;
    this.noiseBuffer = null;
    this.whistleNodes = null;
  }

  ensureContext() {
    if (this.muted) return false;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(1.0);
      this.initialized = true;
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  createNoiseBuffer(seconds) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted && this.whistleNodes) {
      this.stopWhistle();
    }
  }

  // Triggered continuously in update loop based on speed & throttle
  update(dt, absSpeed, throttleMag) {
    if (this.muted || !this.ctx || absSpeed < 0.35) {
      this.chuffTimer = 0;
      return;
    }
    // Interval decreases as speed rises (4 chuffs per wheel revolution feel)
    const chuffInterval = Math.max(0.11, 0.72 / (0.6 + absSpeed * 0.28));
    this.chuffTimer += dt;
    if (this.chuffTimer >= chuffInterval) {
      this.chuffTimer %= chuffInterval;
      const intensity = Math.min(1, 0.25 + throttleMag * 0.65 + absSpeed * 0.03);
      this.playChuff(intensity);
    }
  }

  playChuff(intensity = 0.6) {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(340 + Math.random() * 90, now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = this.ctx.createGain();
    const peak = 0.08 * intensity;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    src.start(now, Math.random() * 0.4, 0.13);
  }

  startWhistle() {
    if (!this.ensureContext() || this.whistleNodes) return;
    const now = this.ctx.currentTime;

    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.14, now + 0.06);

    // Classic British two-tone chime whistle (G5 + B5 approx)
    const osc1 = this.ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(784, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(987.77, now);

    const osc3 = this.ctx.createOscillator();
    osc3.type = "sawtooth";
    osc3.frequency.setValueAtTime(587.33, now);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(2200, now);

    // Subtle steam hiss underneath whistle
    const hiss = this.ctx.createBufferSource();
    hiss.buffer = this.noiseBuffer;
    hiss.loop = true;
    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = "highpass";
    hissFilter.frequency.setValueAtTime(1800, now);
    const hissGain = this.ctx.createGain();
    hissGain.gain.setValueAtTime(0.12, now);

    osc1.connect(lowpass);
    osc2.connect(lowpass);
    osc3.connect(lowpass);
    lowpass.connect(masterGain);

    hiss.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(masterGain);

    masterGain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    hiss.start(now);

    this.whistleNodes = { masterGain, osc1, osc2, osc3, hiss };
  }

  stopWhistle() {
    if (!this.whistleNodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { masterGain, osc1, osc2, osc3, hiss } = this.whistleNodes;
    this.whistleNodes = null;

    try {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(Math.max(0.001, masterGain.gain.value), now);
      masterGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.14);
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          osc3.stop();
          hiss.stop();
          masterGain.disconnect();
        } catch (_) {}
      }, 170);
    } catch (_) {}
  }

  playSwitchClack() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playBrakeHiss() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2600, now);
    filter.Q.setValueAtTime(0.9, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now, 0, 0.26);
  }

  // Play an expressive musical chime + Chinese speech line when clicking Thomas's face
  playThomasExpressionVoice(expr) {
    if (!expr) return;
    if (this.ensureContext()) {
      const now = this.ctx.currentTime;
      const patterns = {
        happy: [
          { f: 523.25, t: 0, d: 0.11, type: "triangle", g: 0.14 },
          { f: 659.25, t: 0.09, d: 0.11, type: "triangle", g: 0.15 },
          { f: 783.99, t: 0.18, d: 0.22, type: "triangle", g: 0.16 },
        ],
        cheeky: [
          { f: 783.99, t: 0, d: 0.09, type: "triangle", g: 0.13 },
          { f: 659.25, t: 0.09, d: 0.08, type: "triangle", g: 0.12 },
          { f: 880.0, t: 0.17, d: 0.11, type: "triangle", g: 0.14 },
          { f: 1046.5, t: 0.26, d: 0.18, type: "sine", g: 0.15 },
        ],
        excited: [
          { f: 587.33, t: 0, d: 0.08, type: "sawtooth", g: 0.09 },
          { f: 783.99, t: 0.08, d: 0.09, type: "triangle", g: 0.14 },
          { f: 1046.5, t: 0.17, d: 0.12, type: "triangle", g: 0.16 },
          { f: 1318.5, t: 0.28, d: 0.24, type: "triangle", g: 0.15 },
        ],
        surprised: [
          { f: 392.0, t: 0, d: 0.16, type: "sine", g: 0.15, slideTo: 880.0 },
          { f: 987.77, t: 0.18, d: 0.2, type: "triangle", g: 0.12 },
        ],
        angry: [
          { f: 246.94, t: 0, d: 0.14, type: "sawtooth", g: 0.11, slideTo: 185.0 },
          { f: 220.0, t: 0.16, d: 0.22, type: "sawtooth", g: 0.11, slideTo: 164.8 },
        ],
      };

      const notes = patterns[expr.id] || patterns.happy;
      for (const n of notes) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = n.type || "triangle";
        osc.frequency.setValueAtTime(n.f, now + n.t);
        if (n.slideTo) {
          osc.frequency.exponentialRampToValueAtTime(n.slideTo, now + n.t + n.d);
        }
        gain.gain.setValueAtTime(0.001, now + n.t);
        gain.gain.linearRampToValueAtTime(n.g || 0.13, now + n.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + n.t + n.d);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now + n.t);
        osc.stop(now + n.t + n.d + 0.02);
      }
    }

    if (this.muted) return;
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(expr.speech || expr.line);
        utt.lang = "zh-CN";
        utt.pitch = expr.voicePitch || 1.25;
        utt.rate = expr.voiceRate || 1.05;
        utt.volume = 0.95;
        const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        const zhVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("zh"));
        if (zhVoice) utt.voice = zhVoice;
        window.speechSynthesis.speak(utt);
      }
    } catch (_) {
      // Ignore if speechSynthesis is unsupported or blocked
    }
  }

  playCarHorn(isTruck = false) {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const baseA = isTruck ? 215 : 410;
    const baseB = isTruck ? 268 : 515;
    for (const [startOff, dur] of [[0, 0.16], [0.22, 0.24]]) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + startOff);
      gain.gain.linearRampToValueAtTime(0.11, now + startOff + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOff + dur);

      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1600, now + startOff);
      lp.connect(gain).connect(this.ctx.destination);

      for (const freq of [baseA, baseB]) {
        const osc = this.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now + startOff);
        osc.connect(lp);
        osc.start(now + startOff);
        osc.stop(now + startOff + dur + 0.02);
      }
    }
  }

  playCrossingBell() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    for (const [freq, amp] of [[1180, 0.045], [2360, 0.022]]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.32);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    }
  }

  playCrashSound() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;

    // 1. Heavy metallic crunch noise burst
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(720, now);
    bp.frequency.exponentialRampToValueAtTime(180, now + 0.55);
    bp.Q.setValueAtTime(0.8, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(0.32, now + 0.015);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    src.connect(bp).connect(nGain).connect(this.ctx.destination);
    src.start(now, 0, 0.65);

    // 2. Low-end impact thud
    const thud = this.ctx.createOscillator();
    const tGain = this.ctx.createGain();
    thud.type = "triangle";
    thud.frequency.setValueAtTime(145, now);
    thud.frequency.exponentialRampToValueAtTime(34, now + 0.34);
    tGain.gain.setValueAtTime(0.001, now);
    tGain.gain.linearRampToValueAtTime(0.28, now + 0.012);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    thud.connect(tGain).connect(this.ctx.destination);
    thud.start(now);
    thud.stop(now + 0.38);

    // 3. Metallic clang overtone
    const clang = this.ctx.createOscillator();
    const cGain = this.ctx.createGain();
    clang.type = "square";
    clang.frequency.setValueAtTime(520, now + 0.02);
    clang.frequency.exponentialRampToValueAtTime(190, now + 0.28);
    cGain.gain.setValueAtTime(0.08, now + 0.02);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    clang.connect(cGain).connect(this.ctx.destination);
    clang.start(now + 0.02);
    clang.stop(now + 0.32);
  }

  playDerailSound() {
    if (!this.ensureContext()) return;
    this.playCrashSound();
    const now = this.ctx.currentTime;

    // Heavy rail screech + coupler snap + long ground rumble
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(520, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + 1.3);

    const rGain = this.ctx.createGain();
    rGain.gain.setValueAtTime(0.001, now);
    rGain.gain.linearRampToValueAtTime(0.36, now + 0.04);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
    src.connect(lp).connect(rGain).connect(this.ctx.destination);
    src.start(now, 0, 1.5);

    // Metallic rail screech slide
    const screech = this.ctx.createOscillator();
    const sGain = this.ctx.createGain();
    screech.type = "sawtooth";
    screech.frequency.setValueAtTime(1280, now + 0.05);
    screech.frequency.exponentialRampToValueAtTime(420, now + 0.72);
    sGain.gain.setValueAtTime(0.001, now + 0.05);
    sGain.gain.linearRampToValueAtTime(0.075, now + 0.1);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    screech.connect(sGain).connect(this.ctx.destination);
    screech.start(now + 0.05);
    screech.stop(now + 0.78);
  }

  playRerailChime() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now + idx * 0.07);
      gain.gain.setValueAtTime(0.001, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.07 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.22);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.24);
    });
  }

  playBarrierBreakSound() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    // Crisp wood/metal snap crack
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1450, now);
    bp.frequency.exponentialRampToValueAtTime(380, now + 0.18);
    bp.Q.setValueAtTime(1.2, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    src.connect(bp).connect(gain).connect(this.ctx.destination);
    src.start(now, 0, 0.24);

    const crack = this.ctx.createOscillator();
    const cGain = this.ctx.createGain();
    crack.type = "triangle";
    crack.frequency.setValueAtTime(340, now);
    crack.frequency.exponentialRampToValueAtTime(95, now + 0.14);
    cGain.gain.setValueAtTime(0.18, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    crack.connect(cGain).connect(this.ctx.destination);
    crack.start(now);
    crack.stop(now + 0.17);
  }

  playHelicopterHoverPulse() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(72, now);
    osc.frequency.linearRampToValueAtTime(58, now + 0.09);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playExplosionSound() {
    if (!this.ensureContext()) return;
    const now = this.ctx.currentTime;

    // 1. Deep sub-bass detonation boom
    const boom = this.ctx.createOscillator();
    const bGain = this.ctx.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(115, now);
    boom.frequency.exponentialRampToValueAtTime(24, now + 0.78);
    bGain.gain.setValueAtTime(0.001, now);
    bGain.gain.linearRampToValueAtTime(0.45, now + 0.02);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    boom.connect(bGain).connect(this.ctx.destination);
    boom.start(now);
    boom.stop(now + 0.98);

    // 2. Fiery roar / blast wave noise
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(980, now);
    lp.frequency.exponentialRampToValueAtTime(140, now + 1.45);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(0.38, now + 0.03);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
    src.connect(lp).connect(nGain).connect(this.ctx.destination);
    src.start(now, 0, 1.6);
  }
}

window.TrainAudio = TrainAudio;
