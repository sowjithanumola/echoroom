import { extractPeaks } from './waveforms';

export interface RecordedTake {
  id: string;
  name: string;
  buffer: AudioBuffer;
  duration: number;
  peaks: number[];
  blob: Blob;
  url: string;
}

export class RecordingEngine {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private monitorGain: GainNode | null = null;

  private recordedChunks: Blob[] = [];
  private isRecording = false;
  private isMonitoring = false;
  private recordingStartTime = 0;

  public async requestPermission(): Promise<{ granted: boolean; error?: string }> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { granted: false, error: 'Audio recording is not supported in this browser environment.' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.mediaStream = stream;
      this.setupAudioGraph(stream);

      return { granted: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Microphone access denied or unavailable.';
      return { granted: false, error: errorMsg };
    }
  }

  private setupAudioGraph(stream: MediaStream) {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
    }

    this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.6;

    this.monitorGain = this.audioCtx.createGain();
    this.monitorGain.gain.setValueAtTime(this.isMonitoring ? 0.7 : 0, this.audioCtx.currentTime);

    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.monitorGain);
    this.monitorGain.connect(this.audioCtx.destination);
  }

  public setMonitoring(enabled: boolean) {
    this.isMonitoring = enabled;
    if (this.monitorGain && this.audioCtx) {
      this.monitorGain.gain.setTargetAtTime(enabled ? 0.7 : 0, this.audioCtx.currentTime, 0.05);
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getAudioLevel(): { rms: number; peak: number } {
    if (!this.analyserNode) return { rms: 0, peak: 0 };
    const data = new Uint8Array(this.analyserNode.fftSize);
    this.analyserNode.getByteTimeDomainData(data);

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const float = (data[i] - 128) / 128;
      const abs = Math.abs(float);
      if (abs > peak) peak = abs;
      sum += float * float;
    }

    const rms = Math.sqrt(sum / data.length);
    return { rms: Math.min(1.0, rms * 3.5), peak: Math.min(1.0, peak) };
  }

  public startRecording(): boolean {
    if (!this.mediaStream) return false;

    this.recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : '';

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, mimeType ? { mimeType } : undefined);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      return true;
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      return false;
    }
  }

  public async stopRecording(): Promise<RecordedTake | null> {
    const recorder = this.mediaRecorder;
    if (!recorder || !this.isRecording) return null;

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        this.isRecording = false;
        const blob = new Blob(this.recordedChunks, { type: recorder.mimeType || 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();

        if (!this.audioCtx) {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          this.audioCtx = new AudioCtx();
        }

        try {
          const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
          const peaks = extractPeaks(audioBuffer, 150);
          const url = URL.createObjectURL(blob);
          const id = `rec_${Date.now()}`;

          resolve({
            id,
            name: `Vocal Take ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
            buffer: audioBuffer,
            duration: audioBuffer.duration,
            peaks,
            blob,
            url,
          });
        } catch (decodeErr) {
          console.error('Failed to decode recording:', decodeErr);
          resolve(null);
        }
      };

      recorder.stop();
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getIsMonitoring(): boolean {
    return this.isMonitoring;
  }

  public getDurationSeconds(): number {
    if (!this.isRecording) return 0;
    return (Date.now() - this.recordingStartTime) / 1000;
  }

  public cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }
  }
}

export const recordingEngine = new RecordingEngine();
