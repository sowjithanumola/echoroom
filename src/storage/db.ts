import { Project, StoredAudioBuffer } from '../types/daw';
import { renderDrumPatternToBuffer } from '../audio/drumSynth';
import { renderSynthSequenceToBuffer } from '../audio/synthEngine';
import { extractPeaks } from '../audio/waveforms';

const DB_NAME = 'echoroom_studio_v1';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_BUFFERS = 'buffers';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BUFFERS)) {
        db.createObjectStore(STORE_BUFFERS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProjectToDB(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.put({ ...project, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadProjectFromDB(id: string): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listProjectsFromDB(): Promise<Array<{ id: string; name: string; updatedAt: number }>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result || []).map((p: Project) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
      }));
      resolve(list.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudioBufferToDB(id: string, name: string, buffer: AudioBuffer): Promise<void> {
  const db = await openDB();
  const channelData: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }
  const peaks = extractPeaks(buffer, 160);

  const stored: StoredAudioBuffer = {
    id,
    name,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    channelData,
    peaks,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BUFFERS, 'readwrite');
    const store = tx.objectStore(STORE_BUFFERS);
    const req = store.put(stored);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadAudioBufferFromDB(id: string, audioCtx: BaseAudioContext): Promise<AudioBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BUFFERS, 'readonly');
    const store = tx.objectStore(STORE_BUFFERS);
    const req = store.get(id);
    req.onsuccess = () => {
      const stored = req.result as StoredAudioBuffer | undefined;
      if (!stored) {
        resolve(null);
        return;
      }
      try {
        const length = Math.floor(stored.duration * stored.sampleRate);
        const buffer = audioCtx.createBuffer(stored.numberOfChannels, length, stored.sampleRate);
        for (let c = 0; c < stored.numberOfChannels; c++) {
          const ch = buffer.getChannelData(c);
          ch.set(stored.channelData[c]);
        }
        resolve(buffer);
      } catch (err) {
        console.error('Failed to rebuild buffer:', err);
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Creates the rich default initial demo project "CYBER ECHOES"
 * Generates programmatic drum loops and synth tracks so audio works out-of-the-box!
 */
export async function createDemoProject(): Promise<{ project: Project; buffers: Map<string, AudioBuffer> }> {
  const bpm = 120;
  const secondsPerBeat = 60 / bpm;
  const barSeconds = 4 * secondsPerBeat; // 2.0s per bar at 120 BPM
  const buffers = new Map<string, AudioBuffer>();

  // 1. Drum Beat Pattern
  const drumPattern = {
    kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    hihatClosed: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    hihatOpen: [false, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false],
    clap: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    perc: [false, false, true, false, false, false, false, true, false, false, true, false, false, true, false, false],
  };

  const drumBuffer = await renderDrumPatternToBuffer(drumPattern, bpm, 0.15, 2);
  const drumBufferId = 'buf_demo_drums';
  buffers.set(drumBufferId, drumBuffer);

  // 2. Synth Chords Pattern (Am - F - C - G)
  const synthChords = [
    // Am chord (beats 0 - 2)
    { note: 57, startBeat: 0, durationBeats: 1.8, velocity: 0.75 }, // A3
    { note: 60, startBeat: 0, durationBeats: 1.8, velocity: 0.75 }, // C4
    { note: 64, startBeat: 0, durationBeats: 1.8, velocity: 0.75 }, // E4
    // F chord (beats 2 - 4)
    { note: 53, startBeat: 2, durationBeats: 1.8, velocity: 0.75 }, // F3
    { note: 57, startBeat: 2, durationBeats: 1.8, velocity: 0.75 }, // A3
    { note: 60, startBeat: 2, durationBeats: 1.8, velocity: 0.75 }, // C4
    // C chord (beats 4 - 6)
    { note: 48, startBeat: 4, durationBeats: 1.8, velocity: 0.75 }, // C3
    { note: 52, startBeat: 4, durationBeats: 1.8, velocity: 0.75 }, // E3
    { note: 55, startBeat: 4, durationBeats: 1.8, velocity: 0.75 }, // G3
    // G chord (beats 6 - 8)
    { note: 55, startBeat: 6, durationBeats: 1.8, velocity: 0.75 }, // G3
    { note: 59, startBeat: 6, durationBeats: 1.8, velocity: 0.75 }, // B3
    { note: 62, startBeat: 6, durationBeats: 1.8, velocity: 0.75 }, // D4
  ];

  const chordsBuffer = await renderSynthSequenceToBuffer(
    synthChords,
    {
      waveform: 'sawtooth',
      attack: 0.04,
      decay: 0.3,
      sustain: 0.65,
      release: 0.45,
      cutoff: 2800,
      resonance: 2.2,
      octave: 0,
      volume: 0.6,
    },
    bpm,
    8
  );
  const chordsBufferId = 'buf_demo_chords';
  buffers.set(chordsBufferId, chordsBuffer);

  // 3. Bassline pattern (Driving 8th notes)
  const bassNotes = [
    { note: 45, startBeat: 0, durationBeats: 0.4, velocity: 0.85 }, // A2
    { note: 45, startBeat: 0.5, durationBeats: 0.4, velocity: 0.8 },
    { note: 45, startBeat: 1.0, durationBeats: 0.4, velocity: 0.85 },
    { note: 48, startBeat: 1.5, durationBeats: 0.4, velocity: 0.8 }, // C3
    { note: 41, startBeat: 2, durationBeats: 0.4, velocity: 0.85 }, // F2
    { note: 41, startBeat: 2.5, durationBeats: 0.4, velocity: 0.8 },
    { note: 41, startBeat: 3.0, durationBeats: 0.4, velocity: 0.85 },
    { note: 43, startBeat: 3.5, durationBeats: 0.4, velocity: 0.8 }, // G2
    { note: 36, startBeat: 4, durationBeats: 0.4, velocity: 0.85 }, // C2
    { note: 36, startBeat: 4.5, durationBeats: 0.4, velocity: 0.8 },
    { note: 36, startBeat: 5.0, durationBeats: 0.4, velocity: 0.85 },
    { note: 38, startBeat: 5.5, durationBeats: 0.4, velocity: 0.8 }, // D2
    { note: 43, startBeat: 6, durationBeats: 0.4, velocity: 0.85 }, // G2
    { note: 43, startBeat: 6.5, durationBeats: 0.4, velocity: 0.8 },
    { note: 43, startBeat: 7.0, durationBeats: 0.4, velocity: 0.85 },
    { note: 45, startBeat: 7.5, durationBeats: 0.4, velocity: 0.8 }, // A2
  ];

  const bassBuffer = await renderSynthSequenceToBuffer(
    bassNotes,
    {
      waveform: 'square',
      attack: 0.01,
      decay: 0.15,
      sustain: 0.4,
      release: 0.1,
      cutoff: 950,
      resonance: 4.5,
      octave: -1,
      volume: 0.7,
    },
    bpm,
    8
  );
  const bassBufferId = 'buf_demo_bass';
  buffers.set(bassBufferId, bassBuffer);

  // 4. Arpeggiated Lead Melody
  const leadNotes = [
    { note: 69, startBeat: 0.25, durationBeats: 0.2, velocity: 0.8 }, // A4
    { note: 72, startBeat: 0.75, durationBeats: 0.2, velocity: 0.8 }, // C5
    { note: 76, startBeat: 1.25, durationBeats: 0.3, velocity: 0.9 }, // E5
    { note: 79, startBeat: 1.75, durationBeats: 0.2, velocity: 0.85 }, // G5
    { note: 77, startBeat: 2.25, durationBeats: 0.3, velocity: 0.85 }, // F5
    { note: 72, startBeat: 2.75, durationBeats: 0.2, velocity: 0.8 },
    { note: 74, startBeat: 3.25, durationBeats: 0.3, velocity: 0.85 }, // D5
    { note: 76, startBeat: 3.75, durationBeats: 0.2, velocity: 0.8 },
    { note: 72, startBeat: 4.25, durationBeats: 0.2, velocity: 0.8 }, // C5
    { note: 76, startBeat: 4.75, durationBeats: 0.2, velocity: 0.85 },
    { note: 79, startBeat: 5.25, durationBeats: 0.3, velocity: 0.9 },
    { note: 81, startBeat: 5.75, durationBeats: 0.2, velocity: 0.9 }, // A5
    { note: 79, startBeat: 6.25, durationBeats: 0.3, velocity: 0.85 }, // G5
    { note: 76, startBeat: 6.75, durationBeats: 0.2, velocity: 0.8 },
    { note: 74, startBeat: 7.25, durationBeats: 0.3, velocity: 0.85 },
    { note: 72, startBeat: 7.75, durationBeats: 0.2, velocity: 0.8 },
  ];

  const leadBuffer = await renderSynthSequenceToBuffer(
    leadNotes,
    {
      waveform: 'triangle',
      attack: 0.02,
      decay: 0.2,
      sustain: 0.5,
      release: 0.25,
      cutoff: 3500,
      resonance: 3.0,
      octave: 0,
      volume: 0.65,
    },
    bpm,
    8
  );
  const leadBufferId = 'buf_demo_lead';
  buffers.set(leadBufferId, leadBuffer);

  const loop2Bars = barSeconds * 2; // 4.0s
  const loop4Bars = barSeconds * 4; // 8.0s

  const project: Project = {
    id: 'proj_demo_cyber_echoes',
    name: 'Cyber Echoes (Demo Project)',
    bpm,
    timeSignature: [4, 4],
    durationBars: 32,
    masterVolume: 1.0,
    masterPan: 0,
    loopEnabled: true,
    loopStartBar: 0,
    loopEndBar: 8,
    updatedAt: Date.now(),
    tracks: [
      {
        id: 'track_drums',
        name: 'Drums (808 Lab)',
        type: 'drums',
        color: '#06b6d4', // cyan
        volume: 0.95,
        pan: 0,
        muted: false,
        soloed: false,
        effects: {
          eq: { low: 2, mid: -1, high: 2, midFreq: 1200 },
          delay: { time: 0.25, feedback: 0.2, mix: 0.05 },
          reverb: { decay: 1.5, mix: 0.1 },
        },
        clips: [
          {
            id: 'clip_drums_1',
            name: '808 Groove Part A',
            trackId: 'track_drums',
            startSeconds: 0,
            durationSeconds: loop2Bars,
            offsetSeconds: 0,
            bufferId: drumBufferId,
            volume: 1.0,
            peaks: extractPeaks(drumBuffer, 120),
          },
          {
            id: 'clip_drums_2',
            name: '808 Groove Part A',
            trackId: 'track_drums',
            startSeconds: loop2Bars,
            durationSeconds: loop2Bars,
            offsetSeconds: 0,
            bufferId: drumBufferId,
            volume: 1.0,
            peaks: extractPeaks(drumBuffer, 120),
          },
          {
            id: 'clip_drums_3',
            name: '808 Groove Part B',
            trackId: 'track_drums',
            startSeconds: loop4Bars,
            durationSeconds: loop2Bars,
            offsetSeconds: 0,
            bufferId: drumBufferId,
            volume: 1.0,
            peaks: extractPeaks(drumBuffer, 120),
          },
          {
            id: 'clip_drums_4',
            name: '808 Groove Part B',
            trackId: 'track_drums',
            startSeconds: loop4Bars + loop2Bars,
            durationSeconds: loop2Bars,
            offsetSeconds: 0,
            bufferId: drumBufferId,
            volume: 1.0,
            peaks: extractPeaks(drumBuffer, 120),
          },
        ],
      },
      {
        id: 'track_bass',
        name: 'Sub Bass 01',
        type: 'synth',
        color: '#8b5cf6', // violet
        volume: 0.9,
        pan: 0,
        muted: false,
        soloed: false,
        effects: {
          eq: { low: 3.5, mid: 0, high: -2, midFreq: 800 },
          delay: { time: 0.3, feedback: 0.1, mix: 0 },
          reverb: { decay: 1.2, mix: 0.05 },
        },
        clips: [
          {
            id: 'clip_bass_1',
            name: 'Rolling Bassline',
            trackId: 'track_bass',
            startSeconds: 0,
            durationSeconds: loop4Bars,
            offsetSeconds: 0,
            bufferId: bassBufferId,
            volume: 1.0,
            peaks: extractPeaks(bassBuffer, 120),
          },
          {
            id: 'clip_bass_2',
            name: 'Rolling Bassline',
            trackId: 'track_bass',
            startSeconds: loop4Bars,
            durationSeconds: loop4Bars,
            offsetSeconds: 0,
            bufferId: bassBufferId,
            volume: 1.0,
            peaks: extractPeaks(bassBuffer, 120),
          },
        ],
      },
      {
        id: 'track_chords',
        name: 'Atmospheric Poly',
        type: 'synth',
        color: '#ec4899', // pink/magenta
        volume: 0.75,
        pan: -0.2,
        muted: false,
        soloed: false,
        automationMode: 'volume',
        effects: {
          eq: { low: -1, mid: 1, high: 2.5, midFreq: 1500 },
          delay: { time: 0.375, feedback: 0.35, mix: 0.25 },
          reverb: { decay: 2.8, mix: 0.32 },
        },
        clips: [
          {
            id: 'clip_chords_1',
            name: 'Progression Am-F-C-G',
            trackId: 'track_chords',
            startSeconds: 0,
            durationSeconds: loop4Bars,
            offsetSeconds: 0,
            bufferId: chordsBufferId,
            volume: 1.0,
            peaks: extractPeaks(chordsBuffer, 120),
            automation: {
              volume: [
                { id: 'c1_v0', timeFraction: 0, value: 0.2 },
                { id: 'c1_v1', timeFraction: 0.25, value: 1.0 },
                { id: 'c1_v2', timeFraction: 0.5, value: 0.65 },
                { id: 'c1_v3', timeFraction: 0.75, value: 1.15 },
                { id: 'c1_v4', timeFraction: 1.0, value: 0.85 },
              ],
              pan: [
                { id: 'c1_p0', timeFraction: 0, value: -0.5 },
                { id: 'c1_p1', timeFraction: 0.5, value: 0.5 },
                { id: 'c1_p2', timeFraction: 1.0, value: -0.5 },
              ],
            },
          },
          {
            id: 'clip_chords_2',
            name: 'Progression Am-F-C-G',
            trackId: 'track_chords',
            startSeconds: loop4Bars,
            durationSeconds: loop4Bars,
            offsetSeconds: 0,
            bufferId: chordsBufferId,
            volume: 1.0,
            peaks: extractPeaks(chordsBuffer, 120),
            automation: {
              volume: [
                { id: 'c2_v0', timeFraction: 0, value: 0.85 },
                { id: 'c2_v1', timeFraction: 0.5, value: 1.2 },
                { id: 'c2_v2', timeFraction: 1.0, value: 0.1 },
              ],
            },
          },
        ],
      },
      {
        id: 'track_lead',
        name: 'Cyber Arp Lead',
        type: 'synth',
        color: '#10b981', // emerald
        volume: 0.8,
        pan: 0.25,
        muted: false,
        soloed: false,
        automationMode: 'pan',
        effects: {
          eq: { low: -3, mid: 2, high: 3, midFreq: 2200 },
          delay: { time: 0.25, feedback: 0.4, mix: 0.3 },
          reverb: { decay: 2.2, mix: 0.35 },
        },
        clips: [
          {
            id: 'clip_lead_1',
            name: 'Arp Melody Hook',
            trackId: 'track_lead',
            startSeconds: loop2Bars, // enters at bar 2
            durationSeconds: loop2Bars,
            offsetSeconds: loop2Bars,
            bufferId: leadBufferId,
            volume: 1.0,
            peaks: extractPeaks(leadBuffer, 120),
            automation: {
              pan: [
                { id: 'l1_p0', timeFraction: 0, value: -0.8 },
                { id: 'l1_p1', timeFraction: 0.5, value: 0.8 },
                { id: 'l1_p2', timeFraction: 1.0, value: -0.8 },
              ],
            },
          },
          {
            id: 'clip_lead_2',
            name: 'Arp Melody Hook',
            trackId: 'track_lead',
            startSeconds: loop4Bars,
            durationSeconds: loop4Bars,
            offsetSeconds: 0,
            bufferId: leadBufferId,
            volume: 1.0,
            peaks: extractPeaks(leadBuffer, 120),
            automation: {
              pan: [
                { id: 'l2_p0', timeFraction: 0, value: 0.7 },
                { id: 'l2_p1', timeFraction: 0.33, value: -0.7 },
                { id: 'l2_p2', timeFraction: 0.66, value: 0.7 },
                { id: 'l2_p3', timeFraction: 1.0, value: 0 },
              ],
            },
          },
        ],
      },
    ],
  };

  return { project, buffers };
}
