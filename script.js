// Tailwind Configuration
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        serif: ['"Playfair Display"', 'serif']
      },
      colors: {
        blush: {
          50: '#fdf8f8',
          100: '#fbeeee',
          200: '#f7dcdc',
          300: '#f1c2c2',
          400: '#e59d9d',
          500: '#d67575',
          600: '#be5353',
          700: '#9e4242'
        },
        roseGold: {
          light: '#fdf2f2',
          DEFAULT: '#e8bcbc',
          dark: '#c49393'
        }
      }
    }
  }
};

const $ = id => document.getElementById(id);

/* ===== YouTube music =====
   Paste your YouTube link here (add ?t=45 or &t=45 to start at 45s). Leave '' to disable. */
const MUSIC_URL = 'https://youtu.be/RHT8gNLRFtU?si=9DxbOfDgvKHyjBV1';
const MUSIC_VOLUME = 100; // 0-100

const MUSIC_ID = (() => {
  const m = MUSIC_URL.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : (/^[\w-]{11}$/.test(MUSIC_URL) ? MUSIC_URL : null);
})();
const MUSIC_START = (() => {
  const m = MUSIC_URL.match(/[?&#](?:t|start)=(\d+)/);
  return m ? +m[1] : 0;
})();
let ytPlayer = null, ytReady = false, wantMusic = false;

function syncMusicBtn() {
  const playing = ytReady && ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 1;
  $('music-icon-on').classList.toggle('hidden', !playing);
  $('music-icon-off').classList.toggle('hidden', playing);
}

if (MUSIC_ID) {
  window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-player', {
      width: '200',
      height: '200',
      videoId: MUSIC_ID,
      playerVars: {
        playsinline: 1,
        controls: 0,
        loop: 1,
        playlist: MUSIC_ID,
        start: MUSIC_START,
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: () => {
          ytReady = true;
          ytPlayer.setVolume(MUSIC_VOLUME);
          if (wantMusic) ytPlayer.playVideo();
        },
        onStateChange: syncMusicBtn,
        onError: () => {
          $('music-btn').classList.add('hidden');
          console.warn('YouTube video cannot be played (embedding disabled or unavailable).');
        }
      }
    });
  };
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

function playMusic() {
  if (!MUSIC_ID) return;
  wantMusic = true;
  $('music-btn').classList.remove('hidden');
  $('music-btn').classList.add('flex');
  if (ytReady) {
    ytPlayer.setVolume(MUSIC_VOLUME);
    ytPlayer.playVideo();
  }
}

function stopMusic() {
  wantMusic = false;
  if (ytReady) ytPlayer.pauseVideo();
  $('music-btn').classList.add('hidden');
  $('music-btn').classList.remove('flex');
}

function toggleMusic() {
  if (!ytReady) return;
  if (ytPlayer.getPlayerState() === 1) {
    wantMusic = false;
    ytPlayer.pauseVideo();
  } else {
    wantMusic = true;
    ytPlayer.playVideo();
  }
}

const candlesContainer = $('candles-container');
const totalCandles = 3;
let candlesBlown = false,
  sharedAudioCtx = null,
  micSource = null,
  analyser = null,
  micStream = null,
  isListening = false,
  animationFrameId = null,
  freqData = null;

function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

// Pre-warm and unlock audio context on any user interaction
const unlockAudio = () => { getAudioContext(); };
['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
  document.addEventListener(evt, unlockAudio, { passive: true });
});

const BLOW_THRESHOLD = 60;
const METER_MAX = 100;

const meterEl = $('meter'),
  meterWrap = $('meter-wrap'),
  meterFill = $('meter-fill'),
  meterPeak = $('meter-peak'),
  meterPct = $('meter-pct'),
  meterStatus = $('meter-status');
let displayLevel = 0,
  peakLevel = 0,
  shownPct = 0,
  shownPeak = 0,
  meterRaf = null;

