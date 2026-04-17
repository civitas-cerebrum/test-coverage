import {
  generateGithubPlainComment,
  generateGithubTableComment,
} from '../src/formatters/github';
import { CoverageResult } from '../src/types';

const results: CoverageResult[] = [
  { className: 'Alpha', methodName: 'covered', covered: true },
  { className: 'Alpha', methodName: 'uncovered', covered: false },
  { className: 'Bravo', methodName: 'only', covered: true },
];

describe('generateGithubPlainComment', () => {
  it('contains a shields.io badge', () => {
    expect(generateGithubPlainComment(results, { threshold: 100 })).toContain(
      'img.shields.io/badge/API%20Coverage',
    );
  });
  it('contains a collapsible details section', () => {
    const out = generateGithubPlainComment(results, { threshold: 100 });
    expect(out).toContain('<details>');
    expect(out).toContain('</details>');
  });
});

describe('generateGithubTableComment', () => {
  it('contains the table header', () => {
    const out = generateGithubTableComment(results, { threshold: 100 });
    expect(out).toContain('| Category | Coverage | Missing Coverage');
  });
  it('contains every class name', () => {
    const out = generateGithubTableComment(results, { threshold: 100 });
    expect(out).toContain('Alpha');
    expect(out).toContain('Bravo');
  });
});
