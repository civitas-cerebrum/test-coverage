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

describe('github footers', () => {
  it('plain comment footer references the correct package name', () => {
    const out = generateGithubPlainComment(results, { threshold: 100 });
    expect(out).toContain('@civitas-cerebrum/test-coverage');
    expect(out).not.toContain('@civitas-cerebrum/api-coverage');
  });
  it('table comment footer references the correct package name', () => {
    const out = generateGithubTableComment(results, { threshold: 100 });
    expect(out).toContain('@civitas-cerebrum/test-coverage');
    expect(out).not.toContain('@civitas-cerebrum/api-coverage');
  });
});

describe('threshold defaults', () => {
  // 75% covered; threshold 80 → fail, threshold 100 → fail, but the status wording differs.
  const mixed: CoverageResult[] = [
    { className: 'A', methodName: 'x', covered: true },
    { className: 'A', methodName: 'y', covered: true },
    { className: 'A', methodName: 'z', covered: true },
    { className: 'A', methodName: 'w', covered: false },
  ];

  it('generateGithubPlainComment defaults threshold to 100', () => {
    const out = generateGithubPlainComment(mixed);
    // With threshold 100, 75% fails and the message should reference 100%
    expect(out).toMatch(/100/);
    expect(out).not.toMatch(/threshold 80%/);
  });

  it('generateGithubTableComment defaults threshold to 100', () => {
    const out = generateGithubTableComment(mixed);
    expect(out).toMatch(/threshold of 100%/);
  });
});
