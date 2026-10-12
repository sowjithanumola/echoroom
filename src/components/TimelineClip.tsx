import React, { useRef, useState, useEffect } from 'react';
import { Scissors, Copy, Trash2, Volume2, Activity, Radio } from 'lucide-react';
import { Clip, AutomationType, AutomationPoint } from '../types/daw';
import { AutomationLane } from './AutomationLane';

interface TimelineClipProps {
  clip: Clip;
  trackColor: string;
  zoom: number; // px per second
  snapStepSeconds: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  playheadSeconds: number;
  automationMode?: AutomationType;
  onSelect: (clipId: string, isMulti: boolean) => void;
  onStartDragClip?: (clipId: string, e: React.PointerEvent) => void;
  onResizeLeft: (clipId: string, newStartSeconds: number, newOffsetSeconds: number, newDuration: number) => void;
  onResizeRight: (clipId: string, newDuration: number) => void;
  onSplit: (clipId: string, splitPositionSeconds: number) => void;
  onDuplicate: (clipId: string) => void;
  onDelete: (clipId: string) => void;
  onVolumeChange: (clipId: string, vol: number) => void;
  onUpdateAutomation?: (clipId: string, type: 'volume' | 'pan', points: AutomationPoint[]) => void;
  onToggleClipAutomationMode?: (clipId: string, mode: AutomationType) => void;
}

