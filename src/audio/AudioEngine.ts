import { Project, Track, Clip } from '../types/daw';
import { createImpulseResponse } from './impulseResponse';
import { applyAutomationToParam } from './automation';

interface ActiveClipSource {
  clipId: string;
  trackId: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner?: StereoPannerNode;
  scheduledEnd: number;
}

interface TrackNodes {
  inputGain: GainNode;
  lowShelf: BiquadFilterNode;
  midPeak: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  reverbWet: GainNode;
  volumeGain: GainNode;
  panner?: StereoPannerNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterPanner: StereoPannerNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;

  private trackNodes: Map<string, TrackNodes> = new Map();
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private activeSources: ActiveClipSource[] = [];

  // Transport State
  private isPlaying = false;
  private playheadPosition = 0; // in seconds
  private playbackStartTime = 0; // audioContext.currentTime when play started
  private playheadStartOffset = 0; // offset in song when play started
  private currentProject: Project | null = null;

  private onPlayheadUpdateCallback?: (seconds: number) => void;
  private rafId: number | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      // Master Analyser
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 256;
      this.masterAnalyser.smoothingTimeConstant = 0.8;

      // Master Pan
      if (this.ctx.createStereoPanner) {
        this.masterPanner = this.ctx.createStereoPanner();
        this.masterGain.connect(this.masterPanner);
        this.masterPanner.connect(this.masterAnalyser);
      } else {
        this.masterGain.connect(this.masterAnalyser);
      }

      this.masterAnalyser.connect(this.ctx.destination);

      // Master Reverb Convolver shared
      this.reverbConvolver = this.ctx.createConvolver();
      this.reverbConvolver.buffer = createImpulseResponse(this.ctx, 2.5, 2.0);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public async resume(): Promise<void> {
    const ctx = this.initContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  public getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyser;
  }

  public setBuffer(id: string, buffer: AudioBuffer) {
    this.bufferCache.set(id, buffer);
  }

  public getBuffer(id: string): AudioBuffer | undefined {
    return this.bufferCache.get(id);
  }

  public getBufferMap(): Map<string, AudioBuffer> {
    return this.bufferCache;
  }

  /**
   * Decodes an ArrayBuffer or File into an AudioBuffer and caches it.
   */
  public async decodeAudio(id: string, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.initContext();
    // Use copy to avoid detachment in some browser engines
    const bufferCopy = arrayBuffer.slice(0);
    const decoded = await ctx.decodeAudioData(bufferCopy);
    this.bufferCache.set(id, decoded);
    return decoded;
  }

