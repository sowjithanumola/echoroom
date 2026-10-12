import React, { useState, useEffect, useRef } from 'react';
import { X, Sliders, Music, Download } from 'lucide-react';
import { SynthSettings } from '../types/daw';
import { PolySynth, NOTE_NAMES, renderSynthSequenceToBuffer, SynthSequenceNote } from '../audio/synthEngine';
import { audioEngine } from '../audio/AudioEngine';
import { extractPeaks } from '../audio/waveforms';

interface SynthStudioProps {
  isOpen: boolean;
  onClose: () => void;
  bpm: number;
  onInsertClipToTimeline: (buffer: AudioBuffer, name: string, durationSec: number, peaks: number[]) => void;
}

const PRESET_PATCHES: Record<string, Partial<SynthSettings>> = {
  'Warm Pad': {
    waveform: 'sawtooth',
    attack: 0.25,
    decay: 0.5,
    sustain: 0.8,
    release: 0.6,
    cutoff: 2400,
    resonance: 2.0,
    octave: 0,
    volume: 0.65,
  },
  'Punchy Bass': {
    waveform: 'square',
    attack: 0.01,
    decay: 0.2,
    sustain: 0.35,
    release: 0.15,
    cutoff: 800,
    resonance: 5.0,
    octave: -1,
    volume: 0.8,
  },
  'Cyber Lead': {
    waveform: 'sawtooth',
    attack: 0.02,
    decay: 0.3,
    sustain: 0.7,
    release: 0.3,
    cutoff: 4200,
    resonance: 3.5,
    octave: 1,
    volume: 0.7,
  },
  'Crystal Bell': {
    waveform: 'sine',
    attack: 0.005,
    decay: 0.8,
    sustain: 0.1,
    release: 0.8,
    cutoff: 5000,
    resonance: 1.0,
    octave: 1,
    volume: 0.7,
  },
};

// Computer keyboard to MIDI key mapping (2 octaves)
const KEY_MAP: Record<string, number> = {
  a: 60, // C4
  w: 61, // C#4
  s: 62, // D4
  e: 63, // D#4
  d: 64, // E4
  f: 65, // F4
  t: 66, // F#4
  g: 67, // G4
  y: 68, // G#4
  h: 69, // A4
  u: 70, // A#4
  j: 71, // B4
  k: 72, // C5
  o: 73, // C#5
  l: 74, // D5
  p: 75, // D#5
  ';': 76, // E5
};