export const TimelineClip: React.FC<TimelineClipProps> = ({
  clip,
  trackColor,
  zoom,
  snapStepSeconds,
  isSelected,
  isMultiSelected = false,
  playheadSeconds,
  onSelect,
  onStartDragClip,
  onResizeLeft,
  onResizeRight,
  onSplit,
  onDuplicate,
  onDelete,
  onVolumeChange,
  automationMode = 'none',
  onUpdateAutomation,
  onToggleClipAutomationMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);

  const [showVolumeMenu, setShowVolumeMenu] = useState(false);

  const leftPx = clip.startSeconds * zoom;
  const widthPx = Math.max(16, clip.durationSeconds * zoom);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(widthPx);
    const h = 70;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const peaks = clip.peaks || [];
    if (peaks.length === 0) {
      // Draw gentle fallback audio line
      ctx.strokeStyle = trackColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = trackColor;
    const centerY = h / 2;
    const barWidth = Math.max(2, Math.floor(w / 60));
    const step = w / peaks.length;

    for (let i = 0; i < peaks.length; i++) {
      const peakVal = peaks[i];
      const barHeight = Math.max(2, peakVal * (h * 0.42));
      const x = i * step;

      // Draw top and bottom mirrored peak bar
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
    }
  }, [widthPx, clip.peaks, trackColor]);

  // Handle Drag Move via Pointer Events
  const handlePointerDownMove = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(clip.id, e.shiftKey || e.metaKey || e.ctrlKey);
    onStartDragClip?.(clip.id, e);
  };

  // Handle Left Edge Trim Resize with Pointer Capture
  const handlePointerDownLeft = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(clip.id, e.shiftKey || e.metaKey || e.ctrlKey);

    const startX = e.clientX;
    const initialStart = clip.startSeconds;
    const initialOffset = clip.offsetSeconds || 0;
    const initialDuration = clip.durationSeconds;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let deltaSec = deltaX / zoom;

      // Holding Shift or Alt temporarily disables grid snapping
      const disableSnap = moveEvent.shiftKey || moveEvent.altKey;
      if (snapStepSeconds > 0 && !disableSnap) {
        deltaSec = Math.round(deltaSec / snapStepSeconds) * snapStepSeconds;
      }

      // Max shrink leaves at least 0.1s
      deltaSec = Math.min(deltaSec, initialDuration - 0.1);
      if (initialOffset + deltaSec < 0) {
        deltaSec = -initialOffset;
      }

      const newStart = Math.max(0, initialStart + deltaSec);
      const newOffset = initialOffset + deltaSec;
      const newDuration = initialDuration - deltaSec;

      onResizeLeft(clip.id, newStart, newOffset, newDuration);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Handle Right Edge Trim Resize with Pointer Capture
  const handlePointerDownRight = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(clip.id, e.shiftKey || e.metaKey || e.ctrlKey);

    const startX = e.clientX;
    const initialDuration = clip.durationSeconds;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let deltaSec = deltaX / zoom;

      const disableSnap = moveEvent.shiftKey || moveEvent.altKey;
      if (snapStepSeconds > 0 && !disableSnap) {
        deltaSec = Math.round(deltaSec / snapStepSeconds) * snapStepSeconds;
      }

      const newDuration = Math.max(0.1, initialDuration + deltaSec);
      onResizeRight(clip.id, newDuration);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };
  const canSplitAtPlayhead =
    playheadSeconds > clip.startSeconds + 0.05 &&
    playheadSeconds < clip.startSeconds + clip.durationSeconds - 0.05;

  return (
    <div
      ref={clipRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(clip.id, e.shiftKey || e.metaKey || e.ctrlKey);
      }}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        borderColor: isSelected || isMultiSelected ? '#38bdf8' : 'rgba(255,255,255,0.12)',
      }}
      className={`absolute top-1 bottom-1 rounded-md border overflow-hidden select-none cursor-grab active:cursor-grabbing group shadow-md transition-shadow ${
        isSelected || isMultiSelected
          ? 'ring-2 ring-cyan-400 shadow-cyan-900/50 z-20'
          : 'z-10 hover:border-slate-500/50'
      }`}
    >
      {/* Background tint based on track color */}
      <div
        style={{ backgroundColor: trackColor }}
        className="absolute inset-0 opacity-20 pointer-events-none"
      />
      <div className="absolute inset-0 bg-[#131924]/80 pointer-events-none" />

      {/* Top Header Label */}
      <div
        onPointerDown={handlePointerDownMove}
        className="h-5 px-2 bg-black/40 border-b border-white/10 flex items-center justify-between text-[10px] font-medium text-slate-200 relative z-10 cursor-move"
      >
        <div className="flex items-center gap-1.5 truncate">
          <span
            style={{ backgroundColor: trackColor }}
            className="w-1.5 h-1.5 rounded-full shrink-0"
          />
          <span className="truncate">{clip.name}</span>
        </div>

        {/* Quick Actions (visible on hover or when selected) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canSplitAtPlayhead && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSplit(clip.id, playheadSeconds);
              }}
              title="Split clip at playhead position (S)"
              className="p-0.5 hover:text-cyan-400 rounded hover:bg-slate-700/80"
            >
              <Scissors className="w-3 h-3" />
            </button>
          )}

          {/* Automation Mode Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const nextMode: AutomationType =
                automationMode === 'none' ? 'volume' : automationMode === 'volume' ? 'pan' : 'none';
              onToggleClipAutomationMode?.(clip.id, nextMode);
            }}
            title={`Automation Mode: ${automationMode.toUpperCase()} (Click to cycle None/Vol/Pan)`}
            className={`p-0.5 rounded flex items-center gap-0.5 px-1 text-[9px] font-mono transition-colors ${
              automationMode === 'volume'
                ? 'bg-cyan-950 text-cyan-400 border border-cyan-700'
                : automationMode === 'pan'
                ? 'bg-violet-950 text-violet-400 border border-violet-700'
                : 'hover:text-cyan-400 hover:bg-slate-700/80 text-slate-400'
            }`}
          >
            {automationMode === 'pan' ? (
              <Radio className="w-2.5 h-2.5" />
            ) : (
              <Activity className="w-2.5 h-2.5" />
            )}
            <span>{automationMode === 'none' ? 'Auto' : automationMode === 'volume' ? 'Vol' : 'Pan'}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(clip.id);
            }}
            title="Duplicate clip"
            className="p-0.5 hover:text-cyan-400 rounded hover:bg-slate-700/80"
          >
            <Copy className="w-3 h-3" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowVolumeMenu(!showVolumeMenu);
            }}
            title="Clip Gain"
            className="p-0.5 hover:text-cyan-400 rounded hover:bg-slate-700/80"
          >
            <Volume2 className="w-3 h-3" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(clip.id);
            }}
            title="Delete clip"
            className="p-0.5 hover:text-rose-400 rounded hover:bg-slate-700/80"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Volume Slider Flyout */}
      {showVolumeMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-6 right-2 z-30 p-2 bg-[#0d1117] border border-cyan-800 rounded-md shadow-xl flex items-center gap-2"
        >
          <span className="text-[10px] text-slate-400">Gain:</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={clip.volume ?? 1}
            onChange={(e) => onVolumeChange(clip.id, parseFloat(e.target.value))}
            className="w-20 h-1 bg-slate-700"
          />
          <span className="text-[10px] font-mono text-cyan-400 w-8">
            {Math.round((clip.volume ?? 1) * 100)}%
          </span>
        </div>
      )}

      {/* Waveform Canvas & Automation Lane */}
      <div
        onPointerDown={automationMode === 'none' ? handlePointerDownMove : undefined}
        className="w-full h-[calc(100%-20px)] flex items-center relative overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          style={{ width: `${widthPx}px`, height: '70px' }}
          className={`block w-full h-full pointer-events-none transition-opacity ${
            automationMode !== 'none' ? 'opacity-35' : 'opacity-100'
          }`}
        />

        {/* Visual Automation Lane Overlay */}
        {automationMode === 'volume' && onUpdateAutomation && (
          <AutomationLane
            type="volume"
            points={clip.automation?.volume}
            clipDuration={clip.durationSeconds}
            widthPx={widthPx}
            heightPx={70}
            onChange={(newPoints) => onUpdateAutomation(clip.id, 'volume', newPoints)}
          />
        )}

        {automationMode === 'pan' && onUpdateAutomation && (
          <AutomationLane
            type="pan"
            points={clip.automation?.pan}
            clipDuration={clip.durationSeconds}
            widthPx={widthPx}
            heightPx={70}
            onChange={(newPoints) => onUpdateAutomation(clip.id, 'pan', newPoints)}
          />
        )}
      </div>

      {/* Left Trim Handle */}
      <div
        onPointerDown={handlePointerDownLeft}
        title="Trim Start (Hold Shift/Alt for Free Snap)"
        className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-3 bg-cyan-400/20 hover:bg-cyan-400/60 cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
      >
        <div className="w-0.5 h-4 bg-white/70 rounded-full" />
      </div>

      {/* Right Trim Handle */}
      <div
        onPointerDown={handlePointerDownRight}
        title="Trim End (Hold Shift/Alt for Free Snap)"
        className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3 bg-cyan-400/20 hover:bg-cyan-400/60 cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
      >
        <div className="w-0.5 h-4 bg-white/70 rounded-full" />
      </div>
    </div>
  );
};
