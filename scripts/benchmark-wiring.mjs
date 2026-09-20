/**
 * Read-only geometry equivalence check and synthetic paired-conductor benchmark.
 * Usage: node --experimental-strip-types scripts/benchmark-wiring.mjs [baseline-ref]
 * Requires Node 22.18+ and the baseline commit in the local Git object database.
 * Does not switch branches, edit Git state, or impose timing thresholds on tests.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselineRef = process.argv[2] ?? '86835e0';
const samples = 40;

function fixture(count) {
  const points = new Map();
  const wires = [];
  const cables = new Map();
  for (let index = 0; index < count / 2; index++) {
    points.set(`a${index}`, { x: -100 - index * 4, y: -50 - index * 5, nx: 1, ny: 0 });
    points.set(`b${index}`, { x: 500 + index % 8 * 100, y: 100 + index * 8, nx: -1, ny: 0 });
    const pair = ['pwr+', 'pwr-'].map((portId, conductor) => ({
      id: `${index}-${conductor}`, a: { uid: `a${index}`, portId }, b: { uid: `b${index}`, portId },
      color: conductor ? '#000000' : '#ff0000', routingStyle: 'conduit', bundleId: 'bundle',
      bundleEndpoints: { entry: { x: 120, y: 0, nx: 0, ny: -1 }, exit: { x: 120, y: 1000, nx: 0, ny: 1 } },
    }));
    for (const wire of pair) { wires.push(wire); cables.set(wire.id, pair); }
  }
  return [wires, (end) => points.get(end.uid), () => 0, cables];
}

async function main() {
  if (process.argv.length > 3 || baselineRef === '--help' || baselineRef === '-h') {
    console.log('Usage: node --experimental-strip-types scripts/benchmark-wiring.mjs [baseline-ref]');
    return;
  }
  const baselineSource = execFileSync('git', ['show', `${baselineRef}:src/lib/wiring.ts`], {
    cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  const directory = await mkdtemp(join(tmpdir(), 'frc-wiring-benchmark-'));
  try {
    const baselinePath = join(directory, 'baseline.ts');
    await writeFile(baselinePath, baselineSource);
    const [before, after] = await Promise.all([
      import(pathToFileURL(baselinePath).href), import('../src/lib/wiring.ts'),
    ]);
    const normals = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let comparisons = 0;
    for (const [nx, ny] of normals) for (const [mx, my] of normals) {
      for (const x of [-100, -5, 5, 100]) for (const y of [-100, -5, 5, 100]) {
        for (const control of [undefined, { x: 10, y: -25 }]) {
          const args = [{ x: 0, y: 0, nx, ny }, { x, y, nx: mx, ny: my }, 3, control];
          assert.deepEqual(after.wireRoute(...args), before.wireRoute(...args), `Route equivalence case ${comparisons}`);
          comparisons++;
        }
      }
    }
    const results = [];
    for (const count of [200, 500]) {
      const args = fixture(count);
      assert.deepEqual(after.buildWireGeometry(...args), before.buildWireGeometry(...args), `${count}-conductor bundle equivalence`);
      for (let index = 0; index < 10; index++) { before.buildWireGeometry(...args); after.buildWireGeometry(...args); }
      const timings = { before: [], after: [] };
      for (let index = 0; index < samples; index++) {
        const order = index % 2 ? [['after', after], ['before', before]] : [['before', before], ['after', after]];
        for (const [name, module] of order) {
          const start = performance.now();
          module.buildWireGeometry(...args);
          timings[name].push(performance.now() - start);
        }
      }
      const median = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        return (sorted[samples / 2 - 1] + sorted[samples / 2]) / 2;
      };
      const baseline = median(timings.before);
      const current = median(timings.after);
      results.push({ Conductors: count, 'Baseline median (ms)': baseline.toFixed(2), 'Current median (ms)': current.toFixed(2),
        'Time reduction': `${((1 - current / baseline) * 100).toFixed(1)}%` });
    }
    console.log(`Geometry matches ${baselineRef}: ${comparisons} route cases and two complete paired-conductor bundle layouts.`);
    console.log(`${samples} alternating samples after 10 warmups. Times exclude browser rendering, persistence, and input handling.`);
    console.table(results);
    console.log('Synthetic benchmark only; absolute timings depend on hardware and background load.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Wiring benchmark failed:', error.message);
  process.exitCode = 1;
});
