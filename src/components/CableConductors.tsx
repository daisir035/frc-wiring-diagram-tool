import { useMemo } from 'react';
import { cableConductorPaths } from '../lib/cableGeometry';
import type { RoutePoint } from '../lib/wiring';

export default function CableConductors({ points, colors, twisted }: {
  points: RoutePoint[]; colors: [string, string]; twisted: boolean;
}) {
  const geometry = useMemo(() => cableConductorPaths(points, twisted), [points, twisted]);
  return (
    <g data-cable-style={twisted ? 'twisted' : 'parallel'} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {geometry.paths.map((path, index) => <path key={`outline-${index}`} d={path} stroke="#fff" strokeWidth={4.6} />)}
      {geometry.paths.map((path, index) => <path key={index} d={path} stroke={colors[index]} strokeWidth={2.8} />)}
      {geometry.crossings.map((crossing, index) => (
        <path key={index} d={crossing.path} stroke={colors[crossing.conductor]} strokeWidth={2.8} />
      ))}
    </g>
  );
}
