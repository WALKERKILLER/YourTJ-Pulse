import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const assetsRoot = resolve(import.meta.dirname, '..', 'dist', 'assets');
const files = await readdir(assetsRoot);

const budgets = [
  { label: 'main application', prefix: 'index-', suffix: '.js', maxKiB: 650 },
  { label: 'MapLibre engine', prefix: 'map-engine-', suffix: '.js', maxKiB: 1_100 },
  { label: 'lazy Three.js PulseTown', prefix: 'CampusThreeLayer-', suffix: '.js', maxKiB: 780 },
];

let failed = false;
for (const budget of budgets) {
  const matches = files.filter((file) => file.startsWith(budget.prefix) && file.endsWith(budget.suffix));
  if (matches.length !== 1) {
    console.error(`${budget.label}: expected one chunk, found ${matches.length}`);
    failed = true;
    continue;
  }
  const file = matches[0];
  const sizeKiB = (await stat(resolve(assetsRoot, file))).size / 1024;
  const withinBudget = sizeKiB <= budget.maxKiB;
  console.log(`${withinBudget ? 'PASS' : 'FAIL'} ${budget.label}: ${sizeKiB.toFixed(1)} KiB / ${budget.maxKiB} KiB`);
  if (!withinBudget) failed = true;
}

if (failed) process.exitCode = 1;
