/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Project, Track, Clip, TrackType, AutomationPoint } from './types/daw';
import { audioEngine } from './audio/AudioEngine';
import { extractPeaks } from './audio/waveforms';
import {
  createDemoProject,
  saveProjectToDB,
  loadProjectFromDB,
  saveAudioBufferToDB,
  loadAudioBufferFromDB,
} from './storage/db';
import { TransportBar } from './components/TransportBar';
import { Timeline } from './components/Timeline';
import { BeatLab } from './components/BeatLab';
import { SynthStudio } from './components/SynthStudio';
import { RecordingBooth } from './components/RecordingBooth';
import { MixerPanel } from './components/MixerPanel';
import { EffectsDrawer } from './components/EffectsDrawer';
import { ExportModal } from './components/ExportModal';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { ImportAudioModal } from './components/ImportAudioModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { RecordedTake } from './audio/recorder';

const TRACK_COLORS = ['#06b6d4', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [zoom, setZoom] = useState(50); // pixels per second
  const [snapGrid, setSnapGrid] = useState('1/16');

  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Modals & Panels
  const [isBeatLabOpen, setIsBeatLabOpen] = useState(false);
  const [isSynthStudioOpen, setIsSynthStudioOpen] = useState(false);
  const [isRecordBoothOpen, setIsRecordBoothOpen] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [fxTrackId, setFxTrackId] = useState<string | null>(null);

  // Undo / Redo
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Keep a ref to current project for keyboard handlers and callbacks
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  // Track playhead update from audio engine
  useEffect(() => {
    audioEngine.setOnPlayheadUpdate((sec) => {
      setPlayheadSeconds(sec);
    });
  }, []);

  // Initialize Project on startup
  useEffect(() => {
    const initApp = async () => {
      try {
        // Try to load demo or create fresh
        const { project: demoProj, buffers } = await createDemoProject();
        for (const [id, buf] of buffers.entries()) {
          audioEngine.setBuffer(id, buf);
          await saveAudioBufferToDB(id, id, buf);
        }
        await saveProjectToDB(demoProj);
        setProject(demoProj);
        audioEngine.syncProjectGraph(demoProj);
      } catch (err) {
        console.error('Failed to initialize demo project:', err);
      }
    };

    initApp();
  }, []);

  // Sync project graph when parameters change
  useEffect(() => {
    if (project) {
      audioEngine.syncProjectGraph(project);
    }
  }, [project]);

  // Push state to Undo stack before mutation
  const pushUndo = useCallback((current: Project) => {
    setUndoStack((prev) => [...prev.slice(-25), current]);
    setRedoStack([]);
    setHasUnsavedChanges(true);
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0 || !project) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, project]);
    setProject(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !project) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, project]);
    setProject(next);
  };

  // Playback handlers
  const handlePlayToggle = () => {
    if (!project) return;
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      audioEngine.play(project, playheadSeconds);
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
    setPlayheadSeconds(0);
  };

  const handleSeek = (seconds: number) => {
    if (!project) return;
    audioEngine.seek(seconds, project);
    setPlayheadSeconds(seconds);
  };

  const handleLoopToggle = () => {
    if (!project) return;
    pushUndo(project);
    setProject({ ...project, loopEnabled: !project.loopEnabled });
  };

  const handleSetLoopRegion = (startBar: number, endBar: number) => {
    if (!project) return;
    pushUndo(project);
    setProject({ ...project, loopStartBar: startBar, loopEndBar: endBar });
  };

  const handleBpmChange = (bpm: number) => {
    if (!project) return;
    pushUndo(project);
    setProject({ ...project, bpm });
  };

  const handleMasterVolumeChange = (vol: number) => {
    if (!project) return;
    setProject({ ...project, masterVolume: vol });
  };

  const handleMasterPanChange = (pan: number) => {
    if (!project) return;
    setProject({ ...project, masterPan: pan });
  };

  const handleRenameProject = (name: string) => {
    if (!project) return;
    pushUndo(project);
    setProject({ ...project, name });
  };

  const handleSaveProject = async () => {
    if (!project) return;
    await saveProjectToDB(project);
    setHasUnsavedChanges(false);
  };

  // Track manipulation
  const handleUpdateTrack = (trackId: string, updates: Partial<Track>) => {
    if (!project) return;
    const newTracks = project.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t));
    setProject({ ...project, tracks: newTracks });
  };

  const handleDeleteTrack = (trackId: string) => {
    if (!project) return;
    pushUndo(project);
    const newTracks = project.tracks.filter((t) => t.id !== trackId);
    setProject({ ...project, tracks: newTracks });
    if (selectedTrackId === trackId) setSelectedTrackId(null);
  };

  const handleAddTrack = (type: TrackType) => {
    if (!project) return;
    pushUndo(project);

    const color = TRACK_COLORS[project.tracks.length % TRACK_COLORS.length];
    const trackNames: Record<TrackType, string> = {
      audio: `Audio ${project.tracks.length + 1}`,
      synth: `Synth ${project.tracks.length + 1}`,
      drums: `Drums ${project.tracks.length + 1}`,
    };

    const newTrack: Track = {
      id: `track_${Date.now()}`,
      name: trackNames[type],
      type,
      color,
      volume: 1.0,
      pan: 0,
      muted: false,
      soloed: false,
      clips: [],
      effects: {
        eq: { low: 0, mid: 0, high: 0, midFreq: 1000 },
        delay: { time: 0.3, feedback: 0.25, mix: 0 },
        reverb: { decay: 2.0, mix: 0.1 },
      },
    };

    setProject({
      ...project,
      tracks: [...project.tracks, newTrack],
    });
    setSelectedTrackId(newTrack.id);
  };

  // Clip & Track selection
  const handleSelectClip = (clipId: string | null, isMulti = false) => {
    if (!clipId) {
      setSelectedClipIds([]);
      return;
    }
    if (isMulti) {
      setSelectedClipIds((prev) =>
        prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId]
      );
    } else {
      setSelectedClipIds([clipId]);
    }
  };

  // Reorder tracks by dragging track headers
  const handleReorderTracks = (sourceIndex: number, targetIndex: number) => {
    if (!project || sourceIndex === targetIndex) return;
    pushUndo(project);

    const newTracks = [...project.tracks];
    const [moved] = newTracks.splice(sourceIndex, 1);
    newTracks.splice(targetIndex, 0, moved);

    setProject({ ...project, tracks: newTracks });
  };

  // Clip manipulation (horizontal and cross-track moves)
  const handleMoveClips = (moves: { clipId: string; newTrackId: string; newStartSeconds: number }[]) => {
    if (!project || moves.length === 0) return;
    pushUndo(project);

    const moveMap = new Map(moves.map((m) => [m.clipId, m]));
    const movedClips: Clip[] = [];

    // Collect all moving clips with updated start time and trackId
    project.tracks.forEach((t) => {
      t.clips.forEach((c) => {
        if (moveMap.has(c.id)) {
          const move = moveMap.get(c.id)!;
          movedClips.push({
            ...c,
            trackId: move.newTrackId,
            startSeconds: move.newStartSeconds,
          });
        }
      });
    });

    const newTracks = project.tracks.map((track) => {
      const remainingClips = track.clips.filter((c) => !moveMap.has(c.id));
      const incomingClips = movedClips.filter((c) => c.trackId === track.id);
      return {
        ...track,
        clips: [...remainingClips, ...incomingClips],
      };
    });

    setProject({ ...project, tracks: newTracks });
  };

  const handleResizeClipLeft = (
    clipId: string,
    newStart: number,
    newOffset: number,
    newDuration: number
  ) => {
    if (!project) return;
    const newTracks = project.tracks.map((track) => {
      const clipExists = track.clips.some((c) => c.id === clipId);
      if (!clipExists) return track;
      return {
        ...track,
        clips: track.clips.map((c) =>
          c.id === clipId
            ? { ...c, startSeconds: newStart, offsetSeconds: newOffset, durationSeconds: newDuration }
            : c
        ),
      };
    });
    setProject({ ...project, tracks: newTracks });
  };

  const handleResizeClipRight = (clipId: string, newDuration: number) => {
    if (!project) return;
    const newTracks = project.tracks.map((track) => {
      const clipExists = track.clips.some((c) => c.id === clipId);
      if (!clipExists) return track;
      return {
        ...track,
        clips: track.clips.map((c) => (c.id === clipId ? { ...c, durationSeconds: newDuration } : c)),
      };
    });
    setProject({ ...project, tracks: newTracks });
  };

  const handleSplitClip = (clipId: string, splitPositionSeconds: number) => {
    if (!project) return;
    pushUndo(project);

    const newTracks = project.tracks.map((track) => {
      const clip = track.clips.find((c) => c.id === clipId);
      if (!clip) return track;

      const offsetIntoClip = splitPositionSeconds - clip.startSeconds;
      if (offsetIntoClip <= 0.05 || offsetIntoClip >= clip.durationSeconds - 0.05) {
        return track;
      }

      // First half
      const partA: Clip = {
        ...clip,
        durationSeconds: offsetIntoClip,
      };

      // Second half
      const partB: Clip = {
        ...clip,
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${clip.name} (Split)`,
        startSeconds: splitPositionSeconds,
        offsetSeconds: (clip.offsetSeconds || 0) + offsetIntoClip,
        durationSeconds: clip.durationSeconds - offsetIntoClip,
      };

      const filtered = track.clips.filter((c) => c.id !== clipId);
      return {
        ...track,
        clips: [...filtered, partA, partB],
      };
    });

    setProject({ ...project, tracks: newTracks });
  };

  const handleDuplicateClips = (clipIds: string[]) => {
    if (!project || clipIds.length === 0) return;
    pushUndo(project);

    const newClipIds: string[] = [];
    const newTracks = project.tracks.map((track) => {
      const targetClips = track.clips.filter((c) => clipIds.includes(c.id));
      if (targetClips.length === 0) return track;

      const dupes = targetClips.map((clip) => {
        const newId = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        newClipIds.push(newId);
        return {
          ...clip,
          id: newId,
          name: `${clip.name} (Copy)`,
          startSeconds: clip.startSeconds + clip.durationSeconds,
        };
      });

      return {
        ...track,
        clips: [...track.clips, ...dupes],
      };
    });

    setProject({ ...project, tracks: newTracks });
    setSelectedClipIds(newClipIds);
  };

  const handleDeleteClips = (clipIds: string[]) => {
    if (!project || clipIds.length === 0) return;
    pushUndo(project);

    const newTracks = project.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((c) => !clipIds.includes(c.id)),
    }));

    setProject({ ...project, tracks: newTracks });
    setSelectedClipIds([]);
  };

  const handleClipVolumeChange = (clipId: string, vol: number) => {
    if (!project) return;
    const newTracks = project.tracks.map((track) => {
      const clipExists = track.clips.some((c) => c.id === clipId);
      if (!clipExists) return track;
      return {
        ...track,
        clips: track.clips.map((c) => (c.id === clipId ? { ...c, volume: vol } : c)),
      };
    });
    setProject({ ...project, tracks: newTracks });
  };

  const handleUpdateClipAutomation = (
    clipId: string,
    type: 'volume' | 'pan',
    points: AutomationPoint[]
  ) => {
    if (!project) return;
    const newTracks = project.tracks.map((track) => {
      const clipExists = track.clips.some((c) => c.id === clipId);
      if (!clipExists) return track;
      return {
        ...track,
        clips: track.clips.map((c) => {
          if (c.id !== clipId) return c;
          const currentAuto = c.automation || {};
          return {
            ...c,
            automation: {
              ...currentAuto,
              [type]: points,
            },
          };
        }),
      };
    });
    setProject({ ...project, tracks: newTracks });
    setHasUnsavedChanges(true);
  };

  // Dropping an imported audio sample from Media Browser onto timeline track
  const handleBufferDropOnTrack = (
    trackId: string,
    bufferId: string,
    clipName: string,
    duration: number,
    atSeconds: number
  ) => {
    if (!project) return;
    pushUndo(project);

    const buffer = audioEngine.getBuffer(bufferId);
    const peaks = buffer ? extractPeaks(buffer, 120) : [];

    const newClip: Clip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: clipName,
      trackId,
      startSeconds: atSeconds,
      durationSeconds: duration,
      offsetSeconds: 0,
      bufferId,
      volume: 1.0,
      peaks,
    };

    const newTracks = project.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
    );

    setProject({ ...project, tracks: newTracks });
    setSelectedClipIds([newClip.id]);
  };

  // Audio File Drag-and-Drop or upload onto track
  const handleFileDropOnTrack = async (trackId: string, file: File, atSeconds?: number) => {
    if (!project) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bufferId = `buf_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const decodedBuffer = await audioEngine.decodeAudio(bufferId, arrayBuffer);
      const peaks = extractPeaks(decodedBuffer, 140);

      await saveAudioBufferToDB(bufferId, file.name, decodedBuffer);

      pushUndo(project);

      const newClip: Clip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        trackId,
        startSeconds: atSeconds !== undefined ? atSeconds : playheadSeconds,
        durationSeconds: decodedBuffer.duration,
        offsetSeconds: 0,
        bufferId,
        volume: 1.0,
        peaks,
      };

      const newTracks = project.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
      );

      setProject({ ...project, tracks: newTracks });
      setSelectedClipIds([newClip.id]);
    } catch (err) {
      console.error('Failed to import audio file:', err);
      alert(`Could not decode "${file.name}". Please ensure it is a valid WAV, MP3, or OGG file.`);
    }
  };

  // Insert generated Drum / Synth clip from Studio tools
  const handleInsertGeneratedClip = async (
    buffer: AudioBuffer,
    clipName: string,
    durationSec: number,
    peaks: number[]
  ) => {
    if (!project) return;

    const bufferId = `buf_${Date.now()}`;
    audioEngine.setBuffer(bufferId, buffer);
    await saveAudioBufferToDB(bufferId, clipName, buffer);

    pushUndo(project);

    // Find suitable track: selected track or first matching type or first track
    let targetTrack = project.tracks.find((t) => t.id === selectedTrackId);
    if (!targetTrack && project.tracks.length > 0) {
      targetTrack = project.tracks[0];
    }

    if (!targetTrack) {
      // Add a track if none exists
      handleAddTrack('audio');
      return;
    }

    const newClip: Clip = {
      id: `clip_${Date.now()}`,
      name: clipName,
      trackId: targetTrack.id,
      startSeconds: playheadSeconds,
      durationSeconds: durationSec,
      offsetSeconds: 0,
      bufferId,
      volume: 1.0,
      peaks,
    };

    const newTracks = project.tracks.map((t) =>
      t.id === targetTrack!.id ? { ...t, clips: [...t.clips, newClip] } : t
    );

    setProject({ ...project, tracks: newTracks });
    setSelectedClipIds([newClip.id]);
  };

  // Insert Mic Recording Take
  const handleInsertRecordedTake = async (take: RecordedTake, targetTrackId: string) => {
    if (!project) return;

    audioEngine.setBuffer(take.id, take.buffer);
    await saveAudioBufferToDB(take.id, take.name, take.buffer);

    pushUndo(project);

    const newClip: Clip = {
      id: `clip_${Date.now()}`,
      name: take.name,
      trackId: targetTrackId,
      startSeconds: playheadSeconds,
      durationSeconds: take.duration,
      offsetSeconds: 0,
      bufferId: take.id,
      volume: 1.0,
      peaks: take.peaks,
    };

    const newTracks = project.tracks.map((t) =>
      t.id === targetTrackId ? { ...t, clips: [...t.clips, newClip] } : t
    );

    setProject({ ...project, tracks: newTracks });
    setSelectedClipIds([newClip.id]);
  };

  // Project Management Actions
  const handleSelectProject = async (id: string) => {
    const loaded = await loadProjectFromDB(id);
    if (!loaded) return;

    // Load buffers for this project
    const ctx = audioEngine.initContext();
    for (const track of loaded.tracks) {
      for (const clip of track.clips) {
        if (!audioEngine.getBuffer(clip.bufferId)) {
          const buf = await loadAudioBufferFromDB(clip.bufferId, ctx);
          if (buf) {
            audioEngine.setBuffer(clip.bufferId, buf);
          }
        }
      }
    }

    setProject(loaded);
    audioEngine.syncProjectGraph(loaded);
    setHasUnsavedChanges(false);
  };

  const handleNewProject = () => {
    const freshProject: Project = {
      id: `proj_${Date.now()}`,
      name: 'Untitled Project',
      bpm: 120,
      timeSignature: [4, 4],
      durationBars: 32,
      masterVolume: 1.0,
      masterPan: 0,
      loopEnabled: true,
      loopStartBar: 0,
      loopEndBar: 8,
      updatedAt: Date.now(),
      tracks: [
        {
          id: 'track_1',
          name: 'Drums',
          type: 'drums',
          color: '#06b6d4',
          volume: 1.0,
          pan: 0,
          muted: false,
          soloed: false,
          clips: [],
          effects: {
            eq: { low: 0, mid: 0, high: 0 },
            delay: { time: 0.3, feedback: 0.2, mix: 0 },
            reverb: { decay: 1.8, mix: 0.05 },
          },
        },
        {
          id: 'track_2',
          name: 'Synth Lead',
          type: 'synth',
          color: '#8b5cf6',
          volume: 0.9,
          pan: 0,
          muted: false,
          soloed: false,
          clips: [],
          effects: {
            eq: { low: 0, mid: 0, high: 0 },
            delay: { time: 0.35, feedback: 0.3, mix: 0.1 },
            reverb: { decay: 2.2, mix: 0.15 },
          },
        },
        {
          id: 'track_3',
          name: 'Audio Vocal',
          type: 'audio',
          color: '#10b981',
          volume: 0.95,
          pan: 0,
          muted: false,
          soloed: false,
          clips: [],
          effects: {
            eq: { low: -1, mid: 1, high: 2 },
            delay: { time: 0.25, feedback: 0.2, mix: 0.1 },
            reverb: { decay: 2.5, mix: 0.2 },
          },
        },
      ],
    };

    setProject(freshProject);
    audioEngine.syncProjectGraph(freshProject);
    saveProjectToDB(freshProject);
    setHasUnsavedChanges(false);
  };

  const handleLoadDemo = async () => {
    const { project: demoProj, buffers } = await createDemoProject();
    for (const [id, buf] of buffers.entries()) {
      audioEngine.setBuffer(id, buf);
      await saveAudioBufferToDB(id, id, buf);
    }
    await saveProjectToDB(demoProj);
    setProject(demoProj);
    audioEngine.syncProjectGraph(demoProj);
    setHasUnsavedChanges(false);
  };

  const handleExportProjectJSON = () => {
    if (!project) return;
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.echoroom.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProjectJSON = async (file: File) => {
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as Project;
      if (!imported.tracks || !imported.bpm) {
        throw new Error('Invalid project structure');
      }

      imported.id = `proj_${Date.now()}`;
      imported.updatedAt = Date.now();

      await saveProjectToDB(imported);
      setProject(imported);
      audioEngine.syncProjectGraph(imported);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to parse project JSON:', err);
      alert('Invalid ECHOROOM project JSON file.');
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when focusing text inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayToggle();
        return;
      }

      // Home: return playhead to start (0:00)
      if (e.key === 'Home') {
        e.preventDefault();
        handleSeek(0);
        return;
      }

      // +/-: Zoom timeline
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom((z) => Math.min(200, Math.round(z * 1.25)));
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => Math.max(15, Math.round(z / 1.25)));
        return;
      }

      // ? or Shift+/ : Open Shortcuts dialog
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }

      // Delete / Backspace: delete selected clips
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipIds.length > 0) {
          e.preventDefault();
          handleDeleteClips(selectedClipIds);
        }
        return;
      }

      // S key: Split selected clip(s) at playhead
      if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey && selectedClipIds.length > 0) {
          e.preventDefault();
          selectedClipIds.forEach((cId) => handleSplitClip(cId, playheadSeconds));
          return;
        }
      }

      // Ctrl/Cmd+D: Duplicate selected clips
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (selectedClipIds.length > 0) {
          e.preventDefault();
          handleDuplicateClips(selectedClipIds);
          return;
        }
      }

      // Ctrl/Cmd+O: Open Import Audio dialog
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setIsImportModalOpen(true);
        return;
      }

      // Ctrl/Cmd+S: Save
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveProject();
        return;
      }

      // Ctrl/Cmd+Z: Undo / Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Escape: Close all modals & clear selection
      if (e.key === 'Escape') {
        setIsBeatLabOpen(false);
        setIsSynthStudioOpen(false);
        setIsRecordBoothOpen(false);
        setIsExportModalOpen(false);
        setIsProjectManagerOpen(false);
        setIsImportModalOpen(false);
        setIsShortcutsOpen(false);
        setFxTrackId(null);
        setSelectedClipIds([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, selectedClipIds, playheadSeconds, undoStack, redoStack, project]);

  if (!project) {
    return (
      <div className="h-screen w-screen bg-[#0b0d12] text-slate-300 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-semibold tracking-wide">Loading ECHOROOM Engine...</span>
      </div>
    );
  }

  const fxTrack = project.tracks.find((t) => t.id === fxTrackId) || null;
  const targetTrack = project.tracks.find((t) => t.id === selectedTrackId) || project.tracks[0];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0d12] text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Transport Bar */}
      <TransportBar
        project={project}
        isPlaying={isPlaying}
        playheadSeconds={playheadSeconds}
        zoom={zoom}
        snapGrid={snapGrid}
        onPlayToggle={handlePlayToggle}
        onStop={handleStop}
        onLoopToggle={handleLoopToggle}
        onBpmChange={handleBpmChange}
        onZoomChange={setZoom}
        onSnapGridChange={setSnapGrid}
        onMasterVolumeChange={handleMasterVolumeChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onOpenBeatLab={() => setIsBeatLabOpen(true)}
        onOpenSynthStudio={() => setIsSynthStudioOpen(true)}
        onOpenRecordBooth={() => setIsRecordBoothOpen(true)}
        onToggleMixer={() => setIsMixerOpen(!isMixerOpen)}
        isMixerOpen={isMixerOpen}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenProjectManager={() => setIsProjectManagerOpen(true)}
        onSaveProject={handleSaveProject}
        hasUnsavedChanges={hasUnsavedChanges}
        onRenameProject={handleRenameProject}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Main Multitrack Timeline */}
      <Timeline
        project={project}
        zoom={zoom}
        playheadSeconds={playheadSeconds}
        snapGrid={snapGrid}
        selectedClipIds={selectedClipIds}
        selectedTrackId={selectedTrackId}
        onSelectClip={handleSelectClip}
        onSelectTrack={setSelectedTrackId}
        onSeek={handleSeek}
        onSetLoopRegion={handleSetLoopRegion}
        onUpdateTrack={handleUpdateTrack}
        onDeleteTrack={handleDeleteTrack}
        onAddTrack={handleAddTrack}
        onReorderTracks={handleReorderTracks}
        onOpenFX={(id) => setFxTrackId(id)}
        onMoveClips={handleMoveClips}
        onResizeClipLeft={handleResizeClipLeft}
        onResizeClipRight={handleResizeClipRight}
        onSplitClip={handleSplitClip}
        onDuplicateClips={handleDuplicateClips}
        onDeleteClips={handleDeleteClips}
        onClipVolumeChange={handleClipVolumeChange}
        onFileDropOnTrack={handleFileDropOnTrack}
        onBufferDropOnTrack={handleBufferDropOnTrack}
        onUpdateClipAutomation={handleUpdateClipAutomation}
      />

      {/* Bottom Mixer Console (toggleable) */}
      <MixerPanel
        isOpen={isMixerOpen}
        onClose={() => setIsMixerOpen(false)}
        project={project}
        onUpdateTrack={handleUpdateTrack}
        onUpdateMasterVolume={handleMasterVolumeChange}
        onUpdateMasterPan={handleMasterPanChange}
      />

      {/* Beat Lab Modal */}
      <BeatLab
        isOpen={isBeatLabOpen}
        onClose={() => setIsBeatLabOpen(false)}
        bpm={project.bpm}
        onInsertClipToTimeline={handleInsertGeneratedClip}
      />

      {/* Synth Studio Modal */}
      <SynthStudio
        isOpen={isSynthStudioOpen}
        onClose={() => setIsSynthStudioOpen(false)}
        bpm={project.bpm}
        onInsertClipToTimeline={handleInsertGeneratedClip}
      />

      {/* Recording Booth Modal */}
      <RecordingBooth
        isOpen={isRecordBoothOpen}
        onClose={() => setIsRecordBoothOpen(false)}
        tracks={project.tracks}
        onInsertTakeToTrack={handleInsertRecordedTake}
      />

      {/* Effects Rack Drawer */}
      <EffectsDrawer
        track={fxTrack}
        isOpen={fxTrackId !== null}
        onClose={() => setFxTrackId(null)}
        onUpdateTrack={handleUpdateTrack}
      />

      {/* Render & Export WAV Modal */}
      <ExportModal
        project={project}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />

      {/* Project Library Modal */}
      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        currentProjectId={project.id}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onLoadDemo={handleLoadDemo}
        onExportProjectJSON={handleExportProjectJSON}
        onImportProjectJSON={handleImportProjectJSON}
      />

      {/* Audio Import & Media Pool Modal */}
      <ImportAudioModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onInsertClipToTimeline={handleInsertGeneratedClip}
        targetTrackName={targetTrack?.name}
      />

      {/* Keyboard Shortcuts Dialog */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}
