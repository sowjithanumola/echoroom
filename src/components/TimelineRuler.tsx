import React, { useRef } from 'react';
import { Project } from '../types/daw';

interface TimelineRulerProps {
  project: Project;
  zoom: number; // px per second
  playheadSeconds: number;
  onSeek: (seconds: number) => void;
  onSetLoopRegion: (startBar: number, endBar: number) => void;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  project,
  zoom,
  playheadSeconds,
  onSeek,
  onSetLoopRegion,
}) => {
  const rulerRef = useRef<HTMLDivElement | null>(null);

  const secondsPerBeat = 60 / project.bpm;
  const beatsPerBar = project.timeSignature[0] || 4;
  const barSeconds = beatsPerBar * secondsPerBeat;
  const barPx = barSeconds * zoom;

  const totalBars = project.durationBars || 32;
  const totalWidthPx = totalBars * barPx;

  const loopStartPx = project.loopStartBar * barPx;
  const loopEndPx = project.loopEndBar * barPx;
  const loopWidthPx = Math.max(0, loopEndPx - loopStartPx);

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const seekSec = Math.max(0, clickX / zoom);
    onSeek(seekSec);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.clientX - rect.left;
      onSeek(Math.max(0, currentX / zoom));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const barsArray = Array.from({ length: totalBars }, (_, i) => i);

  return (
    <div
      ref={rulerRef}
      onMouseDown={handleRulerMouseDown}
      style={{ width: `${totalWidthPx}px` }}
      className="h-8 bg-[#10141d] border-b border-[#21293a] relative cursor-pointer select-none text-[10px] font-mono text-slate-400"
    >
      {/* Loop Region Highlight */}
      {project.loopEnabled && loopWidthPx > 0 && (
        <div
          style={{
            left: `${loopStartPx}px`,
            width: `${loopWidthPx}px`,
          }}
          className="absolute top-0 bottom-0 bg-cyan-500/15 border-x-2 border-cyan-400 pointer-events-none z-10"
        >
          <div className="absolute top-0 left-0 bg-cyan-500 text-slate-950 font-bold px-1 text-[9px] rounded-br">
            L
          </div>
          <div className="absolute top-0 right-0 bg-cyan-500 text-slate-950 font-bold px-1 text-[9px] rounded-bl">
            R
          </div>
        </div>
      )}

      {/* Bar markers and beat ticks */}
      {barsArray.map((barIndex) => {
        const left = barIndex * barPx;
        return (
          <div
            key={barIndex}
            style={{ left: `${left}px`, width: `${barPx}px` }}
            className="absolute top-0 bottom-0 border-l border-[#252f44] flex flex-col justify-between"
          >
            <div className="pl-1 pt-1 font-semibold text-slate-300">
              {barIndex + 1}
            </div>

            {/* Sub-beat ticks */}
            <div className="flex h-2 w-full justify-between px-0.5">
              {Array.from({ length: beatsPerBar }).map((_, beatIdx) => (
                <div
                  key={beatIdx}
                  className={`w-px bg-[#2d3850] ${beatIdx === 0 ? 'h-full bg-slate-400' : 'h-1.5'}`}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Playhead marker in ruler */}
      <div
        style={{ left: `${playheadSeconds * zoom}px` }}
        className="absolute top-0 bottom-0 w-0 z-20 pointer-events-none"
      >
        <div className="-ml-2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-cyan-400 drop-shadow" />
      </div>
    </div>
  );
};
