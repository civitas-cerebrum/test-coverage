import * as path from 'path';
import { FormatterInput, FormatterOutput } from './text';

export function formatBadge(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
  const label = 'API coverage';
  const value = `${pct.toFixed(1)}%`;
  const lw = 90;
  const vw = 60;
  const tw = lw + vw;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect width="${lw}" height="20" fill="#555"/>
  <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
  <rect width="${tw}" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>`;

  return {
    output: svg,
    writePath: path.join(rootDir, 'test-coverage-badge.svg'),
  };
}