  /**
   * Sets up or updates the Web Audio routing graph for all project tracks.
   */
  public syncProjectGraph(project: Project) {
    this.currentProject = project;
    const ctx = this.initContext();
    if (!this.masterGain) return;

    // Update Master
    this.masterGain.gain.setTargetAtTime(project.masterVolume, ctx.currentTime, 0.02);
    if (this.masterPanner) {
      this.masterPanner.pan.setTargetAtTime(Math.max(-1, Math.min(1, project.masterPan || 0)), ctx.currentTime, 0.02);
    }

    const hasSolo = project.tracks.some((t) => t.soloed);

    // Sync each track
    for (const track of project.tracks) {
      let nodes = this.trackNodes.get(track.id);

      if (!nodes) {
        // Build new track node pipeline
        const inputGain = ctx.createGain();
        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 250;

        const midPeak = ctx.createBiquadFilter();
        midPeak.type = 'peaking';
        midPeak.frequency.value = track.effects?.eq?.midFreq || 1000;
        midPeak.Q.value = 1.0;

        const highShelf = ctx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 4500;

        const volumeGain = ctx.createGain();

        // Delay
        const delayNode = ctx.createDelay(2.0);
        const delayFeedback = ctx.createGain();
        const delayWet = ctx.createGain();
        delayNode.connect(delayFeedback);
        delayFeedback.connect(delayNode);
        delayNode.connect(delayWet);

        // Reverb wet
        const reverbWet = ctx.createGain();
        if (this.reverbConvolver) {
          reverbWet.connect(volumeGain);
        }

        // Wire EQ chain
        inputGain.connect(lowShelf);
        lowShelf.connect(midPeak);
        midPeak.connect(highShelf);

        // Dry signal directly to volume
        highShelf.connect(volumeGain);

        // FX Sends
        highShelf.connect(delayNode);
        delayWet.connect(volumeGain);

        if (this.reverbConvolver) {
          highShelf.connect(this.reverbConvolver);
          this.reverbConvolver.connect(reverbWet);
        }

        // Panning and Master Connection
        if (ctx.createStereoPanner) {
          const panner = ctx.createStereoPanner();
          volumeGain.connect(panner);
          panner.connect(this.masterGain);
          nodes = {
            inputGain,
            lowShelf,
            midPeak,
            highShelf,
            delayNode,
            delayFeedback,
            delayWet,
            reverbWet,
            volumeGain,
            panner,
          };
        } else {
          volumeGain.connect(this.masterGain);
          nodes = {
            inputGain,
            lowShelf,
            midPeak,
            highShelf,
            delayNode,
            delayFeedback,
            delayWet,
            reverbWet,
            volumeGain,
          };
        }

        this.trackNodes.set(track.id, nodes);
      }

      // Update parameters smoothly
      const isMuted = hasSolo ? !track.soloed : track.muted;
      const targetVolume = isMuted ? 0 : track.volume;
      nodes.volumeGain.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.02);

      if (nodes.panner) {
        nodes.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, track.pan || 0)), ctx.currentTime, 0.02);
      }

      // EQ
      nodes.lowShelf.gain.setTargetAtTime(track.effects?.eq?.low || 0, ctx.currentTime, 0.02);
      nodes.midPeak.gain.setTargetAtTime(track.effects?.eq?.mid || 0, ctx.currentTime, 0.02);
      nodes.highShelf.gain.setTargetAtTime(track.effects?.eq?.high || 0, ctx.currentTime, 0.02);

      // Delay
      nodes.delayNode.delayTime.setTargetAtTime(track.effects?.delay?.time || 0.3, ctx.currentTime, 0.02);
      nodes.delayFeedback.gain.setTargetAtTime(track.effects?.delay?.feedback || 0.3, ctx.currentTime, 0.02);
      nodes.delayWet.gain.setTargetAtTime(track.effects?.delay?.mix || 0, ctx.currentTime, 0.02);

      // Reverb
      nodes.reverbWet.gain.setTargetAtTime(track.effects?.reverb?.mix || 0, ctx.currentTime, 0.02);
    }

    // Clean up removed tracks
    const currentTrackIds = new Set(project.tracks.map((t) => t.id));
    for (const [id, nodes] of Array.from(this.trackNodes.entries())) {
      if (!currentTrackIds.has(id)) {
        try {
          nodes.volumeGain.disconnect();
          nodes.panner?.disconnect();
          this.trackNodes.delete(id);
        } catch {
          // ignore
        }
      }
    }
  }

  public getTrackInputNode(trackId: string): AudioNode | null {
    return this.trackNodes.get(trackId)?.inputGain || null;
  }

  /**
   * Starts playback from the current playhead position or given offset.
   */
  public play(project: Project, fromSeconds?: number) {
    const ctx = this.initContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    this.stopSources();
    this.syncProjectGraph(project);

    const startPos = fromSeconds !== undefined ? fromSeconds : this.playheadPosition;
    this.playheadPosition = startPos;
    this.playbackStartTime = ctx.currentTime;
    this.playheadStartOffset = startPos;
    this.isPlaying = true;

    // Schedule all clips that fall in or after playhead
    const secondsPerBeat = 60 / project.bpm;
    const beatsPerBar = project.timeSignature[0] || 4;
    const loopDuration = (project.loopEndBar - project.loopStartBar) * beatsPerBar * secondsPerBeat;
    const loopStartTimeSec = project.loopStartBar * beatsPerBar * secondsPerBeat;
    const loopEndTimeSec = project.loopEndBar * beatsPerBar * secondsPerBeat;

    this.scheduleClipsFrom(startPos, project);
    this.startPlayheadLoop(project);
  }

  private scheduleClipsFrom(startPos: number, project: Project) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    for (const track of project.tracks) {
      const nodes = this.trackNodes.get(track.id);
      if (!nodes) continue;

      for (const clip of track.clips) {
        const buffer = this.bufferCache.get(clip.bufferId);
        if (!buffer) continue;

        const clipStart = clip.startSeconds;
        const clipEnd = clip.startSeconds + clip.durationSeconds;

        // Clip already ended
        if (clipEnd <= startPos) continue;

        let scheduleAtCtxTime: number;
        let bufferOffset: number;
        let durationToPlay: number;

        if (clipStart >= startPos) {
          // Clip starts in future
          scheduleAtCtxTime = now + (clipStart - startPos);
          bufferOffset = clip.offsetSeconds || 0;
          durationToPlay = clip.durationSeconds;
        } else {
          // Clip already started, play remaining slice
          const offsetIntoClip = startPos - clipStart;
          scheduleAtCtxTime = now;
          bufferOffset = (clip.offsetSeconds || 0) + offsetIntoClip;
          durationToPlay = clip.durationSeconds - offsetIntoClip;
        }

        if (durationToPlay <= 0) continue;

        try {
          const source = ctx.createBufferSource();
          source.buffer = buffer;

          const clipGain = ctx.createGain();

          const clipTimeOffsetSec = clipStart < startPos ? (startPos - clipStart) : 0;
          const clipVirtualStartCtx = scheduleAtCtxTime - clipTimeOffsetSec;

          // Apply Volume Automation
          applyAutomationToParam(
            clipGain.gain,
            clip.automation?.volume,
            1.0,
            clip.volume ?? 1.0,
            clipVirtualStartCtx,
            clip.durationSeconds,
            scheduleAtCtxTime,
            clipTimeOffsetSec
          );

          source.connect(clipGain);

          let pannerNode: StereoPannerNode | undefined;
          if (ctx.createStereoPanner && clip.automation?.pan && clip.automation.pan.length > 0) {
            pannerNode = ctx.createStereoPanner();
            applyAutomationToParam(
              pannerNode.pan,
              clip.automation.pan,
              0.0,
              1.0,
              clipVirtualStartCtx,
              clip.durationSeconds,
              scheduleAtCtxTime,
              clipTimeOffsetSec
            );
            clipGain.connect(pannerNode);
            pannerNode.connect(nodes.inputGain);
          } else {
            clipGain.connect(nodes.inputGain);
          }

          source.start(scheduleAtCtxTime, bufferOffset, durationToPlay);

          this.activeSources.push({
            clipId: clip.id,
            trackId: track.id,
            source,
            gain: clipGain,
            panner: pannerNode,
            scheduledEnd: scheduleAtCtxTime + durationToPlay,
          });
        } catch (err) {
          console.warn('Failed to schedule clip:', clip.id, err);
        }
      }
    }
  }

  public pause() {
    this.isPlaying = false;
    this.stopSources();
    this.stopPlayheadLoop();
  }

  public stop() {
    this.isPlaying = false;
    this.stopSources();
    this.stopPlayheadLoop();
    this.playheadPosition = 0;
    this.onPlayheadUpdateCallback?.(0);
  }

  public seek(seconds: number, project?: Project) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.playheadPosition = Math.max(0, seconds);
    this.onPlayheadUpdateCallback?.(this.playheadPosition);

    if (wasPlaying && project) {
      this.play(project, this.playheadPosition);
    }
  }

  private stopSources() {
    for (const item of this.activeSources) {
      try {
        item.source.stop();
        item.source.disconnect();
        item.gain.disconnect();
        item.panner?.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.activeSources = [];
  }

  public setOnPlayheadUpdate(cb: (seconds: number) => void) {
    this.onPlayheadUpdateCallback = cb;
  }

  public getPlayheadSeconds(): number {
    return this.playheadPosition;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private startPlayheadLoop(project: Project) {
    this.stopPlayheadLoop();

    const secondsPerBeat = 60 / project.bpm;
    const beatsPerBar = project.timeSignature[0] || 4;
    const loopStartSec = project.loopStartBar * beatsPerBar * secondsPerBeat;
    const loopEndSec = project.loopEndBar * beatsPerBar * secondsPerBeat;

    const loop = () => {
      if (!this.isPlaying || !this.ctx) return;

      const elapsed = this.ctx.currentTime - this.playbackStartTime;
      let currentPos = this.playheadStartOffset + elapsed;

      // Handle looping
      if (project.loopEnabled && loopEndSec > loopStartSec) {
        if (currentPos >= loopEndSec) {
          // Wrap back to loop start
          this.stopSources();
          this.playheadPosition = loopStartSec;
          this.playbackStartTime = this.ctx.currentTime;
          this.playheadStartOffset = loopStartSec;
          this.scheduleClipsFrom(loopStartSec, project);
          currentPos = loopStartSec;
        }
      }

      this.playheadPosition = currentPos;
      this.onPlayheadUpdateCallback?.(currentPos);

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private stopPlayheadLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

// Singleton audio engine instance
export const audioEngine = new AudioEngine();
