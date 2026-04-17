import {
  getGithubRepoUrl,
  groupByClass,
  renderShieldsBadge,
  renderStatus,
  sortClassesByMissingFirst,
} from '../src/formatters/shared';
import { CoverageResult } from '../src/types';

describe('groupByClass', () => {
  it('groups results by className preserving order', () => {
    const results: CoverageResult[] = [
      { className: 'A', methodName: 'x', covered: true },
      { className: 'B', methodName: 'y', covered: false },
      { className: 'A', methodName: 'z', covered: false },
    ];
    const grouped = groupByClass(results);
    expect(Object.keys(grouped).sort()).toEqual(['A', 'B']);
    expect(grouped.A).toHaveLength(2);
    expect(grouped.B).toHaveLength(1);
  });
});

describe('renderShieldsBadge', () => {
  it('renders a brightgreen badge when passed', () => {
    const md = renderShieldsBadge(100, true);
    expect(md).toContain('brightgreen');
    expect(md).toContain('100.0%25');
  });
  it('renders a yellow badge when failing but >= 60%', () => {
    expect(renderShieldsBadge(75, false)).toContain('yellow');
  });
  it('renders a red badge when failing and < 60%', () => {
    expect(renderShieldsBadge(40, false)).toContain('red');
  });
});

describe('renderStatus', () => {
  it('renders the passing variant with percentage', () => {
    expect(renderStatus(100, 100, true, 'emoji')).toMatch(/Passed/);
    expect(renderStatus(100, 100, true, 'emoji')).toMatch(/100\.0%/);
  });
  it('renders the failing variant with threshold', () => {
    const out = renderStatus(50, 80, false, 'emoji');
    expect(out).toMatch(/Failed/);
    expect(out).toMatch(/80%/);
  });
  it('supports a plain (no-emoji) variant', () => {
    const plain = renderStatus(100, 100, true, 'plain');
    expect(plain).not.toMatch(/🎉|❌/);
  });
});

describe('sortClassesByMissingFirst', () => {
  it('puts classes with the most missing methods first', () => {
    const grouped: Record<string, CoverageResult[]> = {
      AllCovered: [{ className: 'AllCovered', methodName: 'a', covered: true }],
      OneMissing: [
        { className: 'OneMissing', methodName: 'a', covered: true },
        { className: 'OneMissing', methodName: 'b', covered: false },
      ],
      TwoMissing: [
        { className: 'TwoMissing', methodName: 'a', covered: false },
        { className: 'TwoMissing', methodName: 'b', covered: false },
      ],
    };
    expect(sortClassesByMissingFirst(grouped)).toEqual([
      'TwoMissing',
      'OneMissing',
      'AllCovered',
    ]);
  });

  it('breaks ties alphabetically', () => {
    const grouped: Record<string, CoverageResult[]> = {
      Bravo: [{ className: 'Bravo', methodName: 'a', covered: false }],
      Alpha: [{ className: 'Alpha', methodName: 'a', covered: false }],
    };
    expect(sortClassesByMissingFirst(grouped)).toEqual(['Alpha', 'Bravo']);
  });
});

describe('renderShieldsBadge with linkUrl', () => {
  it('wraps the image in a markdown link when linkUrl is provided', () => {
    const out = renderShieldsBadge(100, true, 'https://github.com/owner/repo');
    expect(out.startsWith('[![API Coverage]')).toBe(true);
    expect(out).toContain('(https://github.com/owner/repo)');
  });

  it('returns a plain image (no link) when linkUrl is omitted', () => {
    const out = renderShieldsBadge(100, true);
    expect(out.startsWith('![API Coverage]')).toBe(true);
    expect(out).not.toContain('[![');
  });
});

describe('getGithubRepoUrl', () => {
  it('builds a github.com URL from GITHUB_REPOSITORY', () => {
    expect(getGithubRepoUrl({ GITHUB_REPOSITORY: 'owner/repo' })).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('respects a custom GITHUB_SERVER_URL (GHES)', () => {
    expect(
      getGithubRepoUrl({
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_SERVER_URL: 'https://github.example.com',
      }),
    ).toBe('https://github.example.com/owner/repo');
  });

  it('returns undefined when GITHUB_REPOSITORY is absent', () => {
    expect(getGithubRepoUrl({})).toBeUndefined();
  });
});
