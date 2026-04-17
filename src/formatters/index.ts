import { CoverageResult, OutputFormat } from '../types';
import { formatPretty } from './pretty';
import { formatText, FormatterInput, FormatterOutput } from './text';
import { formatJson } from './json';
import { formatBadge } from './badge';
import { formatHtml } from './html';
import {
  generateGithubPlainComment,
  generateGithubTableComment,
} from './github';
import * as path from 'path';

export { FormatterInput, FormatterOutput };

export function runFormatter(
  format: OutputFormat,
  input: FormatterInput,
): FormatterOutput | null {
  switch (format) {
    case 'pretty':
      formatPretty(input.results);
      return null;
    case 'json':
      return formatJson(input);
    case 'badge':
      return formatBadge(input);
    case 'html':
      return formatHtml(input);
    case 'text':
      return formatText(input);
    case 'github':
    case 'github-plain':
      return {
        output: generateGithubPlainComment(input.results, { threshold: input.threshold }),
        writePath: path.join(input.rootDir, 'test-coverage-report.md'),
        stepSummary: true,
      };
    case 'github-table':
      return {
        output: generateGithubTableComment(input.results, { threshold: input.threshold }),
        writePath: path.join(input.rootDir, 'test-coverage-report.md'),
        stepSummary: true,
      };
  }
}