(function placeTarget() {
  const pos = (BLOW_THRESHOLD / METER_MAX) * 100;
  $('meter-target').style.left = pos + '%';
  $('meter-zone').style.left = pos + '%';
  $('meter-target-label').style.left = Math.min(Math.max(pos, 22), 82) + '%';
})();

/* Sparkles in the background */
(function sparks() {
  const wrap = $('sparks');
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    const size = 3 + Math.random() * 5;
    s.className = 'spark';
    s.style.cssText = `left:${Math.random() * 100}%;top:${20 + Math.random() * 75}%;width:${size}px;height:${size}px;--d:${4 + Math.random() * 4}s;--delay:${-Math.random() * 6}s`;
    wrap.appendChild(s);
  }
})();

/* Smooth step switching */
function showStep(id) {
  const cur = document.querySelector('.step.active');
  const next = $(id);
  const go = () => {
    next.classList.remove('hidden');
    void next.offsetWidth;
    next.classList.add('active');
  };
  if (cur) {
    cur.classList.remove('active');
    setTimeout(() => {
      cur.classList.add('hidden');
      go();
    }, 450);
  } else go();
}

/* Meter: values glide toward target every frame */
function meterTick() {
  const targetPct = Math.min(100, (displayLevel / METER_MAX) * 100);
  const targetPeak = Math.min(100, (peakLevel / METER_MAX) * 100);
  shownPct += (targetPct - shownPct) * 0.3;
  shownPeak += (targetPeak - shownPeak) * 0.2;
  meterFill.style.width = shownPct + '%';
  meterPeak.style.left = 'calc(' + shownPeak + '% - 3px)';
  meterPct.textContent = Math.round(shownPct) + '%';
  meterEl.setAttribute('aria-valuenow', Math.round(shownPct));
  const ratio = displayLevel / BLOW_THRESHOLD;
  meterFill.style.backgroundColor = ratio >= 1 ? '#d67575' : ratio >= 0.7 ? '#ffb703' : '#f1c2c2';
  candlesContainer.style.setProperty('--lean', (-Math.min(ratio, 1.2) * 14).toFixed(1));
  const settled = Math.abs(targetPct - shownPct) < 0.1 && Math.abs(targetPeak - shownPeak) < 0.1;
  meterRaf = (isListening || !settled) ? requestAnimationFrame(meterTick) : null;
}

function startMeterLoop() {
  if (!meterRaf) meterRaf = requestAnimationFrame(meterTick);
}

function setMeter(level, now) {
  displayLevel = Math.max(level, displayLevel * 0.9);
  peakLevel = Math.max(level, peakLevel * 0.985);
  const ratio = displayLevel / BLOW_THRESHOLD;
  meterStatus.textContent = ratio >= 1 ? 'Wish sent!' : ratio >= 0.7 ? 'Almost there, keep blowing' : ratio >= 0.15 ? 'Blow harder' : 'Listening…';
  startMeterLoop();
}

function resetMeter(statusText) {
  displayLevel = 0;
  peakLevel = 0;
  meterFill.style.backgroundColor = '#f1c2c2';
  meterStatus.textContent = statusText || 'Mic is off';
  candlesContainer.style.setProperty('--lean', 0);
  startMeterLoop();
}

function renderCandles() {
  candlesContainer.innerHTML = '';
  for (let i = 0; i < totalCandles; i++) {
    const c = document.createElement('div');
    c.className = 'flex flex-col items-center candle-item relative';
    c.style.animationDelay = (0.3 + i * 0.12) + 's';
    c.innerHTML = `
      <div class="flame-wrap"><div class="flame w-[7px] h-[11px] bg-gradient-to-t from-amber-400 via-orange-300 to-amber-100 rounded-[50%_50%_50%_50%/65%_65%_35%_35%] mb-1" style="animation-delay:${-i * 0.2}s"></div></div>
      <div class="w-[5px] h-9 rounded-t-full bg-gradient-to-b from-white to-blush-200"></div>`;
    candlesContainer.appendChild(c);
  }
}
renderCandles();

