import React, { useState } from 'react';
import { Mic, Music, Piano, SlidersHorizontal, Trash2, Volume2, VolumeX, GripVertical } from 'lucide-react';
import { Track, AutomationType } from '../types/daw';

interface TrackHeaderProps {
  track: Track;
  trackIndex: number;
  isSelected: boolean;
  onSelect: (trackId: string) => void;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  onDeleteTrack: (trackId: string) => void;
  onOpenFX: (trackId: string) => void;
  onFileDrop: (trackId: string, file: File) => void;
  onReorderTrack?: (sourceIndex: number, targetIndex: number) => void;
}

export const TrackHeader: React.FC<TrackHeaderProps> = ({
  track,
  trackIndex,
  isSelected,
  onSelect,
  onUpdateTrack,
  onDeleteTrack,
  onOpenFX,
  onFileDrop,
  onReorderTrack,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(track.name);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (name.trim()) {
      onUpdateTrack(track.id, { name: name.trim() });
    }
  };

  const getTrackIcon = () => {
    switch (track.type) {
      case 'drums':
        return <Music className="w-3.5 h-3.5 text-cyan-400" />;
      case 'synth':
        return <Piano className="w-3.5 h-3.5 text-violet-400" />;
      case 'audio':
      default:
        return <Mic className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('text/track-index')) {
      setIsDropTarget(true);
    } else {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
    setIsDropTarget(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    setIsDropTarget(false);

    const srcIdxStr = e.dataTransfer.getData('text/track-index');
    if (srcIdxStr !== '') {
      const srcIdx = parseInt(srcIdxStr, 10);
      if (!isNaN(srcIdx) && srcIdx !== trackIndex) {
        onReorderTrack?.(srcIdx, trackIndex);
      }
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileDrop(track.id, e.dataTransfer.files[0]);
    }
  };

  const handleHeaderDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/track-index', String(trackIndex));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      onClick={() => onSelect(track.id)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        borderLeftColor: track.color,
      }}
      className={`h-28 w-60 border-l-4 border-b border-r border-[#1e2535] bg-[#121620] px-3 py-2 flex flex-col justify-between shrink-0 select-none cursor-pointer transition-colors relative ${
        isSelected ? 'bg-[#181e2b] ring-1 ring-cyan-500/40' : 'hover:bg-[#151a26]'
      } ${isDraggingOver ? 'bg-cyan-950/40 ring-2 ring-cyan-400' : ''} ${
        isDropTarget ? 'border-t-2 border-t-cyan-400 bg-cyan-950/30' : ''
      }`}
    >
      {/* Visual Reorder Drop Indicator */}
      {isDropTarget && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_8px_#22d3ee] pointer-events-none z-30" />
      )}

      {/* Row 1: Grip, Icon, Name, FX, Delete */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 truncate flex-1">
          {/* Track Reorder Grip */}
          <div
            draggable
            onDragStart={handleHeaderDragStart}
            title="Drag to reorder track position"
            className="cursor-grab active:cursor-grabbing p-0.5 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800/60"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          <span className="shrink-0">{getTrackIcon()}</span>

          {isEditingName ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameBlur();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              autoFocus
              className="bg-[#0a0c10] border border-cyan-500 text-white text-xs px-1 py-0.5 rounded outline-none w-24"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              title="Double click to rename"
              className="text-xs font-semibold text-slate-200 truncate hover:text-white"
            >
              {track.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenFX(track.id);
            }}
            title="Track FX Rack (EQ, Delay, Reverb)"
            className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteTrack(track.id);
            }}
            title="Delete Track"
            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row 2: Mute, Solo & Volume Slider */}
      <div className="flex items-center gap-2">
        {/* Mute Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateTrack(track.id, { muted: !track.muted });
          }}
          title={track.muted ? 'Unmute Track' : 'Mute Track'}
          className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] transition-all ${
            track.muted
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
              : 'bg-[#1b2230] text-slate-400 hover:text-slate-200 hover:bg-[#252f44]'
          }`}
        >
          {track.muted ? <VolumeX className="w-3 h-3" /> : 'M'}
        </button>

        {/* Solo Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateTrack(track.id, { soloed: !track.soloed });
          }}
          title={track.soloed ? 'Unsolo Track' : 'Solo Track'}
          className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] transition-all ${
            track.soloed
              ? 'bg-cyan-400 text-slate-950 font-extrabold shadow-sm'
              : 'bg-[#1b2230] text-slate-400 hover:text-slate-200 hover:bg-[#252f44]'
          }`}
        >
          S
        </button>

        {/* Volume Fader */}
        <div className="flex-1 flex items-center gap-1.5 bg-[#0d1017] px-1.5 py-1 rounded border border-[#1e2535]">
          <Volume2 className="w-3 h-3 text-slate-500 shrink-0" />
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.02"
            value={track.volume}
            onChange={(e) => {
              e.stopPropagation();
              onUpdateTrack(track.id, { volume: parseFloat(e.target.value) });
            }}
            title={`Track Volume: ${Math.round(track.volume * 100)}%`}
            className="w-full h-1 bg-slate-800 rounded cursor-pointer"
          />
          <span className="text-[9px] font-mono text-slate-400 w-7 text-right">
            {Math.round(track.volume * 100)}%
          </span>
        </div>
      </div>

      {/* Row 3: Pan Slider & Automation Mode Selector */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 gap-1">
        <div className="flex items-center gap-1">
          <span className="font-mono text-[9px] text-slate-500">PAN</span>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={track.pan}
            onChange={(e) => {
              e.stopPropagation();
              onUpdateTrack(track.id, { pan: parseFloat(e.target.value) });
            }}
            title={`Pan: ${track.pan === 0 ? 'Center' : track.pan < 0 ? `${Math.round(Math.abs(track.pan) * 100)}% L` : `${Math.round(track.pan * 100)}% R`}`}
            className="w-14 h-1 bg-slate-800 rounded cursor-pointer"
          />
        </div>

        {/* Automation Mode Selector */}
        <div className="flex items-center gap-0.5 bg-[#0b0e15] p-0.5 rounded border border-[#1e2535]">
          {(['none', 'volume', 'pan'] as AutomationType[]).map((mode) => (
            <button
              key={mode}
              onClick={(e) => {
                e.stopPropagation();
                onUpdateTrack(track.id, { automationMode: mode });
              }}
              title={`Automation Lane: ${mode === 'none' ? 'Waveform Only' : mode === 'volume' ? 'Volume Curve Lane' : 'Pan Curve Lane'}`}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${
                (track.automationMode || 'none') === mode
                  ? mode === 'volume'
                    ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700/80'
                    : mode === 'pan'
                    ? 'bg-violet-950 text-violet-300 font-bold border border-violet-700/80'
                    : 'bg-slate-800 text-slate-200 font-bold'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {mode === 'none' ? 'WAV' : mode === 'volume' ? 'VOL' : 'PAN'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
