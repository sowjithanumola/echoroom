import React, { useState, useRef, useEffect } from 'react';
import { Download, Play, Pause, X, Music, CheckCircle2, Loader2 } from 'lucide-react';
import { Project } from '../types/daw';
import { renderProjectOffline } from '../audio/offlineRenderer';
import { audioEngine } from '../audio/AudioEngine';

interface ExportModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  isOpen,
  onClose,
}) => {
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [renderedDuration, setRenderedDuration] = useState(0);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [exportName, setExportName] = useState(`${project.name.replace(/\s+/g, '_')}_master`);

  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setExportName(`${project.name.replace(/\s+/g, '_')}_master`);
    setRenderedBlob(null);
    setRenderedUrl(null);
    setIsPlayingPreview(false);
    setProgress(0);
  }, [isOpen, project.name]);

  if (!isOpen) return null;

  const handleStartRender = async () => {
    setIsRendering(true);
    setProgress(20);

    try {
      const bufferMap = audioEngine.getBufferMap();
      setProgress(40);

      const result = await renderProjectOffline(project, bufferMap, {
        sampleRate,
      });

      setProgress(85);
      const url = URL.createObjectURL(result.wavBlob);
      setRenderedBlob(result.wavBlob);
      setRenderedUrl(url);
      setRenderedDuration(result.buffer.duration);
      setProgress(100);
    } catch (err) {
      console.error('Rendering failed:', err);
    } finally {
      setIsRendering(false);
    }
  };

  const handleTogglePreview = () => {
    if (!audioPreviewRef.current || !renderedUrl) return;

    if (isPlayingPreview) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlayingPreview(true);
      audioPreviewRef.current.onended = () => setIsPlayingPreview(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      {renderedUrl && (
        <audio ref={audioPreviewRef} src={renderedUrl} className="hidden" />
      )}

      <div className="bg-[#121622] border border-[#232c3f] rounded-xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b border-[#21293a] px-6 flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">RENDER & EXPORT MASTER WAV</h2>
              <p className="text-[11px] text-slate-400">Offline high-fidelity mixdown to uncompressed PCM audio</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5 bg-[#0e121a]">
          {/* Options */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            {/* Filename */}
            <div className="flex flex-col gap-1.5">
              <span className="text-slate-400 font-medium">Export Filename:</span>
              <input
                type="text"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                className="bg-[#151b27] border border-[#232d3f] text-white px-3 py-2 rounded-lg outline-none font-mono text-xs focus:border-cyan-500"
              />
            </div>

            {/* Sample Rate */}
            <div className="flex flex-col gap-1.5">
              <span className="text-slate-400 font-medium">Sample Rate:</span>
              <select
                value={sampleRate}
                onChange={(e) => setSampleRate(parseInt(e.target.value, 10))}
                className="bg-[#151b27] border border-[#232d3f] text-white px-3 py-2 rounded-lg outline-none text-xs"
              >
                <option value={44100}>44,100 Hz (CD Quality)</option>
                <option value={48000}>48,000 Hz (Studio Standard)</option>
              </select>
            </div>
          </div>

          {/* Project Summary */}
          <div className="bg-[#141925] border border-[#232c3f] rounded-xl p-4 flex flex-col gap-2 text-xs">
            <span className="font-bold text-slate-300">Project Mix Configuration</span>
            <div className="grid grid-cols-3 gap-2 text-slate-400 text-[11px]">
              <div>Tracks: <span className="text-white font-mono">{project.tracks.length}</span></div>
              <div>Tempo: <span className="text-white font-mono">{project.bpm} BPM</span></div>
              <div>Format: <span className="text-cyan-400 font-mono">16-bit PCM WAV</span></div>
            </div>
          </div>

          {/* Render State */}
          {!renderedBlob && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              {isRendering ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                  <span className="text-xs font-semibold text-slate-200">
                    Offline rendering audio graph ({progress}%)...
                  </span>
                  <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${progress}%` }}
                      className="h-full bg-cyan-400 transition-all duration-300"
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleStartRender}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Music className="w-4 h-4" />
                  <span>Start Offline Render</span>
                </button>
              )}
            </div>
          )}

          {/* Render Completed Card */}
          {renderedBlob && (
            <div className="bg-[#151c2a] border border-cyan-800/60 rounded-xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Render Complete! High quality stereo WAV generated.</span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-300 bg-[#0e131d] p-3 rounded-lg border border-[#1f283a]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTogglePreview}
                    className="p-2.5 rounded-full bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 transition-colors"
                  >
                    {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <div>
                    <span className="font-semibold block">{exportName}.wav</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Duration: {renderedDuration.toFixed(1)}s · Size: {formatFileSize(renderedBlob.size)}
                    </span>
                  </div>
                </div>

                <a
                  href={renderedUrl || '#'}
                  download={`${exportName}.wav`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Download WAV</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-[#21293a] px-6 bg-[#151a28] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
