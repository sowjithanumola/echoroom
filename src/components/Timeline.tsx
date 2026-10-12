import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Project, Track, Clip, TrackType, AutomationPoint, AutomationType } from '../types/daw';
import { TrackHeader } from './TrackHeader';
import { TimelineRuler } from './TimelineRuler';
import { TimelineClip } from './TimelineClip';

const TRACK_HEIGHT = 112; // 28rem = 112px

interface DragState {
  initialPointerX: number;
  initialPointerY: number;
  initialStarts: Map<string, number>; // clipId -> original startSeconds
  initialTrackIds: Map<string, string>; // clipId -> original trackId
  primaryClipId: string;
  primaryTrackIndex: number;
  currentDeltaSeconds: number;
  currentTargetTrackId: string;
  targetTrackIndex: number;
}

interface TimelineProps {
  project: Project;
  zoom: number; // px per second
  playheadSeconds: number;
  snapGrid: string;
  selectedClipIds: string[];
  selectedTrackId: string | null;
  onSelectClip: (clipId: string | null, isMulti?: boolean) => void;
  onSelectTrack: (trackId: string | null) => void;
  onSeek: (seconds: number) => void;
  onSetLoopRegion: (startBar: number, endBar: number) => void;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  onDeleteTrack: (trackId: string) => void;
  onAddTrack: (type: TrackType) => void;
  onReorderTracks: (sourceIndex: number, targetIndex: number) => void;
  onOpenFX: (trackId: string) => void;
  onMoveClips: (moves: { clipId: string; newTrackId: string; newStartSeconds: number }[]) => void;
  onResizeClipLeft: (clipId: string, newStart: number, newOffset: number, newDuration: number) => void;
  onResizeClipRight: (clipId: string, newDuration: number) => void;
  onSplitClip: (clipId: string, splitPositionSeconds: number) => void;
  onDuplicateClips: (clipIds: string[]) => void;
  onDeleteClips: (clipIds: string[]) => void;
  onClipVolumeChange: (clipId: string, vol: number) => void;
  onFileDropOnTrack: (trackId: string, file: File, atSeconds?: number) => void;
  onBufferDropOnTrack: (
    trackId: string,
    bufferId: string,
    clipName: string,
    duration: number,
    atSeconds: number
  ) => void;
  onUpdateClipAutomation?: (clipId: string, type: 'volume' | 'pan', points: AutomationPoint[]) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  project,
  zoom,
  playheadSeconds,
  snapGrid,
  selectedClipIds,
  selectedTrackId,
  onSelectClip,
  onSelectTrack,
  onSeek,
  onSetLoopRegion,
  onUpdateTrack,
  onDeleteTrack,
  onAddTrack,
  onReorderTracks,
  onOpenFX,
  onMoveClips,
  onResizeClipLeft,
  onResizeClipRight,
  onSplitClip,
  onDuplicateClips,
  onDeleteClips,
  onClipVolumeChange,
  onFileDropOnTrack,
  onBufferDropOnTrack,
  onUpdateClipAutomation,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const trackHeadersContainerRef = useRef<HTMLDivElement | null>(null);
  const lanesContainerRef = useRef<HTMLDivElement | null>(null);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [externalDragOverTrackId, setExternalDragOverTrackId] = useState<string | null>(null);
  const [externalDragOverSeconds, setExternalDragOverSeconds] = useState<number>(0);

  const secondsPerBeat = 60 / project.bpm;
  const beatsPerBar = project.timeSignature[0] || 4;
  const barSeconds = beatsPerBar * secondsPerBeat;
  const barPx = barSeconds * zoom;
  const totalWidthPx = (project.durationBars || 32) * barPx;

  // Calculate snap resolution in seconds
  let snapStepSeconds = 0;
  if (snapGrid === '1/16') snapStepSeconds = secondsPerBeat / 4;
  else if (snapGrid === '1/8') snapStepSeconds = secondsPerBeat / 2;
  else if (snapGrid === '1/4') snapStepSeconds = secondsPerBeat;
  else if (snapGrid === '1/2') snapStepSeconds = secondsPerBeat * 2;
  else if (snapGrid === '1bar') snapStepSeconds = barSeconds;

