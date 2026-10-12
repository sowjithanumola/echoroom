/**
 * Extracts normalized peak values from an AudioBuffer for rendering waveforms.
 */
export function extractPeaks(buffer: AudioBuffer, numPeaks = 120): number[] {
  const peaks: number[] = new Array(numPeaks).fill(0);
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const blockSize = Math.floor(length / numPeaks);

  if (blockSize === 0) return peaks;

  for (let c = 0; c < numChannels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < numPeaks; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, length);
      let max = 0;
      for (let j = start; j < end; j += 4) { // step by 4 for high performance
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      peaks[i] = Math.max(peaks[i], max);
    }
  }

  // Normalize peaks so highest is 1.0 (if above 0)
  let peakMax = 0;
  for (let i = 0; i < numPeaks; i++) {
    if (peaks[i] > peakMax) peakMax = peaks[i];
  }

  if (peakMax > 0) {
    for (let i = 0; i < numPeaks; i++) {
      peaks[i] = Math.min(1.0, peaks[i] / peakMax);
    }
  }

  return peaks;
}
