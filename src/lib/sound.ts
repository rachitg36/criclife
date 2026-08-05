import { useUiStore } from '@/stores/uiStore';

/**
 * The scoring pad's sounds.
 *
 * The "Sound" toggle has been in two settings screens since Phase 5 and
 * **nothing has ever played anything** — `soundEnabled` was written,
 * persisted, and read by no code at all. Exactly the same shape as
 * `advancedScoring`, found the same way: someone turned it on and reported
 * that nothing happened.
 *
 * Synthesised with `AudioContext` rather than shipped as files. Four short
 * tones as audio assets would be tens of kilobytes and another cache to
 * invalidate; as oscillators they are a few hundred bytes of code and no
 * network at all, which matters on a phone at a ground with no signal.
 *
 * Deliberately restrained. This plays over a live match, in public, next to
 * people trying to watch cricket — so the tones are short, quiet, and there
 * is nothing for a dot ball, which is most of them. Off by default, and it
 * stays off by default.
 */
type Cue = 'run' | 'boundary' | 'six' | 'wicket';

/** Frequency (Hz) and length (s). A rising pair for good news, a falling
    one for a wicket — recognisable without being a jingle. */
const CUES: Record<Cue, { notes: number[]; length: number; gain: number }> = {
  run: { notes: [520], length: 0.05, gain: 0.05 },
  boundary: { notes: [520, 780], length: 0.09, gain: 0.07 },
  six: { notes: [520, 780, 1040], length: 0.1, gain: 0.08 },
  wicket: { notes: [420, 260], length: 0.14, gain: 0.07 },
};

let ctx: AudioContext | null = null;

/**
 * One shared context, created on the first sound rather than at import.
 *
 * Browsers refuse to start one before a user gesture, and creating it eagerly
 * leaves a suspended context running for every visitor including the ones who
 * never enable sound.
 */
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function playCue(cue: Cue): void {
  if (!useUiStore.getState().soundEnabled) return;
  const audio = context();
  if (!audio) return;

  const { notes, length, gain } = CUES[cue];
  notes.forEach((freq, i) => {
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = audio.currentTime + i * length;
    // A short attack and a real decay: a square-edged tone clicks, and a click
    // over a stump mic is worse than no sound.
    vol.gain.setValueAtTime(0, start);
    vol.gain.linearRampToValueAtTime(gain, start + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(vol).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  });
}
