import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  X,
  Music,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Plus,
  GripHorizontal,
  FileAudio,
} from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine';
import { extractPeaks } from '../audio/waveforms';
import { saveAudioBufferToDB } from '../storage/db';

export interface ImportedAsset {
  id: string;
  name: string;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  peaks: number[];
  buffer: AudioBuffer;
  fileSize?: number;
}

interface ImportAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertClipToTimeline: (
    buffer: AudioBuffer,
    clipName: string,
    durationSec: number,
    peaks: number[]
  ) => void;
  targetTrackName?: string;
}

export const ImportAudioModal: React.FC<ImportAudioModalProps> = ({
  isOpen,
  onClose,
  onInsertClipToTimeline,
  targetTrackName,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState<{ name: string; progress: number }[]>([]);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [importedAssets, setImportedAssets] = useState<ImportedAsset[]>([]);
  const [previewingAssetId, setPreviewingAssetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  // Load existing buffers from audioEngine cache on mount
  useEffect(() => {
    if (!isOpen) return;
    const assets: ImportedAsset[] = [];
    const bufferMap = audioEngine.getBufferMap();
    for (const [id, buf] of bufferMap.entries()) {
      assets.push({
        id,
        name: id.replace(/^buf_\d+_?/, '').replace(/_/g, ' ') || 'Audio Sample',
        duration: buf.duration,
        sampleRate: buf.sampleRate,
        numberOfChannels: buf.numberOfChannels,
        peaks: extractPeaks(buf, 80),
        buffer: buf,
      });
    }
    setImportedAssets(assets);
  }, [isOpen]);

  // Stop preview audio when modal is closed
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [isOpen]);

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {}
      previewSourceRef.current = null;
    }
    setPreviewingAssetId(null);
  };

  const handlePreviewToggle = (asset: ImportedAsset) => {
    if (previewingAssetId === asset.id) {
      stopPreview();
      return;
    }

    stopPreview();
    const ctx = audioEngine.initContext();
    const source = ctx.createBufferSource();
    source.buffer = asset.buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.8, ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.onended = () => {
      if (previewSourceRef.current === source) {
        setPreviewingAssetId(null);
        previewSourceRef.current = null;
      }
    };

    source.start();
    previewSourceRef.current = source;
    setPreviewingAssetId(asset.id);
  };

  const processFiles = async (files: FileList | File[]) => {
    setErrorMessages([]);
    const validAudioExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.weba'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const hasValidExt = validAudioExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );
      const isAudioMime = file.type.startsWith('audio/') || file.type === '';

      if (!hasValidExt && !isAudioMime) {
        setErrorMessages((prev) => [
          ...prev,
          `"${file.name}" is not a recognized audio format. Please provide WAV, MP3, OGG, or FLAC.`,
        ]);
        continue;
      }

      setLoadingFiles((prev) => [...prev, { name: file.name, progress: 30 }]);

      try {
        const arrayBuffer = await file.arrayBuffer();
        setLoadingFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, progress: 70 } : f))
        );

        const safeName = file.name.replace(/\.[^/.]+$/, '');
        const bufferId = `buf_${Date.now()}_${safeName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Real browser decoding via AudioContext.decodeAudioData
        const decodedBuffer = await audioEngine.decodeAudio(bufferId, arrayBuffer);
        const peaks = extractPeaks(decodedBuffer, 80);

        // Persist decoded buffer to IndexedDB for offline integrity
        await saveAudioBufferToDB(bufferId, file.name, decodedBuffer);

        const newAsset: ImportedAsset = {
          id: bufferId,
          name: safeName,
          duration: decodedBuffer.duration,
          sampleRate: decodedBuffer.sampleRate,
          numberOfChannels: decodedBuffer.numberOfChannels,
          peaks,
          buffer: decodedBuffer,
          fileSize: file.size,
        };

        setImportedAssets((prev) => [newAsset, ...prev]);
        setLoadingFiles((prev) => prev.filter((f) => f.name !== file.name));
      } catch (err) {
        console.error('Audio decode error:', err);
        setLoadingFiles((prev) => prev.filter((f) => f.name !== file.name));
        setErrorMessages((prev) => [
          ...prev,
          `Failed to decode "${file.name}". The file may be corrupt or encoded with an unsupported codec.`,
        ]);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleInsert = (asset: ImportedAsset) => {
    onInsertClipToTimeline(asset.buffer, asset.name, asset.duration, asset.peaks);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-[#232d42] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#212b3e] flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Import Audio Files</h3>
                <span className="px-1.5 py-0.5 bg-[#1e273a] text-cyan-300 text-[10px] font-mono rounded border border-cyan-900/60">
                  {modKey}+O
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                WAV, MP3, OGG, and FLAC with real-time waveform decoding
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
          {/* Hidden native input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Drag & Drop Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all text-center ${
              isDraggingOver
                ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 scale-[0.99]'
                : 'border-[#29354d] hover:border-cyan-500/60 bg-[#0d111a]/70 hover:bg-[#101520]'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileAudio className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                Click to browse or drop audio files here
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Supports multiple files: WAV, MP3, OGG, FLAC (Decoded locally via Web Audio API)
              </p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all">
                Select Audio Files
              </span>
            </div>
          </div>

          {/* Loading status items */}
          {loadingFiles.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {loadingFiles.map((f, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-[#171e2e] border border-cyan-800/40 rounded-lg flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                    <span className="text-slate-300 font-medium truncate">{f.name}</span>
                    <span className="text-[10px] text-cyan-400 font-mono">Decoding audio...</span>
                  </div>
                  <div className="w-24 h-1.5 bg-[#0e131d] rounded-full overflow-hidden border border-slate-700">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-300"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error messages */}
          {errorMessages.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {errorMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg flex items-start gap-2 text-xs text-rose-300"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="flex-1">{msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Library / Imported Clips */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Project Audio Library ({importedAssets.length})
              </span>
              <span className="text-[10px] text-slate-500">
                Drag cards onto timeline tracks or click &ldquo;Add to Timeline&rdquo;
              </span>
            </div>

            {importedAssets.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs border border-[#1b2230] rounded-xl bg-[#0c1018]">
                No audio samples imported yet. Drop a WAV, MP3, or OGG file above!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                {importedAssets.map((asset) => {
                  const isPlayingThis = previewingAssetId === asset.id;
                  const mins = Math.floor(asset.duration / 60);
                  const secs = (asset.duration % 60).toFixed(1);
                  const formattedDuration = `${mins}:${secs.padStart(4, '0')}`;

                  return (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/audio-buffer-id', asset.id);
                        e.dataTransfer.setData('text/audio-name', asset.name);
                        e.dataTransfer.setData('text/audio-duration', String(asset.duration));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      className="p-2.5 bg-[#151c29] hover:bg-[#1a2334] border border-[#232e42] hover:border-cyan-500/50 rounded-lg flex items-center justify-between gap-3 group transition-all cursor-grab active:cursor-grabbing"
                    >
                      {/* Left: Drag grip & Play Preview */}
                      <div className="flex items-center gap-2">
                        <div
                          title="Drag directly into any timeline track"
                          className="text-slate-500 group-hover:text-cyan-400 transition-colors"
                        >
                          <GripHorizontal className="w-4 h-4" />
                        </div>
                        <button
                          onClick={() => handlePreviewToggle(asset)}
                          title={isPlayingThis ? 'Stop Preview' : 'Audition Audio'}
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                            isPlayingThis
                              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/40'
                              : 'bg-[#20293d] text-slate-300 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {isPlayingThis ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>

                      {/* Middle: Name & Waveform Mini Canvas */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {asset.name}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400">
                            {formattedDuration}
                          </span>
                        </div>
                        {/* Mini Waveform Peak Bar */}
                        <div className="h-4 bg-[#0d121c] rounded flex items-center px-1 gap-0.5 overflow-hidden">
                          {asset.peaks.slice(0, 40).map((peak, pIdx) => (
                            <div
                              key={pIdx}
                              style={{ height: `${Math.max(15, peak * 100)}%` }}
                              className="w-1 bg-cyan-500/70 rounded-full"
                            />
                          ))}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleInsert(asset)}
                          title={`Add to timeline at current playhead position${
                            targetTrackName ? ` (${targetTrackName})` : ''
                          }`}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-600/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 font-bold rounded-md text-[11px] border border-cyan-500/30 transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add to Track</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#212b3e] bg-[#10141e] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>High fidelity 16-bit / 32-bit float audio decoding</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
