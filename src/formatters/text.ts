import * as path from 'path';
import { CoverageResult } from '../types';
import { groupByClass } from './shared';

export interface FormatterInput {
  results: CoverageResult[];
  threshold: number;
  rootDir: string;
}

export interface FormatterOutput {
  output: string;
  writePath?: string;
  stepSummary?: boolean;
}

export function formatText(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const uncovered = results.filter(r => !r.covered);
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const lines: string[] = [];
  lines.push('\n=== API COVERAGE REPORT ===\n');

  const grouped = groupByClass(results);
  for (const cls of Object.keys(grouped).sort()) {
    const methods = grouped[cls];
    const clsCovered = methods.filter(m => m.covered).length;
    lines.push(`${cls}: ${clsCovered}/${methods.length}`);
    for (const m of methods) {
      lines.push(`  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`);
    }
    lines.push('');
  }

  lines.push(`OVERALL: ${covered}/${total} (${total ? pct.toFixed(1) : 0}%)`);
  lines.push(`THRESHOLD: ${threshold}%`);
  lines.push(`STATUS: ${passed ? 'PASSED' : 'FAILED'}`);

  if (uncovered.length) {
    lines.push('\nUncovered:');
    uncovered.forEach(u => lines.push(`  ${u.className}.${u.methodName}`));
  }

  return {
    output: lines.join('\n'),
    writePath: path.join(rootDir, 'test-coverage-report.txt'),
  };
}
