import { SynthSettings } from '../types/daw';

export interface NoteVoice {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  stopTime: number;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Returns frequency in Hz for MIDI note number (69 = A4 = 440Hz)
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Converts note name and octave e.g. "C4" to MIDI number
 */
export function noteNameToMidi(name: string): number {
  const note = name.slice(0, -1);
  const octave = parseInt(name.slice(-1), 10);
  const index = NOTE_NAMES.indexOf(note);
  return (octave + 1) * 12 + index;
}

export class PolySynth {
  private ctx: BaseAudioContext;
  private activeVoices: Map<number, NoteVoice> = new Map();
  private settings: SynthSettings;
  private outputNode: AudioNode;

  constructor(ctx: BaseAudioContext, settings: SynthSettings, outputNode?: AudioNode) {
    this.ctx = ctx;
    this.settings = { ...settings };
    this.outputNode = outputNode || ctx.destination;
  }

  public updateSettings(settings: Partial<SynthSettings>) {
    this.settings = { ...this.settings, ...settings };
  }

  public noteOn(midiNote: number, velocity = 0.8) {
    if (this.activeVoices.has(midiNote)) {
      this.noteOff(midiNote);
    }

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    const shiftedMidi = midiNote + this.settings.octave * 12;
    const freq = midiToFreq(shiftedMidi);

    osc.type = this.settings.waveform;
    osc.frequency.setValueAtTime(freq, t);

    // Filter
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.settings.cutoff, t);
    filter.Q.setValueAtTime(this.settings.resonance, t);

    // ADSR Envelope
    const { attack, decay, sustain, volume } = this.settings;
    const targetGain = velocity * volume;

    gain.gain.setValueAtTime(0.0001, t);
    // Attack
    gain.gain.linearRampToValueAtTime(targetGain, t + Math.max(0.005, attack));
    // Decay to sustain
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, targetGain * sustain), t + attack + Math.max(0.01, decay));

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputNode);

    osc.start(t);

    this.activeVoices.set(midiNote, { osc, filter, gain, stopTime: 0 });
  }

  public noteOff(midiNote: number) {
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;

    const t = this.ctx.currentTime;
    const { release } = this.settings;

    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
    voice.gain.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.01, release));

    voice.osc.stop(t + release + 0.05);

    setTimeout(() => {
      try {
        voice.osc.disconnect();
        voice.filter.disconnect();
        voice.gain.disconnect();
      } catch {
        // ignore already disconnected
      }
    }, (release + 0.1) * 1000);

    this.activeVoices.delete(midiNote);
  }

  public releaseAll() {
    for (const midiNote of Array.from(this.activeVoices.keys())) {
      this.noteOff(midiNote);
    }
  }
}

export interface SynthSequenceNote {
  note: number; // MIDI number
  startBeat: number; // in beats (0 = beginning)
  durationBeats: number;
  velocity?: number;
}

/**
 * Renders a synth sequence or melody into an AudioBuffer using OfflineAudioContext.
 */
export async function renderSynthSequenceToBuffer(
  notes: SynthSequenceNote[],
  settings: SynthSettings,
  bpm: number,
  totalBeats: number
): Promise<AudioBuffer> {
  const secondsPerBeat = 60 / bpm;
  const totalDuration = totalBeats * secondsPerBeat + settings.release + 0.5;
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

  const synth = new PolySynth(offlineCtx, settings, offlineCtx.destination);

  for (const item of notes) {
    const startTime = item.startBeat * secondsPerBeat;
    const endTime = (item.startBeat + item.durationBeats) * secondsPerBeat;
    const shiftedMidi = item.note + settings.octave * 12;
    const freq = midiToFreq(shiftedMidi);

    const osc = offlineCtx.createOscillator();
    const filter = offlineCtx.createBiquadFilter();
    const gain = offlineCtx.createGain();

    osc.type = settings.waveform;
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(settings.cutoff, startTime);
    filter.Q.setValueAtTime(settings.resonance, startTime);

    const vel = item.velocity ?? 0.8;
    const targetGain = vel * settings.volume;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(targetGain, startTime + Math.max(0.005, settings.attack));
    gain.gain.linearRampToValueAtTime(
      Math.max(0.0001, targetGain * settings.sustain),
      startTime + settings.attack + Math.max(0.01, settings.decay)
    );

    gain.gain.setValueAtTime(Math.max(0.0001, targetGain * settings.sustain), endTime);
    gain.gain.linearRampToValueAtTime(0.0001, endTime + Math.max(0.01, settings.release));

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(offlineCtx.destination);

    osc.start(startTime);
    osc.stop(endTime + settings.release + 0.1);
  }

  return await offlineCtx.startRendering();
}
