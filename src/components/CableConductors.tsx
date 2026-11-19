import { useMemo } from 'react';
import { cableConductorPaths } from '../lib/cableGeometry';
import type { CableEndAlignment } from '../lib/cableGeometry';
import type { RoutePoint } from '../lib/wiring';

/** `width` is each conductor's stroke; `flat` drops the white halo for print. */
export default function CableConductors({ points, colors, twisted, startAxis, endAxis, startOffset, endOffset, polarity, radius = 8, width = 2.8, flat = false, power = false }: {
  points: RoutePoint[]; colors: [string, string]; twisted: boolean; radius?: number; width?: number; flat?: boolean; power?: boolean;
} & CableEndAlignment) {
  // Power pairs need more breathing room while signal pairs remain compact.
  const spacing = width * 0.5 + (power ? Math.max(1, width * 0.3) : Math.max(0.8, width * 0.25));
  const geometry = useMemo(() => cableConductorPaths(points, twisted, { startAxis, endAxis, startOffset, endOffset, polarity }, radius, spacing),
    [points, twisted, startAxis, endAxis, startOffset, endOffset, polarity, radius, spacing]);
  return (
    <g data-cable-style={twisted ? 'twisted' : 'parallel'} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {!flat && geometry.paths.map((path, index) => <path key={`outline-${index}`} d={path} stroke="#fff" strokeWidth={width + 1} />)}
      {geometry.paths.map((path, index) => <path key={index} data-conductor-index={index} d={path} stroke={colors[index]} strokeWidth={width} />)}
      {geometry.crossings.map((crossing, index) => (
        <path key={index} d={crossing.path} stroke={colors[crossing.conductor]} strokeWidth={width} />
      ))}
    </g>
  );
}