export const SynthStudio: React.FC<SynthStudioProps> = ({
  isOpen,
  onClose,
  bpm,
  onInsertClipToTimeline,
}) => {
  const [settings, setSettings] = useState<SynthSettings>({
    waveform: 'sawtooth',
    attack: 0.05,
    decay: 0.3,
    sustain: 0.7,
    release: 0.35,
    cutoff: 3000,
    resonance: 2.5,
    octave: 0,
    volume: 0.75,
  });

  const [activeMidiNotes, setActiveMidiNotes] = useState<Set<number>>(new Set());
  const [recordedNotes, setRecordedNotes] = useState<SynthSequenceNote[]>([]);
  const [isRecordingMelody, setIsRecordingMelody] = useState(false);
  const recordingStartTimeRef = useRef<number>(0);

  const synthRef = useRef<PolySynth | null>(null);

  // Initialize live poly synth
  useEffect(() => {
    if (!isOpen) {
      if (synthRef.current) {
        synthRef.current.releaseAll();
      }
      return;
    }

    const ctx = audioEngine.initContext();
    synthRef.current = new PolySynth(ctx, settings, ctx.destination);

    return () => {
      if (synthRef.current) {
        synthRef.current.releaseAll();
        synthRef.current = null;
      }
    };
  }, [isOpen]);

  // Update synth settings when controls change
  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.updateSettings(settings);
    }
  }, [settings]);

  // Handle computer keyboard triggers
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const midi = KEY_MAP[key];
      if (midi !== undefined) {
        handleNoteOn(midi);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = KEY_MAP[key];
      if (midi !== undefined) {
        handleNoteOff(midi);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isOpen, settings, isRecordingMelody]);

  if (!isOpen) return null;

  const handleNoteOn = (midi: number) => {
    if (!synthRef.current) return;
    synthRef.current.noteOn(midi, 0.85);

    setActiveMidiNotes((prev) => new Set(prev).add(midi));

    if (isRecordingMelody) {
      const secondsPerBeat = 60 / bpm;
      const elapsedSec = (Date.now() - recordingStartTimeRef.current) / 1000;
      const startBeat = elapsedSec / secondsPerBeat;
      setRecordedNotes((prev) => [
        ...prev,
        {
          note: midi,
          startBeat,
          durationBeats: 1.0, // default, will trim on noteOff
        },
      ]);
    }
  };

  const handleNoteOff = (midi: number) => {
    if (!synthRef.current) return;
    synthRef.current.noteOff(midi);

    setActiveMidiNotes((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });

    if (isRecordingMelody) {
      const secondsPerBeat = 60 / bpm;
      const elapsedSec = (Date.now() - recordingStartTimeRef.current) / 1000;
      const endBeat = elapsedSec / secondsPerBeat;
      setRecordedNotes((prev) => {
        return prev.map((item) => {
          if (item.note === midi && item.durationBeats === 1.0) {
            return {
              ...item,
              durationBeats: Math.max(0.2, endBeat - item.startBeat),
            };
          }
          return item;
        });
      });
    }
  };

  const startRecordMelody = () => {
    setRecordedNotes([]);
    setIsRecordingMelody(true);
    recordingStartTimeRef.current = Date.now();
  };

  const stopRecordMelody = () => {
    setIsRecordingMelody(false);
  };

  const handleInsertRecordedMelody = async () => {
    if (recordedNotes.length === 0) return;

    let maxBeat = 0;
    for (const n of recordedNotes) {
      if (n.startBeat + n.durationBeats > maxBeat) {
        maxBeat = n.startBeat + n.durationBeats;
      }
    }
    const totalBeats = Math.max(4, Math.ceil(maxBeat / 4) * 4); // round up to bars

    const buffer = await renderSynthSequenceToBuffer(recordedNotes, settings, bpm, totalBeats);
    const peaks = extractPeaks(buffer, 120);
    onInsertClipToTimeline(buffer, `Synth Melody (${settings.waveform})`, buffer.duration, peaks);
    onClose();
  };

  const handleInsertProgressionPreset = async (progressionName: string) => {
    let notes: SynthSequenceNote[] = [];
    if (progressionName === 'Am - F - C - G') {
      notes = [
        { note: 57, startBeat: 0, durationBeats: 1.8 },
        { note: 60, startBeat: 0, durationBeats: 1.8 },
        { note: 64, startBeat: 0, durationBeats: 1.8 },
        { note: 53, startBeat: 2, durationBeats: 1.8 },
        { note: 57, startBeat: 2, durationBeats: 1.8 },
        { note: 60, startBeat: 2, durationBeats: 1.8 },
        { note: 48, startBeat: 4, durationBeats: 1.8 },
        { note: 52, startBeat: 4, durationBeats: 1.8 },
        { note: 55, startBeat: 4, durationBeats: 1.8 },
        { note: 55, startBeat: 6, durationBeats: 1.8 },
        { note: 59, startBeat: 6, durationBeats: 1.8 },
        { note: 62, startBeat: 6, durationBeats: 1.8 },
      ];
    } else if (progressionName === 'Arp Lead Line') {
      notes = [
        { note: 60, startBeat: 0, durationBeats: 0.3 },
        { note: 64, startBeat: 0.5, durationBeats: 0.3 },
        { note: 67, startBeat: 1, durationBeats: 0.3 },
        { note: 71, startBeat: 1.5, durationBeats: 0.3 },
        { note: 72, startBeat: 2, durationBeats: 0.3 },
        { note: 67, startBeat: 2.5, durationBeats: 0.3 },
        { note: 64, startBeat: 3, durationBeats: 0.3 },
        { note: 60, startBeat: 3.5, durationBeats: 0.3 },
      ];
    }

    const buffer = await renderSynthSequenceToBuffer(notes, settings, bpm, 8);
    const peaks = extractPeaks(buffer, 120);
    onInsertClipToTimeline(buffer, `${progressionName} Clip`, buffer.duration, peaks);
    onClose();
  };

  // 2 Octaves: C3 (48) to B5 (83)
  const startMidi = 48; // C3
  const endMidi = 72; // C5
  const keysList: { midi: number; isBlack: boolean; label: string }[] = [];

  for (let m = startMidi; m <= endMidi; m++) {
    const noteIndex = m % 12;
    const noteName = NOTE_NAMES[noteIndex];
    const isBlack = noteName.includes('#');
    keysList.push({ midi: m, isBlack, label: noteName });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-[#121622] border border-[#232c3f] rounded-xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Top Header */}
        <div className="h-14 border-b border-[#21293a] px-6 flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">SYNTH STUDIO — Sound Designer & Keys</h2>
              <p className="text-[11px] text-slate-400">Play polyphonic synth with ADSR envelopes and lowpass filter</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Synth Parameter Controls Panel */}
        <div className="p-6 bg-[#0f131d] border-b border-[#1e2535] grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          {/* Section 1: Oscillator & Waveform */}
          <div className="flex flex-col gap-3 bg-[#151b27] p-3.5 rounded-xl border border-[#232d40]">
            <span className="font-bold text-slate-300 text-[11px] tracking-wide uppercase">Oscillator</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(['sawtooth', 'square', 'sine', 'triangle'] as OscillatorType[]).map((wave) => (
                <button
                  key={wave}
                  onClick={() => setSettings({ ...settings, waveform: wave })}
                  className={`py-1.5 px-2 rounded-lg font-semibold capitalize border transition-all ${
                    settings.waveform === wave
                      ? 'bg-violet-600 border-violet-400 text-white shadow-md shadow-violet-950/40'
                      : 'bg-[#1b2230] border-[#29364d] text-slate-400 hover:text-white'
                  }`}
                >
                  {wave}
                </button>
              ))}
            </div>

            {/* Octave & Volume */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-slate-400">Octave:</span>
              <div className="flex items-center gap-1">
                {[-1, 0, 1].map((oct) => (
                  <button
                    key={oct}
                    onClick={() => setSettings({ ...settings, octave: oct })}
                    className={`w-7 h-6 rounded border font-mono font-bold text-[10px] ${
                      settings.octave === oct
                        ? 'bg-violet-500 border-violet-400 text-white'
                        : 'bg-[#1b2230] border-[#29364d] text-slate-400'
                    }`}
                  >
                    {oct > 0 ? `+${oct}` : oct}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: ADSR Envelope */}
          <div className="flex flex-col gap-2.5 bg-[#151b27] p-3.5 rounded-xl border border-[#232d40]">
            <span className="font-bold text-slate-300 text-[11px] tracking-wide uppercase">ADSR Envelope</span>

            {/* Attack */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Attack:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.005"
                  max="1.5"
                  step="0.01"
                  value={settings.attack}
                  onChange={(e) => setSettings({ ...settings, attack: parseFloat(e.target.value) })}
                  className="w-24 h-1 bg-slate-700"
                />
                <span className="font-mono text-violet-400 w-10 text-right">{settings.attack.toFixed(2)}s</span>
              </div>
            </div>

            {/* Decay */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Decay:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.05"
                  max="1.5"
                  step="0.01"
                  value={settings.decay}
                  onChange={(e) => setSettings({ ...settings, decay: parseFloat(e.target.value) })}
                  className="w-24 h-1 bg-slate-700"
                />
                <span className="font-mono text-violet-400 w-10 text-right">{settings.decay.toFixed(2)}s</span>
              </div>
            </div>

            {/* Sustain */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Sustain:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.sustain}
                  onChange={(e) => setSettings({ ...settings, sustain: parseFloat(e.target.value) })}
                  className="w-24 h-1 bg-slate-700"
                />
                <span className="font-mono text-violet-400 w-10 text-right">{Math.round(settings.sustain * 100)}%</span>
              </div>
            </div>

            {/* Release */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Release:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.05"
                  max="2.5"
                  step="0.05"
                  value={settings.release}
                  onChange={(e) => setSettings({ ...settings, release: parseFloat(e.target.value) })}
                  className="w-24 h-1 bg-slate-700"
                />
                <span className="font-mono text-violet-400 w-10 text-right">{settings.release.toFixed(2)}s</span>
              </div>
            </div>
          </div>

          {/* Section 3: Filter & Presets */}
          <div className="flex flex-col gap-2.5 bg-[#151b27] p-3.5 rounded-xl border border-[#232d40]">
            <span className="font-bold text-slate-300 text-[11px] tracking-wide uppercase">Filter & Sound Presets</span>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Cutoff:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="200"
                  max="12000"
                  step="100"
                  value={settings.cutoff}
                  onChange={(e) => setSettings({ ...settings, cutoff: parseFloat(e.target.value) })}
                  className="w-24 h-1 bg-slate-700"
                />
                <span className="font-mono text-violet-400 w-10 text-right">{Math.round(settings.cutoff)}Hz</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Resonance:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.1"
                  max="12"
                  step="0.2"
                  value={settings.resonance}
                  onChange={(e) => setSettings({ ...settings, resonance: parseFloat(e.target.value) })}
                  className="w-24 h-1 bg-slate-700"
                />
                <span className="font-mono text-violet-400 w-10 text-right">{settings.resonance.toFixed(1)}</span>
              </div>
            </div>

            {/* Presets */}
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.keys(PRESET_PATCHES).map((pName) => (
                <button
                  key={pName}
                  onClick={() => setSettings({ ...settings, ...PRESET_PATCHES[pName] })}
                  className="px-2 py-1 bg-[#1c2434] hover:bg-[#28344b] border border-[#2a3852] text-slate-300 text-[10px] font-medium rounded transition-colors"
                >
                  {pName}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Piano Keyboard */}
        <div className="p-6 bg-[#0c0f16] flex flex-col items-center">
          <div className="text-[11px] text-slate-400 mb-3 flex items-center gap-2">
            <span>Use mouse or computer keys:</span>
            <span className="font-mono px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 border border-slate-700">A W S E D F T G Y H U J K</span>
          </div>

          {/* Piano Keys Strip */}
          <div className="relative flex h-36 bg-[#161a24] p-1.5 rounded-xl border border-[#242b3a] shadow-inner overflow-x-auto max-w-full">
            {keysList.map((item) => {
              const isActive = activeMidiNotes.has(item.midi);

              if (item.isBlack) {
                return (
                  <button
                    key={item.midi}
                    onMouseDown={() => handleNoteOn(item.midi)}
                    onMouseUp={() => handleNoteOff(item.midi)}
                    onMouseLeave={() => activeMidiNotes.has(item.midi) && handleNoteOff(item.midi)}
                    className={`w-7 h-24 -mx-3.5 z-20 rounded-b-md border transition-all ${
                      isActive
                        ? 'bg-violet-400 border-violet-300 shadow-lg shadow-violet-500/50 scale-y-95'
                        : 'bg-[#0d1017] hover:bg-[#1a2130] border-black/80'
                    }`}
                  >
                    <span className="block text-[8px] font-mono text-slate-500 mt-16">{item.label}</span>
                  </button>
                );
              }

              return (
                <button
                  key={item.midi}
                  onMouseDown={() => handleNoteOn(item.midi)}
                  onMouseUp={() => handleNoteOff(item.midi)}
                  onMouseLeave={() => activeMidiNotes.has(item.midi) && handleNoteOff(item.midi)}
                  className={`w-11 h-32 z-10 rounded-b-lg border border-[#2b3549] flex flex-col justify-end pb-2 items-center transition-all ${
                    isActive
                      ? 'bg-violet-200 border-violet-400 shadow-md shadow-violet-400/40 scale-y-95'
                      : 'bg-gradient-to-b from-[#e2e8f0] to-[#cbd5e1] hover:from-white hover:to-[#e2e8f0] text-slate-800'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold text-slate-600">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Bar: Melody Recording & Bake to Timeline */}
        <div className="h-16 border-t border-[#21293a] px-6 bg-[#151a28] flex items-center justify-between">
          {/* Quick Progression presets */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden sm:inline">Instant Clips:</span>
            <button
              onClick={() => handleInsertProgressionPreset('Am - F - C - G')}
              className="px-2.5 py-1.5 rounded-lg bg-[#1a2130] hover:bg-[#253046] text-violet-300 text-xs font-medium border border-[#2a364e] transition-colors"
            >
              + Am-F-C-G Chords
            </button>
            <button
              onClick={() => handleInsertProgressionPreset('Arp Lead Line')}
              className="px-2.5 py-1.5 rounded-lg bg-[#1a2130] hover:bg-[#253046] text-violet-300 text-xs font-medium border border-[#2a364e] transition-colors"
            >
              + Arp Lead Hook
            </button>
          </div>

          {/* Melody Recorder Actions */}
          <div className="flex items-center gap-3">
            {isRecordingMelody ? (
              <button
                onClick={stopRecordMelody}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold animate-pulse"
              >
                <div className="w-2.5 h-2.5 bg-white rounded-full" />
                <span>Stop Recording ({recordedNotes.length} notes)</span>
              </button>
            ) : (
              <button
                onClick={startRecordMelody}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1b2230] hover:bg-[#263145] text-slate-200 border border-[#29364d] rounded-lg text-xs font-semibold"
              >
                <Music className="w-3.5 h-3.5 text-rose-400" />
                <span>Record My Keys</span>
              </button>
            )}

            {recordedNotes.length > 0 && !isRecordingMelody && (
              <button
                onClick={handleInsertRecordedMelody}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 text-white rounded-lg text-xs font-bold shadow-md shadow-violet-950/40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Insert Recorded Melody ({recordedNotes.length} notes)</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
