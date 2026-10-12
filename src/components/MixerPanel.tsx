import React from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import { Project, Track } from '../types/daw';

interface MixerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  onUpdateMasterVolume: (vol: number) => void;
  onUpdateMasterPan: (pan: number) => void;
}

export const MixerPanel: React.FC<MixerPanelProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateTrack,
  onUpdateMasterVolume,
  onUpdateMasterPan,
}) => {
  if (!isOpen) return null;

  return (
    <div className="h-72 bg-[#10141e] border-t border-[#1f283a] flex flex-col shrink-0 select-none z-30">
      {/* Mixer Top Bar */}
      <div className="h-8 border-b border-[#1c2435] px-4 flex items-center justify-between bg-[#131824] text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-200">MIXER CONSOLE</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {project.tracks.length} Channels + Master Bus
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mixer Channel Strips Container */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden p-2 gap-2 bg-[#0c0f16]">
        {/* Track Channel Strips */}
        {project.tracks.map((track) => (
          <div
            key={track.id}
            style={{ borderTopColor: track.color }}
            className="w-40 border-t-2 border-r border-l border-b border-[#1c2436] bg-[#121622] rounded-b-lg p-2 flex flex-col justify-between shrink-0 shadow-sm"
          >
            {/* Track Name */}
            <div className="text-center truncate">
              <span className="text-xs font-bold text-slate-200 block truncate" title={track.name}>
                {track.name}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500">{track.type}</span>
            </div>

            {/* EQ & Send Dials in Mini Grid */}
            <div className="grid grid-cols-2 gap-1.5 bg-[#0a0d13] p-1.5 rounded-md border border-[#1b2233] text-[9px]">
              {/* High EQ */}
              <div className="flex flex-col items-center">
                <span className="text-slate-400">HI</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={track.effects?.eq?.high || 0}
                  onChange={(e) =>
                    onUpdateTrack(track.id, {
                      effects: {
                        ...track.effects,
                        eq: { ...track.effects.eq, high: parseFloat(e.target.value) },
                      },
                    })
                  }
                  className="w-12 h-1 bg-slate-800"
                />
                <span className="font-mono text-cyan-400">{track.effects?.eq?.high || 0}dB</span>
              </div>

              {/* Low EQ */}
              <div className="flex flex-col items-center">
                <span className="text-slate-400">LOW</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={track.effects?.eq?.low || 0}
                  onChange={(e) =>
                    onUpdateTrack(track.id, {
                      effects: {
                        ...track.effects,
                        eq: { ...track.effects.eq, low: parseFloat(e.target.value) },
                      },
                    })
                  }
                  className="w-12 h-1 bg-slate-800"
                />
                <span className="font-mono text-cyan-400">{track.effects?.eq?.low || 0}dB</span>
              </div>

              {/* Reverb Send */}
              <div className="flex flex-col items-center">
                <span className="text-slate-400">REV</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={track.effects?.reverb?.mix || 0}
                  onChange={(e) =>
                    onUpdateTrack(track.id, {
                      effects: {
                        ...track.effects,
                        reverb: { ...track.effects.reverb, mix: parseFloat(e.target.value) },
                      },
                    })
                  }
                  className="w-12 h-1 bg-slate-800"
                />
                <span className="font-mono text-violet-400">
                  {Math.round((track.effects?.reverb?.mix || 0) * 100)}%
                </span>
              </div>

              {/* Delay Send */}
              <div className="flex flex-col items-center">
                <span className="text-slate-400">DLY</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={track.effects?.delay?.mix || 0}
                  onChange={(e) =>
                    onUpdateTrack(track.id, {
                      effects: {
                        ...track.effects,
                        delay: { ...track.effects.delay, mix: parseFloat(e.target.value) },
                      },
                    })
                  }
                  className="w-12 h-1 bg-slate-800"
                />
                <span className="font-mono text-emerald-400">
                  {Math.round((track.effects?.delay?.mix || 0) * 100)}%
                </span>
              </div>
            </div>

            {/* Pan Slider */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 font-mono text-[9px]">PAN</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={track.pan}
                onChange={(e) => onUpdateTrack(track.id, { pan: parseFloat(e.target.value) })}
                className="w-20 h-1 bg-slate-800"
              />
              <span className="font-mono text-[9px] text-slate-300 w-5">
                {track.pan === 0 ? 'C' : track.pan < 0 ? 'L' : 'R'}
              </span>
            </div>

            {/* Mute & Solo Buttons */}
            <div className="flex items-center gap-1.5 justify-center">
              <button
                onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                  track.muted
                    ? 'bg-amber-500 border-amber-400 text-slate-950'
                    : 'bg-[#1b2231] border-[#29354e] text-slate-400 hover:text-white'
                }`}
              >
                {track.muted ? <VolumeX className="w-3 h-3 mx-auto" /> : 'MUTE'}
              </button>
              <button
                onClick={() => onUpdateTrack(track.id, { soloed: !track.soloed })}
                className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                  track.soloed
                    ? 'bg-cyan-400 border-cyan-300 text-slate-950'
                    : 'bg-[#1b2231] border-[#29354e] text-slate-400 hover:text-white'
                }`}
              >
                SOLO
              </button>
            </div>

            {/* Main Volume Fader */}
            <div className="flex items-center gap-2 bg-[#090b10] p-1.5 rounded border border-[#1b2233]">
              <Volume2 className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.02"
                value={track.volume}
                onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 cursor-pointer"
              />
              <span className="font-mono text-[10px] text-cyan-400 w-8 text-right">
                {Math.round(track.volume * 100)}%
              </span>
            </div>
          </div>
        ))}

        {/* Master Output Bus Strip */}
        <div className="w-44 border-t-2 border-t-cyan-400 border-r border-l border-b border-[#243147] bg-[#141b29] rounded-b-lg p-2.5 flex flex-col justify-between shrink-0 shadow-md ml-auto">
          <div className="text-center">
            <span className="text-xs font-extrabold text-cyan-300 block">MASTER BUS</span>
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Main Stereo Out</span>
          </div>

          <div className="flex flex-col gap-2 bg-[#0c1017] p-2 rounded-lg border border-[#212c40]">
            {/* Master Pan */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-mono text-[9px]">PAN</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={project.masterPan || 0}
                onChange={(e) => onUpdateMasterPan(parseFloat(e.target.value))}
                className="w-20 h-1 bg-slate-800"
              />
              <span className="font-mono text-[9px] text-cyan-400 w-5">
                {project.masterPan === 0 ? 'C' : project.masterPan < 0 ? 'L' : 'R'}
              </span>
            </div>
          </div>

          {/* Master Volume Fader */}
          <div className="flex flex-col gap-1.5 bg-[#0c1017] p-2 rounded-lg border border-[#212c40]">
            <div className="flex items-center justify-between text-[10px] text-slate-300">
              <span>OUTPUT LEVEL</span>
              <span className="font-mono text-cyan-400 font-bold">{Math.round(project.masterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.02"
              value={project.masterVolume}
              onChange={(e) => onUpdateMasterVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-800 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
