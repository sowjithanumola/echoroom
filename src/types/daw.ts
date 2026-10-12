export type TrackType = 'audio' | 'synth' | 'drums';

export type AutomationType = 'none' | 'volume' | 'pan';

export interface AutomationPoint {
  id: string;
  timeFraction: number; // 0.0 to 1.0 (relative to clip duration)
  value: number; // Volume: 0.0 to 1.5 (1.0 = 100%), Pan: -1.0 to 1.0 (0 = center)
}

export interface ClipAutomation {
  volume?: AutomationPoint[];
  pan?: AutomationPoint[];
}

export interface Clip {
  id: string;
  name: string;
  trackId: string;
  startSeconds: number; // timeline start in seconds
  durationSeconds: number; // played duration on timeline
  offsetSeconds: number; // offset into source buffer (for trimming)
  bufferId: string; // key to AudioBuffer
  color?: string;
  volume: number; // 0.0 - 2.0 (default 1.0)
  peaks?: number[];
  automation?: ClipAutomation;
}

export interface TrackEffects {
  eq: {
    low: number; // dB (-12 to +12)
    mid: number; // dB (-12 to +12)
    high: number; // dB (-12 to +12)
    midFreq?: number; // Hz (default 1000)
  };
  delay: {
    time: number; // seconds (0.01 to 1.0)
    feedback: number; // 0.0 to 0.85
    mix: number; // 0.0 to 1.0
  };
  reverb: {
    decay: number; // seconds (0.5 to 5.0)
    mix: number; // 0.0 to 1.0
  };
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number; // 0.0 - 1.5, default 1.0
  pan: number; // -1.0 to 1.0, default 0
  muted: boolean;
  soloed: boolean;
  clips: Clip[];
  effects: TrackEffects;
  automationMode?: AutomationType; // 'none' | 'volume' | 'pan'
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  timeSignature: [number, number]; // e.g. [4, 4]
  durationBars: number; // total visible timeline bars (e.g. 32)
  masterVolume: number; // 0.0 - 1.5
  masterPan: number; // -1.0 - 1.0
  loopEnabled: boolean;
  loopStartBar: number;
  loopEndBar: number;
  tracks: Track[];
  updatedAt: number;
}

export interface DrumStepState {
  kick: boolean[];
  snare: boolean[];
  hihatClosed: boolean[];
  hihatOpen: boolean[];
  clap: boolean[];
  perc: boolean[];
}

export interface SynthSettings {
  waveform: OscillatorType;
  attack: number; // 0.001 - 2.0s
  decay: number; // 0.01 - 2.0s
  sustain: number; // 0.0 - 1.0
  release: number; // 0.01 - 3.0s
  cutoff: number; // 20 - 20000 Hz
  resonance: number; // 0 - 20 Q
  octave: number; // -2 to +2
  volume: number; // 0.0 - 1.0
}

export interface StoredAudioBuffer {
  id: string;
  name: string;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  channelData: Float32Array[];
  peaks: number[];
}
