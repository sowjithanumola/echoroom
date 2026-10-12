import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Play, Pause, X, Headphones, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Track } from '../types/daw';
import { recordingEngine, RecordedTake } from '../audio/recorder';

interface RecordingBoothProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  onInsertTakeToTrack: (take: RecordedTake, targetTrackId: string) => void;
}

export const RecordingBooth: React.FC<RecordingBoothProps> = ({
  isOpen,
  onClose,
  tracks,
  onInsertTakeToTrack,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [recordedTakes, setRecordedTakes] = useState<RecordedTake[]>([]);
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(tracks[0]?.id || '');

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const meterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (tracks.length > 0 && !selectedTrackId) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [tracks, selectedTrackId]);

  // Request mic permission on open
  useEffect(() => {
    if (!isOpen) {
      setIsRecording(false);
      setIsMonitoring(false);
      recordingEngine.setMonitoring(false);
      return;
    }

    const initMic = async () => {
      const res = await recordingEngine.requestPermission();
      if (res.granted) {
        setHasPermission(true);
        setPermissionError(null);
      } else {
        setHasPermission(false);
        setPermissionError(res.error || 'Microphone access denied');
      }
    };

    initMic();
  }, [isOpen]);

  // Live input VU Meter drawing loop
  useEffect(() => {
    if (!isOpen || !hasPermission) return;

    const canvas = meterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderVU = () => {
      const { rms, peak } = recordingEngine.getAudioLevel();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width * rms;
      const peakX = canvas.width * peak;

      // Gradient
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0, '#10b981'); // emerald
      grad.addColorStop(0.7, '#06b6d4'); // cyan
      grad.addColorStop(0.85, '#f59e0b'); // amber
      grad.addColorStop(1.0, '#ef4444'); // red

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, barWidth, canvas.height);

      // Peak line
      if (peak > 0.05) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.min(canvas.width - 2, peakX), 0, 2, canvas.height);
      }

      animId = requestAnimationFrame(renderVU);
    };

    animId = requestAnimationFrame(renderVU);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, hasPermission]);

  if (!isOpen) return null;

  const handleToggleMonitoring = () => {
    const nextState = !isMonitoring;
    setIsMonitoring(nextState);
    recordingEngine.setMonitoring(nextState);
  };

  const handleStartRecording = () => {
    const started = recordingEngine.startRecording();
    if (started) {
      setIsRecording(true);
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 0.1);
      }, 100);
    }
  };

  const handleStopRecording = async () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const take = await recordingEngine.stopRecording();
    setIsRecording(false);
    if (take) {
      setRecordedTakes((prev) => [take, ...prev]);
    }
  };

  const handlePreviewTake = (take: RecordedTake) => {
    if (playingTakeId === take.id) {
      audioPlayerRef.current?.pause();
      setPlayingTakeId(null);
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = take.url;
        audioPlayerRef.current.play();
        setPlayingTakeId(take.id);
        audioPlayerRef.current.onended = () => setPlayingTakeId(null);
      }
    }
  };

  const handleInsertTake = (take: RecordedTake) => {
    if (!selectedTrackId) return;
    onInsertTakeToTrack(take, selectedTrackId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <audio ref={audioPlayerRef} className="hidden" />

      <div className="bg-[#121622] border border-[#232c3f] rounded-xl w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Top Header */}
        <div className="h-14 border-b border-[#21293a] px-6 flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">RECORDING BOOTH — Microphone Input</h2>
              <p className="text-[11px] text-slate-400">Capture vocals, live instruments, and audio samples</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 flex flex-col gap-6">
          {/* Permission Status */}
          {hasPermission === false && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-200">Microphone Access Denied or Unavailable</h4>
                <p className="text-xs text-rose-300/80 mt-0.5">
                  {permissionError || 'Please allow microphone permissions in your browser address bar to record audio.'}
                </p>
              </div>
            </div>
          )}

          {hasPermission === true && (
            <div className="flex flex-col gap-4">
              {/* Live VU Meter & Monitor Controls */}
              <div className="bg-[#0e121a] border border-[#232d3f] p-4 rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-slate-200">Microphone Ready</span>
                  </div>

                  {/* Monitor Switch */}
                  <button
                    onClick={handleToggleMonitoring}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      isMonitoring
                        ? 'bg-cyan-950 text-cyan-400 border-cyan-700'
                        : 'bg-[#171e2c] text-slate-400 border-[#26334a] hover:text-white'
                    }`}
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Live Monitoring {isMonitoring ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                {/* Level Meter Bar */}
                <div className="flex flex-col gap-1">
                  <canvas
                    ref={meterCanvasRef}
                    width={500}
                    height={16}
                    className="w-full h-4 rounded-md bg-[#080b11] border border-slate-900"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-500">
                    <span>-48 dB</span>
                    <span>-24 dB</span>
                    <span>-12 dB</span>
                    <span>-6 dB</span>
                    <span>0 dB</span>
                  </div>
                </div>
              </div>

              {/* Central Big Record Button */}
              <div className="flex flex-col items-center justify-center gap-3 py-4">
                <button
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-95 ${
                    isRecording
                      ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/40 ring-4 ring-rose-400/50'
                      : 'bg-gradient-to-tr from-rose-600 to-rose-400 hover:from-rose-500 hover:to-rose-300 text-white shadow-rose-950/60'
                  }`}
                >
                  {isRecording ? <Square className="w-8 h-8 fill-current" /> : <Mic className="w-9 h-9" />}
                </button>

                <div className="text-center">
                  <span className="font-mono text-xl font-bold text-slate-100 tracking-wider">
                    {Math.floor(elapsedSeconds / 60)
                      .toString()
                      .padStart(2, '0')}
                    :
                    {Math.floor(elapsedSeconds % 60)
                      .toString()
                      .padStart(2, '0')}
                    .
                    {Math.floor((elapsedSeconds % 1) * 10)
                      .toString()}
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRecording ? 'Recording in progress... Click to stop take' : 'Click microphone button to begin recording'}
                  </p>
                </div>
              </div>

              {/* Recorded Takes List */}
              {recordedTakes.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-[#1e2535] pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">Recorded Takes ({recordedTakes.length})</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[11px]">Destination Track:</span>
                      <select
                        value={selectedTrackId}
                        onChange={(e) => setSelectedTrackId(e.target.value)}
                        className="bg-[#0f131c] border border-[#232c3d] text-white rounded px-2 py-1 text-xs outline-none"
                      >
                        {tracks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                    {recordedTakes.map((take) => (
                      <div
                        key={take.id}
                        className="p-3 bg-[#151b27] border border-[#232d3f] rounded-lg flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <button
                            onClick={() => handlePreviewTake(take)}
                            className="p-2 rounded-full bg-[#1e273a] hover:bg-cyan-950 text-cyan-400 border border-[#29364f]"
                          >
                            {playingTakeId === take.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                          </button>
                          <div className="truncate">
                            <span className="font-semibold text-slate-200 block truncate">{take.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Duration: {take.duration.toFixed(2)}s
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={take.url}
                            download={`${take.name}.webm`}
                            title="Download Take Audio"
                            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <Download className="w-4 h-4" />
                          </a>

                          <button
                            onClick={() => handleInsertTake(take)}
                            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-sm transition-all"
                          >
                            Add to Timeline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
