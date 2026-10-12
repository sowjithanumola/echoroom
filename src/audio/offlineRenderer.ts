import { Project } from '../types/daw';
import { createImpulseResponse } from './impulseResponse';
import { applyAutomationToParam } from './automation';

/**
 * Encodes an AudioBuffer into standard 16-bit PCM Stereo WAV binary blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length;
  const dataByteLength = length * blockAlign;
  const wavHeaderLength = 44;
  const totalLength = wavHeaderLength + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(0, 'RIFF');
  // File length minus RIFF identifier and length specifier
  view.setUint32(4, 36 + dataByteLength, true);
  // RIFF type
  writeString(8, 'WAVE');
  // format chunk identifier
  writeString(12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, format, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * blockAlign, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(36, 'data');
  // data chunk length
  view.setUint32(40, dataByteLength, true);

  // Write interleaved PCM samples
  const left = buffer.getChannelData(0);
  const right = numChannels > 1 ? buffer.getChannelData(1) : left;

  let offset = 44;
  for (let i = 0; i < length; i++) {
    // Left channel
    let sampleL = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7fff, true);
    offset += 2;

    // Right channel
    if (numChannels > 1) {
      let sampleR = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Deterministically renders an entire DAW project to an AudioBuffer using OfflineAudioContext.
 */
