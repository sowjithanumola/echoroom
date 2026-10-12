import { AutomationPoint } from '../types/daw';

/**
 * Sorts automation points by timeFraction ascending.
 */
export function getSortedPoints(points: AutomationPoint[] = []): AutomationPoint[] {
  return [...points].sort((a, b) => a.timeFraction - b.timeFraction);
}

/**
 * Interpolates automation value at a given timeFraction (0 to 1).
 */
export function getInterpolatedValue(
  points: AutomationPoint[] | undefined,
  timeFraction: number,
  defaultValue: number
): number {
  if (!points || points.length === 0) return defaultValue;

  const sorted = getSortedPoints(points);

  if (timeFraction <= sorted[0].timeFraction) {
    return sorted[0].value;
  }
  if (timeFraction >= sorted[sorted.length - 1].timeFraction) {
    return sorted[sorted.length - 1].value;
  }

  // Find surrounding points
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    if (timeFraction >= p1.timeFraction && timeFraction <= p2.timeFraction) {
      const range = p2.timeFraction - p1.timeFraction;
      if (range <= 0.0001) return p2.value;
      const t = (timeFraction - p1.timeFraction) / range;
      // Linear interpolation
      return p1.value + (p2.value - p1.value) * t;
    }
  }

  return defaultValue;
}

/**
 * Schedules an automation curve onto an AudioParam (GainNode.gain or StereoPannerNode.pan)
 * accurately across time, handling starting playback midway through a clip.
 */
export function applyAutomationToParam(
  param: AudioParam,
  points: AutomationPoint[] | undefined,
  defaultValue: number,
  scaleMultiplier: number, // e.g. clip.volume for gain, 1.0 for pan
  clipStartCtxTime: number, // AudioContext time when clip begins (can be in the past)
  clipDurationSeconds: number,
  scheduledStartCtxTime: number, // AudioContext time when playback actually starts
  clipOffsetSeconds: number // offset into the clip where playback begins
) {
  if (!points || points.length === 0) {
    param.setValueAtTime(defaultValue * scaleMultiplier, scheduledStartCtxTime);
    return;
  }

  const sorted = getSortedPoints(points);

  // Time fraction where playback starts
  const startFraction = Math.max(0, Math.min(1, clipOffsetSeconds / clipDurationSeconds));
  const initialValue = getInterpolatedValue(sorted, startFraction, defaultValue) * scaleMultiplier;

  param.cancelScheduledValues(scheduledStartCtxTime);
  param.setValueAtTime(initialValue, scheduledStartCtxTime);

  // Ramp through any future points that occur after startFraction
  for (const pt of sorted) {
    if (pt.timeFraction > startFraction) {
      const ptTimeOffset = pt.timeFraction * clipDurationSeconds - clipOffsetSeconds;
      const targetCtxTime = scheduledStartCtxTime + ptTimeOffset;
      const targetVal = pt.value * scaleMultiplier;
      try {
        param.linearRampToValueAtTime(targetVal, targetCtxTime);
      } catch {
        param.setValueAtTime(targetVal, targetCtxTime);
      }
    }
  }
}

/**
 * Pre-baked automation presets for volume
 */
export const VOLUME_PRESETS: Record<string, AutomationPoint[]> = {
  'Fade In': [
    { id: 'p0', timeFraction: 0, value: 0 },
    { id: 'p1', timeFraction: 1, value: 1.0 },
  ],
  'Fade Out': [
    { id: 'p0', timeFraction: 0, value: 1.0 },
    { id: 'p1', timeFraction: 1, value: 0 },
  ],
  'Sidechain Dip': [
    { id: 'p0', timeFraction: 0, value: 0.1 },
    { id: 'p1', timeFraction: 0.25, value: 1.0 },
    { id: 'p2', timeFraction: 0.5, value: 0.1 },
    { id: 'p3', timeFraction: 0.75, value: 1.0 },
  ],
  'Reset Flat': [
    { id: 'p0', timeFraction: 0, value: 1.0 },
    { id: 'p1', timeFraction: 1, value: 1.0 },
  ],
};

/**
 * Pre-baked automation presets for pan
 */
export const PAN_PRESETS: Record<string, AutomationPoint[]> = {
  'Left to Right': [
    { id: 'p0', timeFraction: 0, value: -1.0 },
    { id: 'p1', timeFraction: 1, value: 1.0 },
  ],
  'Right to Left': [
    { id: 'p0', timeFraction: 0, value: 1.0 },
    { id: 'p1', timeFraction: 1, value: -1.0 },
  ],
  'Ping Pong': [
    { id: 'p0', timeFraction: 0, value: -0.8 },
    { id: 'p1', timeFraction: 0.25, value: 0.8 },
    { id: 'p2', timeFraction: 0.5, value: -0.8 },
    { id: 'p3', timeFraction: 0.75, value: 0.8 },
    { id: 'p4', timeFraction: 1.0, value: 0 },
  ],
  'Reset Center': [
    { id: 'p0', timeFraction: 0, value: 0 },
    { id: 'p1', timeFraction: 1, value: 0 },
  ],
};
