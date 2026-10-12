import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  Repeat,
  RotateCcw,
  RotateCw,
  Download,
  FolderOpen,
  Mic,
  Sliders,
  Music,
  Piano,
  ZoomIn,
  ZoomOut,
  Save,
  Check,
  Upload,
  HelpCircle,
} from 'lucide-react';
import { Project } from '../types/daw';
import { audioEngine } from '../audio/AudioEngine';

interface TransportBarProps {
  project: Project;
  isPlaying: boolean;
  playheadSeconds: number;
  zoom: number; // pixels per second
  snapGrid: string;
  onPlayToggle: () => void;
  onStop: () => void;
  onLoopToggle: () => void;
  onBpmChange: (bpm: number) => void;
  onZoomChange: (zoom: number) => void;
  onSnapGridChange: (grid: string) => void;
  onMasterVolumeChange: (vol: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenBeatLab: () => void;
  onOpenSynthStudio: () => void;
  onOpenRecordBooth: () => void;
  onToggleMixer: () => void;
  isMixerOpen: boolean;
  onOpenExportModal: () => void;
  onOpenProjectManager: () => void;
  onSaveProject: () => void;
  hasUnsavedChanges: boolean;
  onRenameProject: (name: string) => void;
  onOpenImport: () => void;
  onOpenShortcuts: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  project,
  isPlaying,
  playheadSeconds,
  zoom,
  snapGrid,
  onPlayToggle,
  onStop,
  onLoopToggle,
  onBpmChange,
  onZoomChange,
  onSnapGridChange,
  onMasterVolumeChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenBeatLab,
  onOpenSynthStudio,
  onOpenRecordBooth,
  onToggleMixer,
  isMixerOpen,
  onOpenExportModal,
  onOpenProjectManager,
  onSaveProject,
  hasUnsavedChanges,
  onRenameProject,
  onOpenImport,
  onOpenShortcuts,
}) => {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const [justSaved, setJustSaved] = useState(false);

  // Meter visualization canvas
  const meterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setNameInput(project.name);
  }, [project.name]);

  // Handle master VU meter canvas animation
  useEffect(() => {
    const canvas = meterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const analyser = audioEngine.getMasterAnalyser();
    const dataArray = new Uint8Array(analyser ? analyser.fftSize : 128);

    const renderMeter = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (analyser && isPlaying) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128;
          const abs = Math.abs(val);
          if (abs > peak) peak = abs;
          sum += val * val;
        }
        const rms = Math.min(1.0, Math.sqrt(sum / dataArray.length) * 3);

        const lWidth = Math.min(canvas.width, canvas.width * rms);
        const rWidth = Math.min(canvas.width, canvas.width * (rms * 0.95 + peak * 0.05));

        // Draw Left channel meter
        const gradL = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradL.addColorStop(0, '#06b6d4');
        gradL.addColorStop(0.7, '#10b981');
        gradL.addColorStop(0.9, '#f59e0b');
        gradL.addColorStop(1.0, '#ef4444');

        ctx.fillStyle = gradL;
        ctx.fillRect(0, 1, lWidth, 4);

        // Draw Right channel meter
        ctx.fillStyle = gradL;
        ctx.fillRect(0, 7, rWidth, 4);
      } else {
        // Idle low baseline
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 1, canvas.width, 4);
        ctx.fillRect(0, 7, canvas.width, 4);
      }

      animId = requestAnimationFrame(renderMeter);
    };

    animId = requestAnimationFrame(renderMeter);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Compute Bars:Beats:16ths
  const secondsPerBeat = 60 / project.bpm;
  const beatsPerBar = project.timeSignature[0] || 4;
  const totalBeats = playheadSeconds / secondsPerBeat;
  const currentBar = Math.floor(totalBeats / beatsPerBar) + 1;
  const currentBeat = (Math.floor(totalBeats) % beatsPerBar) + 1;
  const currentSixteenth = Math.floor((totalBeats % 1) * 4) + 1;

  // Minutes:Seconds:Millis
  const minutes = Math.floor(playheadSeconds / 60);
  const seconds = Math.floor(playheadSeconds % 60);
  const millis = Math.floor((playheadSeconds % 1) * 1000);

  const handleSaveClick = () => {
    onSaveProject();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleNameSubmit = () => {
    if (nameInput.trim()) {
      onRenameProject(nameInput.trim());
    }
    setIsEditingName(false);
  };

  return (
    <header className="h-14 bg-[#12161f] border-b border-[#212936] px-4 flex items-center justify-between gap-4 text-xs select-none shrink-0 z-30">
      {/* Left: Brand + Project Title */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-950/40">
            <span className="font-extrabold text-white text-xs tracking-tighter">ER</span>
          </div>
          <span className="font-bold text-sm tracking-tight text-white hidden sm:inline">ECHOROOM</span>
        </div>

        <div className="h-4 w-px bg-slate-800 hidden sm:block" />

        {/* Project Name */}
        {isEditingName ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSubmit();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              autoFocus
              className="bg-[#0b0d12] border border-cyan-500 rounded px-2 py-0.5 text-xs text-white outline-none w-48"
            />
          </div>
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            title="Click to rename project"
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-800/60 text-slate-200 transition-colors group max-w-[180px] truncate"
          >
            <span className="font-medium truncate">{project.name}</span>
            {hasUnsavedChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />}
          </button>
        )}

        {/* Project Manager & Save */}
        <button
          onClick={onOpenProjectManager}
          title="Open / Manage Projects"
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 rounded transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          onClick={handleSaveClick}
          title={`Save Project (${modKey}+S)`}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            justSaved
              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
              : hasUnsavedChanges
              ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-700/60 hover:bg-cyan-900/60'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
          }`}
        >
          {justSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">{justSaved ? 'Saved' : 'Save'}</span>
        </button>

        {/* Import Audio Button */}
        <button
          onClick={onOpenImport}
          title={`Import Audio Files (${modKey}+O)`}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171e2c] hover:bg-[#232d42] text-cyan-300 hover:text-white border border-[#27344b] text-xs font-medium transition-colors"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Import</span>
          <kbd className="px-1 py-0.2 bg-[#0d121c] text-[9px] font-mono rounded text-slate-400 border border-slate-700/60 hidden md:inline">
            {modKey}+O
          </kbd>
        </button>
      </div>

      {/* Center: Main Transport Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border border-[#232c3d] rounded-md p-0.5 bg-[#0e121a]">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Stop Button */}
        <button
          onClick={onStop}
          title="Stop & Rewind to Start"
          className="p-2 rounded-lg bg-[#1a2130] hover:bg-[#232c3f] text-slate-300 hover:text-white border border-[#2a3449] transition-all active:scale-95"
        >
          <Square className="w-4 h-4 fill-current" />
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={onPlayToggle}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          className={`flex items-center justify-center w-9 h-9 rounded-lg border font-semibold shadow-md transition-all active:scale-95 ${
            isPlaying
              ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-cyan-500/25'
              : 'bg-gradient-to-b from-[#2a344d] to-[#1c2333] hover:from-[#354261] hover:to-[#222b3e] text-cyan-400 border-[#384666]'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        {/* Loop Toggle */}
        <button
          onClick={onLoopToggle}
          title={`Loop Mode (${project.loopEnabled ? 'Enabled' : 'Disabled'})`}
          className={`p-2 rounded-lg border transition-all ${
            project.loopEnabled
              ? 'bg-cyan-950/70 text-cyan-400 border-cyan-600/70 shadow-sm'
              : 'bg-[#1a2130] text-slate-400 hover:text-slate-200 border-[#2a3449]'
          }`}
        >
          <Repeat className="w-4 h-4" />
        </button>

        {/* Time Counters */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-[#0b0e14] border border-[#21293a] rounded-lg tabular-nums">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-mono">BAR : BEAT : 16TH</span>
            <span className="font-mono text-cyan-400 font-semibold tracking-wider text-xs">
              {String(currentBar).padStart(3, '0')} : {String(currentBeat).padStart(2, '0')} : {String(currentSixteenth).padStart(2, '0')}
            </span>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-mono">TIME</span>
            <span className="font-mono text-slate-300 font-semibold tracking-wider text-xs">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}.{String(millis).padStart(3, '0')}
            </span>
          </div>
        </div>

        {/* BPM & Signature */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0b0e14] border border-[#21293a] rounded-lg">
          <span className="text-slate-400 font-mono text-[11px]">BPM</span>
          <input
            type="number"
            min="40"
            max="260"
            value={project.bpm}
            onChange={(e) => onBpmChange(Math.max(40, Math.min(260, parseInt(e.target.value) || 120)))}
            className="w-12 bg-transparent text-cyan-400 font-mono font-bold text-center outline-none"
          />
          <span className="text-slate-600 text-xs font-mono">4/4</span>
        </div>
      </div>

      {/* Right: Studio Studios, Mixer, Zoom & Export */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Studio Tools Hub */}
        <div className="flex items-center gap-1 bg-[#0e121a] border border-[#232c3d] p-0.5 rounded-lg">
          <button
            onClick={onOpenBeatLab}
            title="Open Beat Lab (16-Step Drum Machine)"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-cyan-950/50 hover:border-cyan-800/50 border border-transparent transition-all"
          >
            <Music className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">Beat Lab</span>
          </button>
          <button
            onClick={onOpenSynthStudio}
            title="Open Synth Studio (Playable Keyboard & Presets)"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-violet-950/50 hover:border-violet-800/50 border border-transparent transition-all"
          >
            <Piano className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden xl:inline">Synth</span>
          </button>
          <button
            onClick={onOpenRecordBooth}
            title="Open Recording Booth (Mic input)"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-rose-950/50 hover:border-rose-800/50 border border-transparent transition-all"
          >
            <Mic className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden xl:inline">Record</span>
          </button>
          <button
            onClick={onToggleMixer}
            title="Toggle Mixer Console"
            className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all ${
              isMixerOpen
                ? 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60'
                : 'text-slate-300 hover:text-white hover:bg-slate-800 border-transparent'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden xl:inline">Mixer</span>
          </button>
        </div>

        {/* Master Meter & Volume Slider */}
        <div className="hidden md:flex items-center gap-2 px-2 py-1 bg-[#0b0e14] border border-[#21293a] rounded-lg">
          <canvas ref={meterCanvasRef} width={42} height={12} className="rounded bg-[#080a0f] border border-slate-900" />
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.01"
            value={project.masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            title={`Master Volume: ${Math.round(project.masterVolume * 100)}%`}
            className="w-16 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Zoom controls */}
        <div className="hidden sm:flex items-center gap-0.5 border border-[#232c3d] rounded-md p-0.5 bg-[#0e121a]">
          <button
            onClick={() => onZoomChange(Math.max(20, zoom - 15))}
            title="Zoom Out"
            className="p-1 rounded text-slate-400 hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onZoomChange(Math.min(220, zoom + 15))}
            title="Zoom In"
            className="p-1 rounded text-slate-400 hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Snap Grid selector */}
        <select
          value={snapGrid}
          onChange={(e) => onSnapGridChange(e.target.value)}
          title="Grid Snap Resolution"
          className="bg-[#0e121a] border border-[#232c3d] text-slate-300 text-[11px] rounded px-1.5 py-1 outline-none hidden md:block"
        >
          <option value="1/16">Snap: 1/16</option>
          <option value="1/8">Snap: 1/8</option>
          <option value="1/4">Snap: 1/4</option>
          <option value="1/2">Snap: 1/2</option>
          <option value="1bar">Snap: 1 Bar</option>
          <option value="off">Snap: Off</option>
        </select>

        {/* Export WAV Button */}
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-cyan-950/40 transition-all active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export WAV</span>
        </button>

        {/* Shortcuts Help Button */}
        <button
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (?)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
