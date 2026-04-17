import * as path from 'path';
import { FormatterInput, FormatterOutput } from './text';
import { groupByClass } from './shared';

export function formatJson(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const uncovered = results.filter(r => !r.covered);
  const pct = total ? (covered / total) * 100 : 0;

  const grouped = groupByClass(results);

  const json = {
    summary: { total, covered, percentage: pct, threshold, passed: pct >= threshold },
    classes: Object.entries(grouped).map(([name, methods]) => ({
      name,
      methods: methods.map(m => ({ name: m.methodName, covered: m.covered })),
    })),
    uncovered: uncovered.map(u => `${u.className}.${u.methodName}`),
  };

  const content = JSON.stringify(json, null, 2);
  return {
    output: content,
    writePath: path.join(rootDir, 'test-coverage-report.json'),
  };
}
