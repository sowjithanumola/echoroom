import React, { useState, useRef, useCallback } from 'react';
import { AutomationPoint } from '../types/daw';
import {
  getSortedPoints,
  VOLUME_PRESETS,
  PAN_PRESETS,
} from '../audio/automation';
import { Sliders, Sparkles, RotateCcw, X } from 'lucide-react';

interface AutomationLaneProps {
  type: 'volume' | 'pan';
  points?: AutomationPoint[];
  clipDuration: number;
  widthPx: number;
  heightPx: number;
  onChange: (points: AutomationPoint[]) => void;
}

export const AutomationLane: React.FC<AutomationLaneProps> = ({
  type,
  points: rawPoints,
  clipDuration,
  widthPx,
  heightPx,
  onChange,
}) => {
  const containerRef = useRef<SVGSVGElement | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Fallback default points if empty
  const defaultPoints: AutomationPoint[] =
    type === 'volume'
      ? [
          { id: 'p_start', timeFraction: 0, value: 1.0 },
          { id: 'p_end', timeFraction: 1.0, value: 1.0 },
        ]
      : [
          { id: 'p_start', timeFraction: 0, value: 0 },
          { id: 'p_end', timeFraction: 1.0, value: 0 },
        ];

  const points = rawPoints && rawPoints.length > 0 ? getSortedPoints(rawPoints) : defaultPoints;

  // Map value to Y pixel:
  // Volume: 0.0 to 1.5 (0 at heightPx - 4, 1.0 at ~33% from top, 1.5 at 4px)
  // Pan: -1.0 to +1.0 (-1.0 at 4px top = Left, 0 at heightPx / 2 = Center, +1.0 at heightPx - 4 = Right)
  const valueToY = useCallback(
    (val: number): number => {
      const pad = 6;
      const usableH = heightPx - pad * 2;
      if (type === 'volume') {
        const clamped = Math.max(0, Math.min(1.5, val));
        const fraction = clamped / 1.5;
        return heightPx - pad - fraction * usableH;
      } else {
        // Pan: -1.0 (top) to +1.0 (bottom)
        const clamped = Math.max(-1.0, Math.min(1.0, val));
        const norm = (clamped + 1.0) / 2.0; // 0 (left/top) to 1 (right/bottom)
        return pad + norm * usableH;
      }
    },
    [heightPx, type]
  );

  const yToValue = useCallback(
    (y: number): number => {
      const pad = 6;
      const usableH = heightPx - pad * 2;
      if (type === 'volume') {
        const fraction = (heightPx - pad - y) / usableH;
        return Math.max(0, Math.min(1.5, fraction * 1.5));
      } else {
        const norm = (y - pad) / usableH;
        return Math.max(-1.0, Math.min(1.0, norm * 2.0 - 1.0));
      }
    },
    [heightPx, type]
  );

  const fractionToX = useCallback(
    (frac: number): number => {
      return Math.max(0, Math.min(widthPx, frac * widthPx));
    },
    [widthPx]
  );

  const xToFraction = useCallback(
    (x: number): number => {
      return Math.max(0, Math.min(1.0, x / widthPx));
    },
    [widthPx]
  );

  // Format value for display tooltip
  const formatValueTooltip = (val: number, frac: number): string => {
    const timeSec = (frac * clipDuration).toFixed(2);
    if (type === 'volume') {
      const pct = Math.round(val * 100);
      const db = val > 0.001 ? (20 * Math.log10(val)).toFixed(1) : '-inf';
      return `Vol: ${pct}% (${db} dB) · ${timeSec}s`;
    } else {
      if (Math.abs(val) < 0.05) return `Pan: Center · ${timeSec}s`;
      if (val < 0) return `Pan: ${Math.round(Math.abs(val) * 100)}% Left · ${timeSec}s`;
      return `Pan: ${Math.round(val * 100)}% Right · ${timeSec}s`;
    }
  };

  // Add new breakpoint on click
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only if clicked directly on SVG or path, not on an existing point
    if (draggingPointId) return;
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'circle') return;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const newFraction = xToFraction(clickX);
    const newValue = yToValue(clickY);

    const newPoint: AutomationPoint = {
      id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      timeFraction: newFraction,
      value: newValue,
    };

    const nextPoints = getSortedPoints([...points, newPoint]);
    onChange(nextPoints);
  };

  // Dragging a point
  const handlePointMouseDown = (e: React.MouseEvent, ptId: string) => {
    e.stopPropagation();
    setDraggingPointId(ptId);

    const targetPoint = points.find((p) => p.id === ptId);
    if (!targetPoint || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.clientX - rect.left;
      const currentY = moveEvent.clientY - rect.top;

      let newFrac = xToFraction(currentX);
      const newVal = yToValue(currentY);

      // Keep first and last endpoint pinned to 0 and 1 if they are the boundary points
      const isStart = points[0].id === ptId;
      const isEnd = points[points.length - 1].id === ptId;

      if (isStart) newFrac = 0;
      else if (isEnd) newFrac = 1.0;

      const updated = points.map((p) => {
        if (p.id === ptId) {
          return { ...p, timeFraction: newFrac, value: newVal };
        }
        return p;
      });

      const sorted = getSortedPoints(updated);
      onChange(sorted);

      setTooltip({
        x: Math.max(10, Math.min(widthPx - 80, currentX)),
        y: Math.max(15, currentY - 24),
        text: formatValueTooltip(newVal, newFrac),
      });
    };

    const onMouseUp = () => {
      setDraggingPointId(null);
      setTooltip(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Delete point on double click
  const handlePointDoubleClick = (e: React.MouseEvent, ptId: string) => {
    e.stopPropagation();
    if (points.length <= 2) return; // Keep at least 2 points
    const filtered = points.filter((p) => p.id !== ptId);
    onChange(getSortedPoints(filtered));
  };

  // Build SVG path
  const pathD = points.reduce((acc, pt, idx) => {
    const x = fractionToX(pt.timeFraction);
    const y = valueToY(pt.value);
    if (idx === 0) return `M ${x} ${y}`;
    return `${acc} L ${x} ${y}`;
  }, '');

  // Fill area path
  const bottomY = type === 'volume' ? heightPx : heightPx / 2;
  const fillD = `${pathD} L ${fractionToX(points[points.length - 1].timeFraction)} ${bottomY} L ${fractionToX(points[0].timeFraction)} ${bottomY} Z`;

  const strokeColor = type === 'volume' ? '#22d3ee' : '#c084fc'; // cyan vs violet
  const fillColor = type === 'volume' ? 'rgba(34, 211, 238, 0.18)' : 'rgba(192, 132, 252, 0.18)';

  // Reference lines:
  // Volume: 100% (1.0)
  // Pan: Center (0.0)
  const refLineY = type === 'volume' ? valueToY(1.0) : valueToY(0.0);
  const refLabel = type === 'volume' ? '100% (0dB)' : 'Center';

  const applyPreset = (presetPoints: AutomationPoint[]) => {
    onChange(presetPoints);
    setShowPresetsMenu(false);
  };

  return (
    <div className="absolute inset-0 z-20 pointer-events-auto select-none overflow-hidden">
      {/* Top right quick presets toolbar */}
      <div className="absolute top-1 right-1 z-30 flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowPresetsMenu(!showPresetsMenu);
          }}
          title="Automation curve presets"
          className="p-0.5 rounded bg-black/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-[9px] flex items-center gap-1 px-1.5"
        >
          <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
          <span className="font-mono">{type === 'volume' ? 'Vol' : 'Pan'} Auto</span>
        </button>
      </div>

      {/* Preset Flyout Menu */}
      {showPresetsMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-7 right-2 z-40 bg-[#0d121c] border border-cyan-800/80 rounded-lg p-2 shadow-2xl flex flex-col gap-1 text-[10px] min-w-32"
        >
          <div className="flex items-center justify-between pb-1 border-b border-slate-800 font-bold text-slate-300">
            <span>{type === 'volume' ? 'Volume Presets' : 'Pan Presets'}</span>
            <button onClick={() => setShowPresetsMenu(false)} className="text-slate-400 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>

          {type === 'volume' ? (
            <>
              {Object.keys(VOLUME_PRESETS).map((pName) => (
                <button
                  key={pName}
                  onClick={() => applyPreset(VOLUME_PRESETS[pName])}
                  className="text-left px-2 py-1 rounded hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 transition-colors"
                >
                  {pName}
                </button>
              ))}
            </>
          ) : (
            <>
              {Object.keys(PAN_PRESETS).map((pName) => (
                <button
                  key={pName}
                  onClick={() => applyPreset(PAN_PRESETS[pName])}
                  className="text-left px-2 py-1 rounded hover:bg-violet-950/60 text-slate-300 hover:text-violet-300 transition-colors"
                >
                  {pName}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Floating Tooltip during drag */}
      {tooltip && (
        <div
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
          className="absolute z-40 bg-black/85 text-white font-mono text-[9px] px-1.5 py-0.5 rounded border border-cyan-500/50 shadow-lg pointer-events-none whitespace-nowrap"
        >
          {tooltip.text}
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        ref={containerRef}
        onClick={handleSvgClick}
        style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
        className="w-full h-full cursor-crosshair block"
      >
        {/* Reference dashed guideline */}
        <line
          x1="0"
          y1={refLineY}
          x2={widthPx}
          y2={refLineY}
          stroke="rgba(255,255,255,0.2)"
          strokeDasharray="4 3"
          strokeWidth="1"
        />
        <text
          x="6"
          y={refLineY - 3}
          fill="rgba(255,255,255,0.4)"
          fontSize="8"
          fontFamily="monospace"
        >
          {refLabel}
        </text>

        {/* Shaded area under curve */}
        <path d={fillD} fill={fillColor} />

        {/* Automation Curve Stroke */}
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-[0_0_4px_rgba(34,211,238,0.4)]"
        />

        {/* Breakpoints */}
        {points.map((pt) => {
          const cx = fractionToX(pt.timeFraction);
          const cy = valueToY(pt.value);
          const isHovered = hoveredPointId === pt.id;
          const isDragging = draggingPointId === pt.id;

          return (
            <g key={pt.id}>
              {/* Invisible larger hit target */}
              <circle
                cx={cx}
                cy={cy}
                r="10"
                fill="transparent"
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => handlePointMouseDown(e, pt.id)}
                onDoubleClick={(e) => handlePointDoubleClick(e, pt.id)}
                onMouseEnter={() => setHoveredPointId(pt.id)}
                onMouseLeave={() => setHoveredPointId(null)}
              />

              {/* Visible breakpoint node */}
              <circle
                cx={cx}
                cy={cy}
                r={isDragging || isHovered ? '5' : '3.5'}
                fill="#ffffff"
                stroke={strokeColor}
                strokeWidth="2"
                className="pointer-events-none transition-all drop-shadow"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