function extinguishCandles() {
  if (candlesBlown) return;
  candlesBlown = true;
  stopMicrophone(false);
  document.querySelectorAll('.candle-item').forEach((item, i) => {
    setTimeout(() => {
      item.querySelector('.flame-wrap').classList.add('out');
      const s = document.createElement('span');
      s.className = 'smoke';
      item.appendChild(s);
      setTimeout(() => s.remove(), 1700);
    }, i * 140);
  });
  setTimeout(() => {
    const r = candlesContainer.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top, 110);
  }, 300);
  setTimeout(() => {
    releaseMicHardware();
    showStep('step-envelope');
    $('env').classList.remove('open');
    $('env').classList.add('env-wobble');
  }, 1500);
}

/* Envelope open sound: paper slide + flap rustle */
function openCardSound() {
  try {
    const c = getAudioContext();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t = c.currentTime + 0.01;
    const master = c.createGain();
    master.gain.value = 0.8;
    master.connect(c.destination);

    // Paper rustle: filtered noise with a rising sweep
    const len = Math.floor(c.sampleRate * 0.5), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
    const g = c.createGain();
    g.gain.value = 0.35;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);

    // Soft flap tick
    const tick = c.createBufferSource(), tl = Math.floor(c.sampleRate * 0.04), tb = c.createBuffer(1, tl, c.sampleRate), td = tb.getChannelData(0);
    for (let i = 0; i < tl; i++) td[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / tl, 3);
    tick.buffer = tb;
    const tf = c.createBiquadFilter();
    tf.type = 'highpass';
    tf.frequency.value = 1500;
    const tg = c.createGain();
    tg.gain.value = 0.5;
    tick.connect(tf); tf.connect(tg); tg.connect(master);
    tick.start(t + 0.3);
  } catch (e) {
    /* audio unavailable; ignore */
  }
}

function openCard() {
  const env = $('env');
  if (env.classList.contains('open')) return;
  env.classList.remove('env-wobble');
  env.classList.add('open');
  openCardSound();
  playMusic();
  setTimeout(() => {
    showStep('step-card');
    document.querySelectorAll('#card-body > *').forEach((el, i) => {
      el.classList.remove('in');
      void el.offsetWidth;
      el.classList.add('in');
      el.style.animationDelay = (0.7 + i * 0.22) + 's';
    });
  }, 1100);
}

function resetExperience() {
  stopMusic();
  candlesBlown = false;
  releaseMicHardware();
  renderCandles();
  resetMeter();
  showStep('step-cake');
}

function releaseMicHardware() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
}

async function toggleMicrophone() {
  // Synchronously initialize and unlock audio context during direct user gesture
  getAudioContext();

  if (isListening) {
    stopMicrophone(true);
    return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    micSource = ctx.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    freqData = new Uint8Array(analyser.frequencyBinCount);
    isListening = true;
    meterWrap.classList.remove('idle');
    resetMeter('Listening…');
    $('mic-btn-text').innerText = "Listening... Blow into mic now!";
    $('mic-btn').classList.add('listening');
    detectBlow();
  } catch (err) {
    console.error("Microphone access denied or error:", err);
    alert("Microphone access is required for breath detection. You can also simply tap the candles to blow them out!");
    stopMicrophone(true);
  }
}

function stopMicrophone(releaseHardware = true) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (micSource) {
    try { micSource.disconnect(); } catch (e) {}
    micSource = null;
  }
  isListening = false;
  meterWrap.classList.add('idle');
  if (!candlesBlown) resetMeter();
  $('mic-btn-text').innerText = "Enable Mic to Blow Out Candles";
  $('mic-btn').classList.remove('listening');
  if (releaseHardware) {
    releaseMicHardware();
  }
}

function detectBlow() {
  if (!isListening || !analyser) return;
  analyser.getByteFrequencyData(freqData);
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) sum += freqData[i];
  const level = sum / freqData.length;
  setMeter(level, performance.now());
  if (level > BLOW_THRESHOLD && !candlesBlown) {
    extinguishCandles();
    return;
  }
  animationFrameId = requestAnimationFrame(detectBlow);
}

