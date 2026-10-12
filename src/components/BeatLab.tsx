import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, X, RotateCcw, Sparkles, Download, Volume2 } from 'lucide-react';
import { DrumStepState } from '../types/daw';
import {
  DRUM_INSTRUMENT_NAMES,
  DrumInstrument,
  playDrumSound,
  renderDrumPatternToBuffer,
} from '../audio/drumSynth';
import { audioEngine } from '../audio/AudioEngine';
import { extractPeaks } from '../audio/waveforms';

interface BeatLabProps {
  isOpen: boolean;
  onClose: () => void;
  bpm: number;
  onInsertClipToTimeline: (buffer: AudioBuffer, name: string, durationSec: number, peaks: number[]) => void;
}

const PRESETS: Record<string, DrumStepState> = {
  'House 4x4': {
    kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    snare: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    hihatClosed: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    hihatOpen: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    perc: [false, false, false, true, false, false, false, false, false, false, false, true, false, true, false, false],
  },
  'Boom Bap': {
    kick: [true, false, false, false, false, false, true, false, false, true, false, false, false, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    clap: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    hihatClosed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    hihatOpen: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
    perc: [false, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false],
  },
  'Trap Roll': {
    kick: [true, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false],
    snare: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    clap: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    hihatClosed: [true, true, true, true, true, false, true, true, true, true, true, true, true, true, true, true],
    hihatOpen: [false, false, false, false, false, false, false, false, false, false, false, false, true, false, false, false],
    perc: [false, false, true, false, false, true, false, false, false, false, false, false, false, false, true, false],
  },
  'Synthwave 80s': {
    kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    hihatClosed: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    hihatOpen: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
    perc: [false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, true],
  },
};

const INSTRUMENTS: DrumInstrument[] = ['kick', 'snare', 'clap', 'hihatClosed', 'hihatOpen', 'perc'];

export const BeatLab: React.FC<BeatLabProps> = ({
  isOpen,
  onClose,
  bpm: initialBpm,
  onInsertClipToTimeline,
}) => {
  const [bpm, setBpm] = useState(initialBpm);
  const [swing, setSwing] = useState(0.1);
  const [barsToRender, setBarsToRender] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const [pattern, setPattern] = useState<DrumStepState>(PRESETS['House 4x4']);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setBpm(initialBpm);
  }, [initialBpm]);

  // Live Sequencer playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCurrentStep(0);
      return;
    }

    const ctx = audioEngine.initContext();
    const secondsPerBeat = 60 / bpm;
    const stepDurationMs = (secondsPerBeat / 4) * 1000;

    let step = 0;
    timerRef.current = window.setInterval(() => {
      // Trigger sounds for this step
      for (const inst of INSTRUMENTS) {
        if (pattern[inst][step]) {
          playDrumSound(ctx, inst, ctx.currentTime, ctx.destination, 0.9);
        }
      }

      setCurrentStep(step);
      step = (step + 1) % 16;
    }, stepDurationMs);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, bpm, pattern]);

  if (!isOpen) return null;

  const toggleStep = (inst: DrumInstrument, stepIdx: number) => {
    setPattern((prev) => {
      const nextArr = [...prev[inst]];
      nextArr[stepIdx] = !nextArr[stepIdx];
      return { ...prev, [inst]: nextArr };
    });
  };

  const handleAudition = (inst: DrumInstrument) => {
    const ctx = audioEngine.initContext();
    playDrumSound(ctx, inst, ctx.currentTime, ctx.destination, 1.0);
  };

  const handleClear = () => {
    setPattern({
      kick: new Array(16).fill(false),
      snare: new Array(16).fill(false),
      clap: new Array(16).fill(false),
      hihatClosed: new Array(16).fill(false),
      hihatOpen: new Array(16).fill(false),
      perc: new Array(16).fill(false),
    });
  };

  const handleRandomize = () => {
    setPattern({
      kick: Array.from({ length: 16 }, (_, i) => i % 4 === 0 || (Math.random() > 0.8 && i % 2 === 0)),
      snare: Array.from({ length: 16 }, (_, i) => i === 4 || i === 12 || Math.random() > 0.85),
      clap: Array.from({ length: 16 }, (_, i) => i === 4 || i === 12),
      hihatClosed: Array.from({ length: 16 }, () => Math.random() > 0.3),
      hihatOpen: Array.from({ length: 16 }, (_, i) => i % 4 === 2 && Math.random() > 0.5),
      perc: Array.from({ length: 16 }, () => Math.random() > 0.75),
    });
  };

  const handleInsertToTimeline = async () => {
    const renderedBuffer = await renderDrumPatternToBuffer(pattern, bpm, swing, barsToRender);
    const peaks = extractPeaks(renderedBuffer, 120);
    const name = `Drum Pattern (${barsToRender} ${barsToRender === 1 ? 'bar' : 'bars'})`;
    onInsertClipToTimeline(renderedBuffer, name, renderedBuffer.duration, peaks);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-[#121622] border border-[#232c3f] rounded-xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Top Header */}
        <div className="h-14 border-b border-[#21293a] px-6 flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">BEAT LAB — 16-Step Drum Machine</h2>
              <p className="text-[11px] text-slate-400">Synthesize 808/909 kicks, snares, claps, and grooves</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Toolbar */}
        <div className="px-6 py-3 border-b border-[#1e2535] bg-[#0f131c] flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Play / Stop / Step indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-bold border transition-all ${
                isPlaying
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-lg shadow-cyan-500/20'
                  : 'bg-[#1e2738] text-cyan-400 hover:bg-[#273248] border-[#2f3d56]'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause' : 'Audition Loop'}</span>
            </button>

            {/* BPM */}
            <div className="flex items-center gap-1.5 bg-[#171e2c] border border-[#26334a] px-2.5 py-1 rounded-lg">
              <span className="text-slate-400 font-mono text-[11px]">BPM</span>
              <input
                type="number"
                min="50"
                max="240"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
                className="w-12 bg-transparent text-cyan-400 font-bold font-mono text-center outline-none"
              />
            </div>

            {/* Swing Slider */}
            <div className="flex items-center gap-1.5 bg-[#171e2c] border border-[#26334a] px-2.5 py-1 rounded-lg">
              <span className="text-slate-400 font-mono text-[11px]">SWING</span>
              <input
                type="range"
                min="0"
                max="0.6"
                step="0.05"
                value={swing}
                onChange={(e) => setSwing(parseFloat(e.target.value))}
                className="w-16 h-1 bg-slate-700 cursor-pointer"
              />
              <span className="text-cyan-400 font-mono text-[11px] w-8">
                {Math.round(swing * 100)}%
              </span>
            </div>
          </div>

          {/* Preset Selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Pattern Presets:</span>
            <div className="flex items-center gap-1">
              {Object.keys(PRESETS).map((pName) => (
                <button
                  key={pName}
                  onClick={() => setPattern(PRESETS[pName])}
                  className="px-2 py-1 rounded bg-[#171e2c] hover:bg-[#253247] text-slate-300 hover:text-white border border-[#26334a] text-[11px] transition-colors"
                >
                  {pName}
                </button>
              ))}
            </div>

            <button
              onClick={handleRandomize}
              title="Randomize Drum Pattern"
              className="p-1.5 rounded bg-[#171e2c] hover:bg-[#253247] text-slate-300 hover:text-white border border-[#26334a]"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleClear}
              title="Clear Pattern"
              className="p-1.5 rounded bg-[#171e2c] hover:bg-rose-950 text-slate-300 hover:text-rose-400 border border-[#26334a]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 16-Step Grid */}
        <div className="p-6 overflow-x-auto flex flex-col gap-3">
          {/* Step numbers header */}
          <div className="flex items-center gap-2 pl-36">
            {Array.from({ length: 16 }).map((_, stepIdx) => {
              const isQuarter = stepIdx % 4 === 0;
              const isCurrent = isPlaying && currentStep === stepIdx;
              return (
                <div
                  key={stepIdx}
                  className={`w-9 text-center text-[10px] font-mono font-bold transition-colors ${
                    isCurrent
                      ? 'text-cyan-400 scale-110'
                      : isQuarter
                      ? 'text-slate-200'
                      : 'text-slate-500'
                  }`}
                >
                  {stepIdx + 1}
                </div>
              );
            })}
          </div>

          {/* Instrument Rows */}
          {INSTRUMENTS.map((inst) => (
            <div key={inst} className="flex items-center gap-2">
              {/* Instrument Label + Audition */}
              <div className="w-36 flex items-center justify-between pr-2">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {DRUM_INSTRUMENT_NAMES[inst]}
                </span>
                <button
                  onClick={() => handleAudition(inst)}
                  title="Audition Sound"
                  className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 16 Step Buttons */}
              <div className="flex items-center gap-1.5">
                {pattern[inst].map((isActive, stepIdx) => {
                  const isQuarterStart = stepIdx % 4 === 0;
                  const isCurrent = isPlaying && currentStep === stepIdx;

                  return (
                    <button
                      key={stepIdx}
                      onClick={() => toggleStep(inst, stepIdx)}
                      className={`w-9 h-10 rounded-md border flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-cyan-500 border-cyan-400 text-slate-950 shadow-md shadow-cyan-500/30 font-bold'
                          : isQuarterStart
                          ? 'bg-[#1b2333] border-[#293750] hover:bg-[#253147]'
                          : 'bg-[#141a27] border-[#20293b] hover:bg-[#1f283b]'
                      } ${isCurrent ? 'ring-2 ring-white ring-offset-1 ring-offset-[#121622]' : ''}`}
                    >
                      {isActive && <div className="w-2 h-2 rounded-full bg-slate-950" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Actions: Insert into Timeline */}
        <div className="h-16 border-t border-[#21293a] px-6 bg-[#151a28] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Render Length:</span>
            <select
              value={barsToRender}
              onChange={(e) => setBarsToRender(parseInt(e.target.value) || 1)}
              className="bg-[#0f131c] border border-[#232c3d] text-white rounded px-2 py-1 outline-none text-xs"
            >
              <option value={1}>1 Bar (16 steps)</option>
              <option value={2}>2 Bars (32 steps loop)</option>
              <option value={4}>4 Bars (Full loop)</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleInsertToTimeline}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Insert Loop to Timeline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