export async function renderProjectOffline(
  project: Project,
  buffers: Map<string, AudioBuffer>,
  options?: {
    startSeconds?: number;
    endSeconds?: number;
    sampleRate?: number;
  }
): Promise<{ buffer: AudioBuffer; wavBlob: Blob }> {
  const sampleRate = options?.sampleRate || 44100;
  
  // Calculate total duration from tracks or bars
  const secondsPerBeat = 60 / project.bpm;
  const beatsPerBar = project.timeSignature[0] || 4;
  const totalProjectSeconds = project.durationBars * beatsPerBar * secondsPerBeat;

  let maxClipEnd = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const clipEnd = clip.startSeconds + clip.durationSeconds;
      if (clipEnd > maxClipEnd) maxClipEnd = clipEnd;
    }
  }

  const renderStart = options?.startSeconds ?? 0;
  // Render at least up to the end of the clips or 4 bars minimum, plus 1.5s reverb tail
  const renderEnd = options?.endSeconds ?? Math.max(maxClipEnd + 1.5, Math.min(totalProjectSeconds, 16 * beatsPerBar * secondsPerBeat));
  const renderDuration = Math.max(1, renderEnd - renderStart);

  const totalFrames = Math.ceil(renderDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  // Master output chain
  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(project.masterVolume, 0);

  // Master Pan
  if (offlineCtx.createStereoPanner) {
    const masterPanner = offlineCtx.createStereoPanner();
    masterPanner.pan.setValueAtTime(Math.max(-1, Math.min(1, project.masterPan || 0)), 0);
    masterGain.connect(masterPanner);
    masterPanner.connect(offlineCtx.destination);
  } else {
    masterGain.connect(offlineCtx.destination);
  }

  // Pre-generate reverb impulse for offline context
  const reverbImpulse = createImpulseResponse(offlineCtx, 2.5, 2.0);

  // Solo logic
  const hasSolo = project.tracks.some((t) => t.soloed);

  // Construct audio graph for each track
  for (const track of project.tracks) {
    const isAudible = hasSolo ? track.soloed : !track.muted;
    if (!isAudible) continue;

    const trackGain = offlineCtx.createGain();
    trackGain.gain.setValueAtTime(track.volume, 0);

    // Track Pan
    let trackOut: AudioNode = trackGain;
    if (offlineCtx.createStereoPanner) {
      const panner = offlineCtx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan || 0)), 0);
      trackGain.connect(panner);
      trackOut = panner;
    }

    // EQ Filter Chain: Low shelf -> Mid peaking -> High shelf
    const lowShelf = offlineCtx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.setValueAtTime(250, 0);
    lowShelf.gain.setValueAtTime(track.effects?.eq?.low || 0, 0);

    const midPeak = offlineCtx.createBiquadFilter();
    midPeak.type = 'peaking';
    midPeak.frequency.setValueAtTime(track.effects?.eq?.midFreq || 1000, 0);
    midPeak.Q.setValueAtTime(1.0, 0);
    midPeak.gain.setValueAtTime(track.effects?.eq?.mid || 0, 0);

    const highShelf = offlineCtx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.setValueAtTime(4500, 0);
    highShelf.gain.setValueAtTime(track.effects?.eq?.high || 0, 0);

    // Delay FX
    const delayMix = track.effects?.delay?.mix || 0;
    const delayNode = offlineCtx.createDelay(2.0);
    delayNode.delayTime.setValueAtTime(track.effects?.delay?.time || 0.3, 0);
    const delayFeedback = offlineCtx.createGain();
    delayFeedback.gain.setValueAtTime(track.effects?.delay?.feedback || 0.3, 0);
    const delayWetGain = offlineCtx.createGain();
    delayWetGain.gain.setValueAtTime(delayMix, 0);

    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayWetGain);

    // Reverb FX
    const reverbMix = track.effects?.reverb?.mix || 0;
    const convolver = offlineCtx.createConvolver();
    convolver.buffer = reverbImpulse;
    const reverbWetGain = offlineCtx.createGain();
    reverbWetGain.gain.setValueAtTime(reverbMix, 0);
    convolver.connect(reverbWetGain);

    // Chain: Track input -> LowShelf -> MidPeak -> HighShelf -> Dry/Effects -> trackGain
    const trackInputNode = offlineCtx.createGain();
    trackInputNode.connect(lowShelf);
    lowShelf.connect(midPeak);
    midPeak.connect(highShelf);

    // Dry path
    highShelf.connect(trackGain);

    // Send to Delay
    if (delayMix > 0.001) {
      highShelf.connect(delayNode);
      delayWetGain.connect(trackGain);
    }

    // Send to Reverb
    if (reverbMix > 0.001) {
      highShelf.connect(convolver);
      reverbWetGain.connect(trackGain);
    }

    trackOut.connect(masterGain);

    // Schedule clips for this track
    for (const clip of track.clips) {
      const audioBuffer = buffers.get(clip.bufferId);
      if (!audioBuffer) continue;

      const clipStart = clip.startSeconds - renderStart;
      const clipDuration = clip.durationSeconds;
      const clipOffset = clip.offsetSeconds || 0;

      // Only schedule if within render window
      if (clipStart + clipDuration <= 0) continue;
      if (clipStart >= renderDuration) continue;

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      const clipGain = offlineCtx.createGain();

      const scheduledStartCtxTime = Math.max(0, clipStart);
      const clipTimeOffsetSec = clipStart < 0 ? -clipStart : 0;
      const clipVirtualStartCtx = scheduledStartCtxTime - clipTimeOffsetSec;

      // Apply Volume Automation
      applyAutomationToParam(
        clipGain.gain,
        clip.automation?.volume,
        1.0,
        clip.volume ?? 1.0,
        clipVirtualStartCtx,
        clip.durationSeconds,
        scheduledStartCtxTime,
        clipTimeOffsetSec
      );

      source.connect(clipGain);

      let lastNode: AudioNode = clipGain;
      if (offlineCtx.createStereoPanner && clip.automation?.pan && clip.automation.pan.length > 0) {
        const clipPanner = offlineCtx.createStereoPanner();
        applyAutomationToParam(
          clipPanner.pan,
          clip.automation.pan,
          0.0,
          1.0,
          clipVirtualStartCtx,
          clip.durationSeconds,
          scheduledStartCtxTime,
          clipTimeOffsetSec
        );
        clipGain.connect(clipPanner);
        lastNode = clipPanner;
      }

      lastNode.connect(trackInputNode);

      if (clipStart >= 0) {
        source.start(clipStart, clipOffset, clipDuration);
      } else {
        // Clip started before renderStart
        const trimmedOffset = clipOffset + (-clipStart);
        const trimmedDuration = clipDuration - (-clipStart);
        if (trimmedDuration > 0) {
          source.start(0, trimmedOffset, trimmedDuration);
        }
      }
    }
  }

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);

  return { buffer: renderedBuffer, wavBlob };
}
