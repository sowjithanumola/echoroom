import React from 'react';
import { X, SlidersHorizontal, Activity } from 'lucide-react';
import { Track } from '../types/daw';

interface EffectsDrawerProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
}

export const EffectsDrawer: React.FC<EffectsDrawerProps> = ({
  track,
  isOpen,
  onClose,
  onUpdateTrack,
}) => {
  if (!isOpen || !track) return null;

  const eq = track.effects?.eq || { low: 0, mid: 0, high: 0, midFreq: 1000 };
  const delay = track.effects?.delay || { time: 0.3, feedback: 0.3, mix: 0 };
  const reverb = track.effects?.reverb || { decay: 2.0, mix: 0 };

  const handleUpdateEQ = (updates: Partial<typeof eq>) => {
    onUpdateTrack(track.id, {
      effects: {
        ...track.effects,
        eq: { ...eq, ...updates },
      },
    });
  };

  const handleUpdateDelay = (updates: Partial<typeof delay>) => {
    onUpdateTrack(track.id, {
      effects: {
        ...track.effects,
        delay: { ...delay, ...updates },
      },
    });
  };

  const handleUpdateReverb = (updates: Partial<typeof reverb>) => {
    onUpdateTrack(track.id, {
      effects: {
        ...track.effects,
        reverb: { ...reverb, ...updates },
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-[#121622] border border-[#232c3f] rounded-xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b border-[#21293a] px-6 flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: track.color }}
              className="w-3 h-3 rounded-full shadow-sm"
            />
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                FX RACK — {track.name}
              </h2>
              <p className="text-[11px] text-slate-400">Equalizer, Echo Delay, and Algorithmic Reverb</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modules Grid */}
        <div className="p-6 flex flex-col gap-6 bg-[#0e121a]">
          {/* Module 1: 3-Band Parametric EQ */}
          <div className="bg-[#141925] border border-[#232c3f] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-200">3-BAND EQUALIZER</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs">
              {/* Low Shelf */}
              <div className="flex flex-col gap-1.5 bg-[#0d1017] p-2.5 rounded-lg border border-[#1b2233]">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Low Shelf (250Hz)</span>
                  <span className="font-mono text-cyan-400">{eq.low} dB</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eq.low}
                  onChange={(e) => handleUpdateEQ({ low: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 cursor-pointer"
                />
              </div>

              {/* Mid Peaking */}
              <div className="flex flex-col gap-1.5 bg-[#0d1017] p-2.5 rounded-lg border border-[#1b2233]">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Mid Peak ({eq.midFreq || 1000}Hz)</span>
                  <span className="font-mono text-cyan-400">{eq.mid} dB</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eq.mid}
                  onChange={(e) => handleUpdateEQ({ mid: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 cursor-pointer"
                />
              </div>

              {/* High Shelf */}
              <div className="flex flex-col gap-1.5 bg-[#0d1017] p-2.5 rounded-lg border border-[#1b2233]">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>High Shelf (4.5kHz)</span>
                  <span className="font-mono text-cyan-400">{eq.high} dB</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={eq.high}
                  onChange={(e) => handleUpdateEQ({ high: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Module 2: Delay & Reverb row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Delay */}
            <div className="bg-[#141925] border border-[#232c3f] rounded-xl p-4 flex flex-col gap-3 text-xs">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">ECHO DELAY</span>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Time:</span>
                  <span className="font-mono text-emerald-400">{delay.time.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.02"
                  value={delay.time}
                  onChange={(e) => handleUpdateDelay({ time: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800"
                />

                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Feedback:</span>
                  <span className="font-mono text-emerald-400">{Math.round(delay.feedback * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.85"
                  step="0.05"
                  value={delay.feedback}
                  onChange={(e) => handleUpdateDelay({ feedback: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800"
                />

                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Wet Mix:</span>
                  <span className="font-mono text-emerald-400">{Math.round(delay.mix * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={delay.mix}
                  onChange={(e) => handleUpdateDelay({ mix: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800"
                />
              </div>
            </div>

            {/* Reverb */}
            <div className="bg-[#141925] border border-[#232c3f] rounded-xl p-4 flex flex-col gap-3 text-xs">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-bold text-slate-200">ALGORITHMIC REVERB</span>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Decay Time:</span>
                  <span className="font-mono text-violet-400">{reverb.decay.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="4.5"
                  step="0.2"
                  value={reverb.decay}
                  onChange={(e) => handleUpdateReverb({ decay: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800"
                />

                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Wet Mix:</span>
                  <span className="font-mono text-violet-400">{Math.round(reverb.mix * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={reverb.mix}
                  onChange={(e) => handleUpdateReverb({ mix: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-[#21293a] px-6 bg-[#151a28] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
