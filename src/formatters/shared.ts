import { CoverageResult } from '../types';

export type GroupedResults = Record<string, CoverageResult[]>;

export function groupByClass(results: CoverageResult[]): GroupedResults {
  return results.reduce<GroupedResults>((acc, r) => {
    (acc[r.className] ??= []).push(r);
    return acc;
  }, {});
}

export function renderShieldsBadge(pct: number, passed: boolean, linkUrl?: string): string {
  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
  const img = `![API Coverage](https://img.shields.io/badge/API%20Coverage-${pct.toFixed(1)}%25-${color})`;
  return linkUrl ? `[${img}](${linkUrl})` : img;
}

export function getGithubRepoUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) return undefined;
  const server = (env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  return `${server}/${repo}`;
}

export type StatusStyle = 'plain' | 'emoji';

export function renderStatus(
  pct: number,
  threshold: number,
  passed: boolean,
  style: StatusStyle,
): string {
  if (style === 'emoji') {
    return passed
      ? `**Build Passed:** 🎉 ${pct.toFixed(1)}% API Coverage`
      : `**Build Failed:** ❌ Coverage ${pct.toFixed(1)}% is below the required threshold of ${threshold}%`;
  }
  return passed
    ? `Build Passed: ${pct.toFixed(0)}% API Coverage!`
    : `Build Failed: coverage ${pct.toFixed(1)}% is below threshold ${threshold}%`;
}

export function sortClassesByMissingFirst(grouped: GroupedResults): string[] {
  const missingCount = (cls: string) => grouped[cls].filter(m => !m.covered).length;

  return Object.keys(grouped).sort((a, b) => {
    const ma = missingCount(a);
    const mb = missingCount(b);
    if (ma !== mb) return mb - ma; // more missing first
    return a.localeCompare(b);
  });
}