/* Confetti: one persistent, DPR-aware loop with tumbling pieces */
const canvas = $('confetti-canvas');
const ctx = canvas.getContext('2d');
let pieces = [], confettiRaf = null;

function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeCanvas();
addEventListener('resize', sizeCanvas);

/* Confetti sound: realistic party popper = sharp air "pop" + paper streamer rustle (noise only, no tones) */
function confettiSound(count) {
  try {
    const c = getAudioContext();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t = c.currentTime + 0.005;
    const master = c.createGain();
    master.gain.value = Math.min(1, 0.6 + count / 250);
    master.connect(c.destination);
    const noiseBuf = (dur, pow) => {
      const len = Math.floor(c.sampleRate * dur),
        buf = c.createBuffer(1, len, c.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, pow);
      return buf;
    };
    const noise = (dur, pow, type, freq, q, gain, start) => {
      const src = c.createBufferSource();
      src.buffer = noiseBuf(dur, pow);
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(start);
    };

    // 1) Pop: sharp crack + round "air" body, mid-range (not shrill)
    noise(0.05, 4, 'highpass', 1200, 0.7, 0.9, t); // snap/crack
    noise(0.14, 3, 'bandpass', 700, 0.6, 1.1, t); // air burst body
    const th = c.createOscillator(),
      tg = c.createGain(); // low chest "thud"
    th.frequency.setValueAtTime(170, t);
    th.frequency.exponentialRampToValueAtTime(65, t + 0.09);
    tg.gain.setValueAtTime(0.7, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    th.connect(tg);
    tg.connect(master);
    th.start(t);
    th.stop(t + 0.12);

    // 2) Streamer / confetti flutter: soft paper rustle, quickly fading
    noise(0.7, 2, 'bandpass', 2200, 0.5, 0.22, t + 0.04);
    const flutters = Math.min(18, 8 + Math.round(count / 10));
    for (let i = 0; i < flutters; i++) {
      const st = t + 0.06 + Math.pow(Math.random(), 1.6) * 0.6; // denser early, sparser later
      noise(0.04 + Math.random() * 0.04, 2, 'bandpass', 1500 + Math.random() * 1800, 1.2, 0.07 + Math.random() * 0.12, st);
    }
  } catch (e) {
    /* audio unavailable; ignore */
  }
}

function confettiBurst(x, y, count) {
  const trigger = () => {
    confettiSound(count);
    spawnConfetti(x, y, count);
  };
  const c = getAudioContext();
  if (c && c.state === 'suspended') {
    c.resume().then(trigger).catch(trigger);
  } else {
    trigger();
  }
}

function spawnConfetti(x, y, count) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f1c2c2', '#e59d9d', '#d67575', '#fbeeee', '#ffd166', '#ffb703'];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const sp = 6 + Math.random() * 9;
    pieces.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.4,
      wob: Math.random() * 6.28,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1,
      decay: 0.004 + Math.random() * 0.006,
      round: Math.random() < 0.3
    });
  }
  if (!confettiRaf) confettiRaf = requestAnimationFrame(confettiTick);
}

function confettiTick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  pieces = pieces.filter(p => p.life > 0 && p.y < innerHeight + 20);
  for (const p of pieces) {
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + 0.22;
    p.x += p.vx + Math.sin(p.wob) * 0.6;
    p.y += p.vy;
    p.rot += p.vr;
    p.wob += 0.08;
    p.life -= p.decay;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.abs(Math.cos(p.wob)) * 0.8 + 0.2);
    ctx.fillStyle = p.color;
    if (p.round) {
      ctx.beginPath();
      ctx.arc(0, 0, p.h, 0, 6.28);
      ctx.fill();
    } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  confettiRaf = pieces.length ? requestAnimationFrame(confettiTick) : null;
  if (!pieces.length) ctx.clearRect(0, 0, innerWidth, innerHeight);
}