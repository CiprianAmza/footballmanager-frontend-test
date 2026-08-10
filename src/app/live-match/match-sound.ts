/**
 * Crowd audio for match moments — synthesised with WebAudio, no assets.
 * A goal gets a rising cheer, a save/miss/block a short groan. Everything is
 * fire-and-forget and fails silently (autoplay policies, missing AudioContext).
 *
 * Mute switch: localStorage `fm_matchSound` = '0'. The AudioContext is created
 * lazily on the first play call, which in practice follows a user gesture
 * (starting/continuing a match), so autoplay restrictions are satisfied.
 */

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (audioContext) return audioContext;
  try {
    const Ctor = window.AudioContext
      || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  } catch {
    return null;
  }
  return audioContext;
}

export function matchSoundEnabled(): boolean {
  return localStorage.getItem('fm_matchSound') !== '0';
}

export function setMatchSoundEnabled(enabled: boolean): void {
  localStorage.setItem('fm_matchSound', enabled ? '1' : '0');
}

/** White-noise burst through a swept bandpass — the base of both sounds. */
function crowdBurst(durationSec: number, freqFrom: number, freqTo: number,
                    peakGain: number, attackSec: number): void {
  const ctx = context();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') { void ctx.resume(); }
    const sampleCount = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    const now = ctx.currentTime;
    filter.frequency.setValueAtTime(freqFrom, now);
    filter.frequency.exponentialRampToValueAtTime(freqTo, now + durationSec * 0.6);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + attackSec);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + durationSec);
  } catch {
    // Audio is a garnish — never let it break playback.
  }
}

/** Roaring cheer for a goal. */
export function playCheer(): void {
  if (!matchSoundEnabled()) return;
  crowdBurst(2.4, 350, 1000, 0.5, 0.25);
  // A second, brighter layer gives the roar some body.
  crowdBurst(1.6, 800, 1600, 0.25, 0.2);
}

/** Collective "ohhh" for a near miss / big save / block. */
export function playGroan(): void {
  if (!matchSoundEnabled()) return;
  crowdBurst(1.1, 600, 220, 0.35, 0.12);
}

/** Low descending rumble — the home end booing (away goal, cynical foul). */
export function playBoo(): void {
  if (!matchSoundEnabled()) return;
  crowdBurst(1.8, 240, 110, 0.45, 0.25);
}

let stopAmbienceFn: (() => void) | null = null;

/** Continuous stadium murmur: looped filtered noise with a slow swell. Runs
 *  for the whole match; idempotent (a second start is a no-op). */
export function startCrowdAmbience(): void {
  if (stopAmbienceFn || !matchSoundEnabled()) return;
  const ctx = context();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') { void ctx.resume(); }
    const master = ctx.createGain();
    master.gain.value = 0.045;
    master.connect(ctx.destination);
    const stops: Array<() => void> = [];

    const layer = (type: BiquadFilterType, freq: number, gain: number) => {
      const length = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const layerGain = ctx.createGain();
      layerGain.gain.value = gain;
      source.connect(filter).connect(layerGain).connect(master);
      source.start();
      stops.push(() => { try { source.stop(); } catch { /* already stopped */ } });
    };
    layer('lowpass', 420, 1.0);   // the low murmur bed
    layer('bandpass', 950, 0.35); // distant voices

    // Slow swell so the murmur breathes instead of hissing statically.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();
    stops.push(() => { try { lfo.stop(); } catch { /* already stopped */ } });

    stopAmbienceFn = () => {
      stops.forEach(stop => stop());
      try { master.disconnect(); } catch { /* context gone */ }
    };
  } catch {
    stopAmbienceFn = null;
  }
}

export function stopCrowdAmbience(): void {
  const stop = stopAmbienceFn;
  stopAmbienceFn = null;
  try { stop?.(); } catch { /* best effort */ }
}

/**
 * The home end SINGS: a massed, wordless chant whose rhythm follows the team
 * name's syllables ("E-lek-tras! E-lek-tras!") on a classic terrace melody.
 * Built from many detuned sawtooth "voices" pushed through vowel formant
 * filters — it reads as a crowd chanting, not as a talking robot.
 */
export function playChant(teamName: string): void {
  if (!matchSoundEnabled() || !teamName) return;
  const ctx = context();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') { void ctx.resume(); }
    const syllables = Math.max(2, Math.min(5,
      (teamName.toLowerCase().match(/[aeiouyăâîó]+/g) || ['a', 'a', 'a']).length));
    const beat = 0.3;
    const base = 196; // G3 — massed-crowd register
    // Terrace melody per syllable: root, root, up a third, root, up a second.
    const steps = [1.0, 1.0, 1.26, 1.0, 1.12];
    const start = ctx.currentTime + 0.05;
    let slot = 0;
    for (let repeat = 0; repeat < 2; repeat++) {
      for (let s = 0; s < syllables; s++) {
        const at = start + slot * beat + repeat * beat * 0.6;
        const isLast = s === syllables - 1;
        chantSyllable(ctx, at, base * steps[s % steps.length],
            isLast ? beat * 1.7 : beat * 0.9);
        slot++;
      }
    }
    // Crowd surge underneath the singing.
    crowdBurst(syllables * 2 * beat + 1.4, 300, 700, 0.15, 0.5);
  } catch { /* chant layer is optional */ }
}

/** One sung syllable: detuned saw voices through "ah/eh" vowel formants, with
 *  the slight end-of-note pitch drop that makes it feel sung. */
function chantSyllable(ctx: AudioContext, at: number, freq: number, dur: number): void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(0.085, at + 0.05);
  master.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  master.connect(ctx.destination);
  const formants: Array<[number, number, number]> =
    [[600, 8, 1.0], [1040, 10, 0.45], [2250, 12, 0.16]];
  for (const [formantFreq, q, gain] of formants) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = formantFreq;
    filter.Q.value = q;
    const formantGain = ctx.createGain();
    formantGain.gain.value = gain;
    filter.connect(formantGain).connect(master);
    for (const detuneCents of [-32, -12, 0, 16, 36]) {
      const voice = ctx.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(freq, at);
      voice.frequency.exponentialRampToValueAtTime(freq * 0.96, at + dur);
      voice.detune.value = detuneCents;
      voice.connect(filter);
      voice.start(at);
      voice.stop(at + dur + 0.02);
    }
  }
}
