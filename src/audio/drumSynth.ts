import { DrumStepState } from '../types/daw';

export type DrumInstrument = keyof DrumStepState;

export const DRUM_INSTRUMENT_NAMES: Record<DrumInstrument, string> = {
  kick: 'Bass Kick',
  snare: 'Crisp Snare',
  hihatClosed: 'Closed Hi-Hat',
  hihatOpen: 'Open Hi-Hat',
  clap: 'Stereo Clap',
  perc: 'Rim / Perc',
};

/**
 * Triggers a synthesized drum sound at a specific time on a BaseAudioContext.
 */
export function playDrumSound(
  ctx: BaseAudioContext,
  instrument: DrumInstrument,
  time = ctx.currentTime,
  destination: AudioNode = ctx.destination,
  gainMultiplier = 1.0
) {
  const t = Math.max(time, ctx.currentTime);

  switch (instrument) {
    case 'kick': {
      // Punchy 808/909 hybrid kick: pitch drop + attack click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.12);

      gain.gain.setValueAtTime(1.0 * gainMultiplier, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      // Click transient
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(450, t);
      clickOsc.frequency.exponentialRampToValueAtTime(60, t + 0.025);
      clickGain.gain.setValueAtTime(0.7 * gainMultiplier, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

      osc.connect(gain);
      clickOsc.connect(clickGain);
      gain.connect(destination);
      clickGain.connect(destination);

      osc.start(t);
      clickOsc.start(t);
      osc.stop(t + 0.4);
      clickOsc.stop(t + 0.03);
      break;
    }

    case 'snare': {
      // Snare: tonal body + white noise snap
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
      oscGain.gain.setValueAtTime(0.7 * gainMultiplier, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      // Noise generator
      const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.22), ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(1000, t);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.85 * gainMultiplier, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(oscGain);
      oscGain.connect(destination);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(destination);

      osc.start(t);
      noiseSource.start(t);
      osc.stop(t + 0.16);
      noiseSource.stop(t + 0.24);
      break;
    }

    case 'hihatClosed': {
      // Metallic closed hi-hat: filtered white noise with rapid decay
      const noiseLen = Math.floor(ctx.sampleRate * 0.06);
      const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(7500, t);
      filter.Q.setValueAtTime(2.5, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6 * gainMultiplier, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      source.start(t);
      source.stop(t + 0.06);
      break;
    }

    case 'hihatOpen': {
      // Open hi-hat: longer metallic sizzle
      const noiseLen = Math.floor(ctx.sampleRate * 0.35);
      const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(6800, t);
      filter.Q.setValueAtTime(2.0, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.65 * gainMultiplier, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      source.start(t);
      source.stop(t + 0.35);
      break;
    }

    case 'clap': {
      // Clap: 3 short bursts of filtered noise followed by reverb-like tail
      const totalLen = Math.floor(ctx.sampleRate * 0.28);
      const noiseBuffer = ctx.createBuffer(1, totalLen, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < totalLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.Q.setValueAtTime(1.5, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      // Bursts
      gain.gain.setValueAtTime(0.7 * gainMultiplier, t);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
      gain.gain.setValueAtTime(0.75 * gainMultiplier, t + 0.013);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.026);
      gain.gain.setValueAtTime(0.85 * gainMultiplier, t + 0.028);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      source.start(t);
      source.stop(t + 0.28);
      break;
    }

    case 'perc': {
      // Woodblock / high rim percussion
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(860, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.06);

      gain.gain.setValueAtTime(0.7 * gainMultiplier, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(t);
      osc.stop(t + 0.08);
      break;
    }
  }
}

/**
 * Renders a full 16-step drum pattern into a self-contained stereo AudioBuffer.
 * This can be stored and dropped directly as a timeline clip!
 */
export async function renderDrumPatternToBuffer(
  pattern: DrumStepState,
  bpm: number,
  swing = 0,
  bars = 1
): Promise<AudioBuffer> {
  const secondsPerBeat = 60 / bpm;
  const stepDuration = secondsPerBeat / 4; // 16th note
  const totalSteps = 16 * bars;
  const totalDuration = totalSteps * stepDuration + 0.5; // tail room

  const offlineCtx = new OfflineAudioContext(2, Math.ceil(offlineCtxSampleRate * totalDuration), offlineCtxSampleRate);

  const instruments: DrumInstrument[] = ['kick', 'snare', 'hihatClosed', 'hihatOpen', 'clap', 'perc'];

  for (let step = 0; step < totalSteps; step++) {
    const patternStepIndex = step % 16;
    // Calculate swing on even 16th notes (steps 1, 3, 5...)
    let timeOffset = step * stepDuration;
    if (patternStepIndex % 2 === 1 && swing > 0) {
      timeOffset += stepDuration * (swing * 0.5);
    }

    for (const inst of instruments) {
      if (pattern[inst][patternStepIndex]) {
        playDrumSound(offlineCtx, inst, timeOffset, offlineCtx.destination, 0.9);
      }
    }
  }

  return await offlineCtx.startRendering();
}

const offlineCtxSampleRate = 44100;
