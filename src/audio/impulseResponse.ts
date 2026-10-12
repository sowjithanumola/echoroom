/**
 * Generates an algorithmic stereo impulse response for Web Audio ConvolverNode.
 */
export function createImpulseResponse(
  audioCtx: BaseAudioContext,
  duration = 2.0,
  decay = 2.0,
  reverse = false
): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = audioCtx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = reverse ? length - i : i;
    // Exponential decay curve
    const envelope = Math.pow(1 - n / length, decay);
    // Random noise with slight stereo divergence
    const leftNoise = (Math.random() * 2 - 1) * envelope;
    const rightNoise = (Math.random() * 2 - 1) * envelope;

    // Early reflections emulation (first 80ms)
    let earlyLeft = 0;
    let earlyRight = 0;
    if (i < sampleRate * 0.08) {
      if (i % 300 === 0) earlyLeft = (Math.random() * 2 - 1) * 0.4;
      if (i % 380 === 0) earlyRight = (Math.random() * 2 - 1) * 0.4;
    }

    left[i] = leftNoise * 0.8 + earlyLeft;
    right[i] = rightNoise * 0.8 + earlyRight;
  }

  return impulse;
}
