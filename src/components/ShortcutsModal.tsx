import React, { useState } from 'react';
import { X, Search, Command, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  action: string;
  category: 'Playback' | 'Editing' | 'Navigation' | 'Project';
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts: ShortcutItem[] = [
    // Playback
    { keys: ['Space'], action: 'Play / Pause playback', category: 'Playback' },
    { keys: ['Esc'], action: 'Stop & rewind or close dialogs', category: 'Playback' },
    { keys: ['Home'], action: 'Return playhead to project start (0:00)', category: 'Playback' },
    { keys: ['L'], action: 'Toggle loop playback mode', category: 'Playback' },

    // Editing
    { keys: ['Click'], action: 'Select clip', category: 'Editing' },
    { keys: ['Shift / ' + modKey, 'Click'], action: 'Select multiple clips', category: 'Editing' },
    { keys: ['Drag'], action: 'Move clip horizontally or vertically across tracks', category: 'Editing' },
    { keys: ['Shift / Alt', 'Drag'], action: 'Disable grid snap (free positioning)', category: 'Editing' },
    { keys: ['S'], action: 'Split selected clip at current playhead', category: 'Editing' },
    { keys: [modKey, 'D'], action: 'Duplicate selected clip(s)', category: 'Editing' },
    { keys: ['Del / ⌫'], action: 'Delete selected clip(s)', category: 'Editing' },
    { keys: ['M'], action: 'Mute / unmute active track', category: 'Editing' },

    // Project & Import
    { keys: [modKey, 'O'], action: 'Import Audio (WAV, MP3, OGG, FLAC)', category: 'Project' },
    { keys: [modKey, 'S'], action: 'Save project to IndexedDB', category: 'Project' },
    { keys: ['Drag from Desktop'], action: 'Drop audio files directly onto timeline', category: 'Project' },
    { keys: ['?'], action: 'Show this keyboard shortcuts guide', category: 'Project' },

    // Navigation
    { keys: [modKey, 'Z'], action: 'Undo last edit', category: 'Navigation' },
    { keys: [modKey, isMac ? '⇧ Z' : 'Y'], action: 'Redo last edit', category: 'Navigation' },
    { keys: ['+ / ='], action: 'Zoom in timeline', category: 'Navigation' },
    { keys: ['- / _'], action: 'Zoom out timeline', category: 'Navigation' },
  ];

  const filtered = shortcuts.filter(
    (s) =>
      s.action.toLowerCase().includes(search.toLowerCase()) ||
      s.keys.some((k) => k.toLowerCase().includes(search.toLowerCase())) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories: ShortcutItem['category'][] = ['Playback', 'Editing', 'Navigation', 'Project'];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#121622] border border-[#232c3f] rounded-xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
      >
        {/* Header */}
        <div className="h-14 border-b border-[#21293a] px-6 flex items-center justify-between bg-[#151a28]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">KEYBOARD SHORTCUTS</h2>
              <p className="text-[11px] text-slate-400">Master studio workflows with tactile shortcuts</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-[#1f283a] bg-[#0e121a]">
          <div className="flex items-center gap-2 bg-[#151b27] border border-[#232d3f] rounded-lg px-3 py-1.5 focus-within:border-cyan-500">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shortcuts (e.g. split, zoom, duplicate, import)..."
              autoFocus
              className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 bg-[#0c0f16]">
          {categories.map((cat) => {
            const catShortcuts = filtered.filter((s) => s.category === cat);
            if (catShortcuts.length === 0) return null;

            return (
              <div key={cat} className="flex flex-col gap-2">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                  {cat}
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {catShortcuts.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 bg-[#141926] border border-[#20293b] rounded-lg text-xs"
                    >
                      <span className="text-slate-300 font-medium">{s.action}</span>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {s.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-0.5 bg-[#0b0e14] border border-[#29354d] text-cyan-300 font-mono text-[10px] font-bold rounded shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-xs">
              No shortcuts matching &quot;{search}&quot;
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 border-t border-[#21293a] px-6 bg-[#151a28] flex items-center justify-between text-[11px] text-slate-400">
          <span>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-white text-[10px]">?</kbd> anywhere to open</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#1e2638] text-slate-200 hover:text-white font-medium text-xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