  // Synchronize vertical scroll between timeline lanes and track headers
  const handleTimelineScroll = () => {
    if (scrollContainerRef.current && trackHeadersContainerRef.current) {
      trackHeadersContainerRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    }
  };

  const handleHeadersScroll = () => {
    if (scrollContainerRef.current && trackHeadersContainerRef.current) {
      scrollContainerRef.current.scrollTop = trackHeadersContainerRef.current.scrollTop;
    }
  };

  // Auto-scroll timeline to follow playhead if it goes off-screen during playback
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const playheadPx = playheadSeconds * zoom;
    const scrollLeft = container.scrollLeft;
    const clientWidth = container.clientWidth;

    if (playheadPx > scrollLeft + clientWidth - 40) {
      container.scrollLeft = playheadPx - 80;
    }
  }, [playheadSeconds, zoom]);

  // Handle clicking empty area in track lane to seek and set selection
  const handleTrackLaneClick = (e: React.MouseEvent, trackId: string) => {
    // Only deselect if clicked directly on lane, not on a clip
    if ((e.target as HTMLElement).closest('.group\\/clip')) return;

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      onSelectClip(null);
    }
    onSelectTrack(trackId);

    const laneRect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - laneRect.left;
    onSeek(Math.max(0, clickX / zoom));
  };

  // Start clip drag operation (horizontal and vertical)
  const handleStartDragClip = useCallback(
    (clipId: string, e: React.PointerEvent) => {
      if (!lanesContainerRef.current) return;

      // Find all clips to drag: if clicked clip is already part of selection, drag all selected clips
      const clipsToDragIds = selectedClipIds.includes(clipId) ? selectedClipIds : [clipId];

      const initialStarts = new Map<string, number>();
      const initialTrackIds = new Map<string, string>();
      let primaryTrackIdx = 0;

      project.tracks.forEach((t, tIdx) => {
        t.clips.forEach((c) => {
          if (clipsToDragIds.includes(c.id)) {
            initialStarts.set(c.id, c.startSeconds);
            initialTrackIds.set(c.id, t.id);
            if (c.id === clipId) {
              primaryTrackIdx = tIdx;
            }
          }
        });
      });

      const initialTrackId = initialTrackIds.get(clipId) || project.tracks[0]?.id || '';

      const newDragState: DragState = {
        initialPointerX: e.clientX,
        initialPointerY: e.clientY,
        initialStarts,
        initialTrackIds,
        primaryClipId: clipId,
        primaryTrackIndex: primaryTrackIdx,
        currentDeltaSeconds: 0,
        currentTargetTrackId: initialTrackId,
        targetTrackIndex: primaryTrackIdx,
      };

      setDragState(newDragState);

      const targetEl = e.currentTarget as HTMLElement;
      try {
        targetEl.setPointerCapture(e.pointerId);
      } catch {}

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - newDragState.initialPointerX;
        let deltaSec = deltaX / zoom;

        // Modifier key (Shift or Alt) disables snapping for micro-timing
        const freeSnap = moveEvent.shiftKey || moveEvent.altKey;
        if (snapStepSeconds > 0 && !freeSnap) {
          const originalStart = initialStarts.get(clipId) || 0;
          const tentativeStart = Math.max(0, originalStart + deltaSec);
          const snappedStart = Math.round(tentativeStart / snapStepSeconds) * snapStepSeconds;
          deltaSec = snappedStart - originalStart;
        }

        // Clamp so no clip goes below 0s
        let minStart = Infinity;
        for (const origStart of initialStarts.values()) {
          if (origStart < minStart) minStart = origStart;
        }
        if (minStart + deltaSec < 0) {
          deltaSec = -minStart;
        }

        // Vertical track movement calculation
        const deltaY = moveEvent.clientY - newDragState.initialPointerY;
        const trackDelta = Math.round(deltaY / TRACK_HEIGHT);
        const newTargetIndex = Math.max(
          0,
          Math.min(project.tracks.length - 1, newDragState.primaryTrackIndex + trackDelta)
        );
        const targetTrack = project.tracks[newTargetIndex];

        setDragState((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            currentDeltaSeconds: deltaSec,
            currentTargetTrackId: targetTrack?.id || prev.currentTargetTrackId,
            targetTrackIndex: newTargetIndex,
          };
        });
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        try {
          targetEl.releasePointerCapture(upEvent.pointerId);
        } catch {}

        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        setDragState((current) => {
          if (!current) return null;

          const trackDelta = current.targetTrackIndex - current.primaryTrackIndex;
          const moves: { clipId: string; newTrackId: string; newStartSeconds: number }[] = [];

          current.initialStarts.forEach((origStart, cId) => {
            const origTrackId = current.initialTrackIds.get(cId);
            const origTrackIndex = project.tracks.findIndex((t) => t.id === origTrackId);
            const newTrackIndex = Math.max(
              0,
              Math.min(project.tracks.length - 1, origTrackIndex + trackDelta)
            );
            const targetTrack = project.tracks[newTrackIndex] || project.tracks[0];

            moves.push({
              clipId: cId,
              newTrackId: targetTrack.id,
              newStartSeconds: Math.max(0, origStart + current.currentDeltaSeconds),
            });
          });

          if (moves.length > 0) {
            onMoveClips(moves);
          }

          return null;
        });
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [project.tracks, selectedClipIds, zoom, snapStepSeconds, onMoveClips]
  );

  // Drag over timeline track for desktop files or media browser items
  const handleLaneDragOver = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    let sec = Math.max(0, offsetX / zoom);

    if (snapStepSeconds > 0 && !e.shiftKey && !e.altKey) {
      sec = Math.round(sec / snapStepSeconds) * snapStepSeconds;
    }

    setExternalDragOverTrackId(track.id);
    setExternalDragOverSeconds(sec);
  };

  const handleLaneDragLeave = () => {
    setExternalDragOverTrackId(null);
  };

  const handleLaneDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    e.stopPropagation();
    setExternalDragOverTrackId(null);

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    let atSeconds = Math.max(0, offsetX / zoom);
    if (snapStepSeconds > 0 && !e.shiftKey && !e.altKey) {
      atSeconds = Math.round(atSeconds / snapStepSeconds) * snapStepSeconds;
    }

    // 1. Check if dropped from Media Browser
    const bufferId = e.dataTransfer.getData('text/audio-buffer-id');
    const clipName = e.dataTransfer.getData('text/audio-name');
    const durationStr = e.dataTransfer.getData('text/audio-duration');

    if (bufferId && clipName) {
      const duration = parseFloat(durationStr) || 4;
      onBufferDropOnTrack(track.id, bufferId, clipName, duration, atSeconds);
      return;
    }

    // 2. Check if dropped directly from Desktop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        onFileDropOnTrack(track.id, file, atSeconds + i * 2);
      }
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0c0f16] select-none">
      {/* Left Column: Track Headers */}
      <div className="w-60 flex flex-col shrink-0 border-r border-[#1e2535] z-20 bg-[#121620]">
        {/* Top left corner blank area matching ruler height */}
        <div className="h-8 border-b border-[#21293a] px-3 flex items-center justify-between text-[11px] font-semibold text-slate-400 bg-[#10141d]">
          <span>TRACKS ({project.tracks.length})</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {selectedClipIds.length > 0 ? `${selectedClipIds.length} SELECTED` : 'IDLE'}
          </span>
        </div>

        {/* List of track headers - scroll synchronized */}
        <div
          ref={trackHeadersContainerRef}
          onScroll={handleHeadersScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
          {project.tracks.map((track, trackIdx) => (
            <TrackHeader
              key={track.id}
              track={track}
              trackIndex={trackIdx}
              isSelected={selectedTrackId === track.id}
              onSelect={onSelectTrack}
              onUpdateTrack={onUpdateTrack}
              onDeleteTrack={onDeleteTrack}
              onOpenFX={onOpenFX}
              onFileDrop={(tId, file) => onFileDropOnTrack(tId, file, playheadSeconds)}
              onReorderTrack={onReorderTracks}
            />
          ))}

          {/* Add Track Options */}
          <div className="p-3 flex flex-col gap-1.5 border-b border-[#1e2535]">
            <span className="text-[10px] text-slate-500 font-medium">ADD TRACK</span>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => onAddTrack('audio')}
                className="flex items-center justify-center gap-1 py-1.5 px-1 bg-[#1a2130] hover:bg-[#252f44] text-[10px] font-semibold text-emerald-400 rounded border border-[#2b364e] transition-colors"
              >
                <Plus className="w-3 h-3" /> Audio
              </button>
              <button
                onClick={() => onAddTrack('synth')}
                className="flex items-center justify-center gap-1 py-1.5 px-1 bg-[#1a2130] hover:bg-[#252f44] text-[10px] font-semibold text-violet-400 rounded border border-[#2b364e] transition-colors"
              >
                <Plus className="w-3 h-3" /> Synth
              </button>
              <button
                onClick={() => onAddTrack('drums')}
                className="flex items-center justify-center gap-1 py-1.5 px-1 bg-[#1a2130] hover:bg-[#252f44] text-[10px] font-semibold text-cyan-400 rounded border border-[#2b364e] transition-colors"
              >
                <Plus className="w-3 h-3" /> Drums
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Timeline Canvas & Scrollable Tracks */}
      <div
        ref={scrollContainerRef}
        onScroll={handleTimelineScroll}
        className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0a0d13]"
      >
        <div style={{ width: `${totalWidthPx}px` }} className="relative min-h-full">
          {/* Top Ruler */}
          <div className="sticky top-0 z-30">
            <TimelineRuler
              project={project}
              zoom={zoom}
              playheadSeconds={playheadSeconds}
              onSeek={onSeek}
              onSetLoopRegion={onSetLoopRegion}
            />
          </div>

          {/* Vertical Grid Background Lines */}
          <div className="absolute inset-0 top-8 pointer-events-none flex">
            {Array.from({ length: project.durationBars || 32 }).map((_, barIdx) => (
              <div
                key={barIdx}
                style={{ width: `${barPx}px` }}
                className="h-full border-r border-[#161c27] flex"
              >
                {Array.from({ length: beatsPerBar - 1 }).map((_, beatIdx) => (
                  <div
                    key={beatIdx}
                    style={{ width: `${barPx / beatsPerBar}px` }}
                    className="h-full border-r border-[#121620]/60"
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Playhead Vertical Line */}
          <div
            style={{ left: `${playheadSeconds * zoom}px` }}
            className="absolute top-8 bottom-0 w-px bg-cyan-400 z-20 pointer-events-none shadow-[0_0_8px_rgba(34,211,238,0.8)]"
          />

          {/* External File / Sample Drag-and-Drop Insertion Indicator */}
          {externalDragOverTrackId && (
            <div
              style={{
                left: `${externalDragOverSeconds * zoom}px`,
                top: `${
                  project.tracks.findIndex((t) => t.id === externalDragOverTrackId) * TRACK_HEIGHT
                }px`,
                height: `${TRACK_HEIGHT}px`,
              }}
              className="absolute w-24 bg-cyan-400/20 border-2 border-cyan-400 border-dashed rounded-md pointer-events-none z-30 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.5)]"
            >
              <span className="text-[10px] font-bold text-cyan-300 bg-slate-950/80 px-1.5 py-0.5 rounded">
                Drop Here
              </span>
            </div>
          )}

          {/* Track Lanes */}
          <div ref={lanesContainerRef} className="flex flex-col relative z-10">
            {project.tracks.map((track, trackIdx) => {
              const isDragTargetThisTrack =
                dragState && dragState.targetTrackIndex === trackIdx;

              return (
                <div
                  key={track.id}
                  onClick={(e) => handleTrackLaneClick(e, track.id)}
                  onDragOver={(e) => handleLaneDragOver(e, track)}
                  onDragLeave={handleLaneDragLeave}
                  onDrop={(e) => handleLaneDrop(e, track)}
                  style={{ height: `${TRACK_HEIGHT}px` }}
                  className={`border-b border-[#181e2b] relative group transition-colors ${
                    selectedTrackId === track.id ? 'bg-[#141a26]/40' : 'hover:bg-[#121622]/20'
                  } ${isDragTargetThisTrack ? 'bg-cyan-950/20 ring-1 ring-cyan-500/30' : ''}`}
                >
                  {/* Horizontal center guideline */}
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-[#181f2c]/40 pointer-events-none" />

                  {/* Audio Clips inside this track */}
                  {track.clips.map((clip) => {
                    const isSelected = selectedClipIds.includes(clip.id);
                    const isMultiSelected = selectedClipIds.length > 1 && isSelected;

                    // If currently dragging this clip, render ghost at projected position
                    const isBeingDragged = dragState && dragState.initialStarts.has(clip.id);
                    let renderedStart = clip.startSeconds;
                    let isProjectedToOtherTrack = false;

                    if (isBeingDragged) {
                      const trackDelta = dragState.targetTrackIndex - dragState.primaryTrackIndex;
                      const origTrackIdx = project.tracks.findIndex((t) => t.id === track.id);
                      const targetIdx = origTrackIdx + trackDelta;

                      if (targetIdx !== trackIdx) {
                        isProjectedToOtherTrack = true;
                      }
                      renderedStart = Math.max(
                        0,
                        (dragState.initialStarts.get(clip.id) || 0) + dragState.currentDeltaSeconds
                      );
                    }

                    if (isProjectedToOtherTrack) {
                      // Dim original position during cross-track move
                      return (
                        <div
                          key={clip.id}
                          style={{
                            left: `${clip.startSeconds * zoom}px`,
                            width: `${Math.max(16, clip.durationSeconds * zoom)}px`,
                          }}
                          className="absolute top-1 bottom-1 rounded-md border border-dashed border-slate-700 bg-slate-900/30 opacity-40 pointer-events-none"
                        />
                      );
                    }

                    return (
                      <TimelineClip
                        key={clip.id}
                        clip={{
                          ...clip,
                          startSeconds: renderedStart,
                        }}
                        trackColor={track.color}
                        zoom={zoom}
                        snapStepSeconds={snapStepSeconds}
                        isSelected={isSelected}
                        isMultiSelected={isMultiSelected}
                        playheadSeconds={playheadSeconds}
                        automationMode={track.automationMode || 'none'}
                        onSelect={(cId, isMulti) => onSelectClip(cId, isMulti)}
                        onStartDragClip={handleStartDragClip}
                        onResizeLeft={onResizeClipLeft}
                        onResizeRight={onResizeClipRight}
                        onSplit={onSplitClip}
                        onDuplicate={(cId) => onDuplicateClips([cId])}
                        onDelete={(cId) => onDeleteClips([cId])}
                        onVolumeChange={onClipVolumeChange}
                        onUpdateAutomation={onUpdateClipAutomation}
                        onToggleClipAutomationMode={(_cId, mode) =>
                          onUpdateTrack(track.id, { automationMode: mode })
                        }
                      />
                    );
                  })}

                  {/* Drag Insertion Ghost if clip being dragged into this track from another track */}
                  {dragState &&
                    dragState.targetTrackIndex === trackIdx &&
                    dragState.primaryTrackIndex !== trackIdx && (
                      <div
                        style={{
                          left: `${
                            Math.max(
                              0,
                              (dragState.initialStarts.get(dragState.primaryClipId) || 0) +
                                dragState.currentDeltaSeconds
                            ) * zoom
                          }px`,
                          width: `${80}px`,
                        }}
                        className="absolute top-1 bottom-1 bg-cyan-400/20 border-2 border-cyan-400 border-dashed rounded-md pointer-events-none z-30 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                      />
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
