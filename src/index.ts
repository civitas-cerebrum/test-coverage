import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as glob from 'glob';
import { formatPretty } from './formatters/pretty';
import {
  ApiCoverageOptions,
  ApiIndex,
  CoverageResult,
  MethodKey,
  OutputFormat,
} from './types';
import { createProgram, isIgnored, isSourceFile, isTestFile, ProgramContext } from './program';
import { buildApiIndex } from './api-index';
import { extractTypedCalls } from './call-detection';
import { buildCallGraph, resolveTransitiveCalls } from './call-graph';

export class ApiCoverageReporter {
  private rootDir: string;
  private srcDir: string;
  private testDir: string;
  private ignorePaths: string[];
  private outputFormat?: OutputFormat;
  private debug: boolean;
  private threshold: number;
  private ctx!: ProgramContext;

  constructor(options: ApiCoverageOptions = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.srcDir = options.srcDir || path.join(this.rootDir, 'src');
    this.testDir = options.testDir || path.join(this.rootDir, 'tests');
    this.ignorePaths = options.ignorePaths || ['node_modules', 'dist'];
    this.outputFormat = options.outputFormat || 'text';
    this.debug = options.debug ?? false;
    this.threshold = options.threshold ?? 100;
  }

  // -----------------------------
  // Main Execution
  // -----------------------------
  public async runCoverageReport(): Promise<boolean> {
    this.ctx = createProgram({
      rootDir: this.rootDir,
      srcDir: this.srcDir,
      testDir: this.testDir,
      ignorePaths: this.ignorePaths,
      debug: this.debug,
    });
    const program = this.ctx.program;
    const checker = program.getTypeChecker();

    const apiIndex = buildApiIndex(this.ctx);

    // Build the internal graph of what source methods call other source methods
    const callGraph = buildCallGraph(this.ctx, checker, apiIndex);

    const allMethods: MethodKey[] = [];
    apiIndex.forEach((methods, className) => {
      methods.forEach(m => allMethods.push(`${className}.${m}` as MethodKey));
    });

    if (this.debug) {
      console.log(`[debug] total API methods to track: ${allMethods.length}`);
    }

    const directlyCalled = new Set<MethodKey>();

    // 1. Find DIRECT method calls from test files
    for (const sourceFile of program.getSourceFiles()) {
      const filePath = sourceFile.fileName;

      if (sourceFile.isDeclarationFile) continue;
      if (!isTestFile(this.ctx, filePath)) continue;
      if (isIgnored(this.ctx, filePath)) continue;

      if (this.debug) {
        console.log(`[debug] scanning test file: ${filePath}`);
      }

      const calls = extractTypedCalls(sourceFile, sourceFile, checker, apiIndex, this.debug);

      if (this.debug && calls.size > 0) {
        console.log(`[debug]   found calls: ${[...calls].join(', ')}`);
      }

      calls.forEach(c => directlyCalled.add(c));
    }

    // 2. Transitive Closure Calculation
    const calledMethods = resolveTransitiveCalls(directlyCalled, callGraph);

    const results: CoverageResult[] = allMethods.map(key => {
      const [className, methodName] = key.split('.');
      return { className, methodName, covered: calledMethods.has(key) };
    });

    const total = results.length;
    const covered = results.filter(r => r.covered).length;
    const uncovered = results.filter(r => !r.covered);
    const pct = total ? (covered / total) * 100 : 0;

    // Evaluate against the user-defined threshold
    const isSuccess = pct >= this.threshold;

    // --- pretty ---
    if (this.outputFormat === 'pretty') {
      formatPretty(results);
      return isSuccess;
    }

    // --- json ---
    if (this.outputFormat === 'json') {
      const json = {
        summary: { total, covered, percentage: pct, threshold: this.threshold, passed: isSuccess },
        classes: Object.entries(
          results.reduce((acc, r) => {
            if (!acc[r.className]) acc[r.className] = [];
            acc[r.className].push({ name: r.methodName, covered: r.covered });
            return acc;
          }, {} as Record<string, any[]>)
        ).map(([name, methods]) => ({ name, methods })),
        uncovered: uncovered.map(u => `${u.className}.${u.methodName}`)
      };
      const outPath = path.join(this.rootDir, 'test-coverage-report.json');
      fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(JSON.stringify(json, null, 2));
      return isSuccess;
    }

    // --- badge ---
    if (this.outputFormat === 'badge') {
      const color = isSuccess ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
      const label = 'API coverage';
      const value = `${pct.toFixed(1)}%`;
      const lw = 90, vw = 60, tw = lw + vw;
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
      const badgePath = path.join(this.rootDir, 'test-coverage-badge.svg');
      fs.writeFileSync(badgePath, svg, 'utf-8');
      console.log(`Badge written to ${badgePath}`);
      return isSuccess;
    }

    // --- html ---
    if (this.outputFormat === 'html') {
      const grouped = results.reduce((acc, r) => {
        if (!acc[r.className]) acc[r.className] = [];
        acc[r.className].push(r);
        return acc;
      }, {} as Record<string, CoverageResult[]>);

      const barColor = isSuccess ? '#1D9E75' : '#E24B4A';

      const classRows = Object.keys(grouped).sort().map(cls => {
        const methods = grouped[cls];
        const clsCovered = methods.filter(m => m.covered).length;
        const clsPct = methods.length ? (clsCovered / methods.length) * 100 : 0;
        const clsColor = clsPct >= this.threshold ? '#1D9E75' : clsPct >= 60 ? '#BA7517' : '#E24B4A';
        const badges = methods.map(m =>
          `<span class="method ${m.covered ? 'covered' : 'uncovered'}">${m.methodName}</span>`
        ).join('');
        return `
      <div class="class-card">
        <div class="class-header">
          <span class="dot" style="background:${clsColor}"></span>
          <span class="class-name">${cls}</span>
          <div class="mini-bar"><div class="mini-fill" style="width:${clsPct.toFixed(1)}%;background:${clsColor}"></div></div>
          <span class="class-ratio">${clsCovered} / ${methods.length}</span>
        </div>
        <div class="methods">${badges}</div>
      </div>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>API Coverage Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;background:#f5f5f5;color:#1a1a1a;padding:2rem}
  .card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:1.5rem;max-width:800px;margin:0 auto}
  .header{display:flex;align-items:baseline;gap:1rem;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #e5e5e5}
  .title{font-size:16px;font-weight:600}
  .subtitle{font-size:13px;color:#888}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1.5rem}
  .metric{background:#f9f9f9;border-radius:8px;padding:12px 14px}
  .metric-label{font-size:12px;color:#888;margin-bottom:4px}
  .metric-value{font-size:22px;font-weight:600}
  .bar-track{height:6px;background:#eee;border-radius:99px;overflow:hidden;margin-bottom:1.25rem}
  .bar-fill{height:100%;border-radius:99px;transition:width .6s ease}
  .class-card{border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:8px}
  .class-header{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f0f0f0;background:#fafafa}
  .class-name{font-size:13px;font-weight:600;flex:1;font-family:monospace}
  .class-ratio{font-size:12px;color:#888}
  .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .mini-bar{width:80px;height:4px;background:#eee;border-radius:99px;overflow:hidden}
  .mini-fill{height:100%;border-radius:99px}
  .methods{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px}
  .method{font-size:12px;font-family:monospace;padding:3px 9px;border-radius:6px}
  .covered{background:#E1F5EE;color:#0F6E56}
  .uncovered{background:#FCEBEB;color:#A32D2D}
  .footer{margin-top:1.25rem;font-size:12px;color:#aaa;text-align:right}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="title">API coverage report</span>
    <span class="subtitle">Generated ${new Date().toISOString().slice(0, 10)}</span>
  </div>
  <div class="summary">
    <div class="metric"><div class="metric-label">Coverage (Target: ${this.threshold}%)</div><div class="metric-value" style="color:${barColor}">${pct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Covered</div><div class="metric-value">${covered} / ${total}</div></div>
    <div class="metric"><div class="metric-label">Uncovered</div><div class="metric-value" style="color:${uncovered.length ? '#E24B4A' : '#1D9E75'}">${uncovered.length}</div></div>
  </div>
  <div class="bar-track"><div class="bar-fill" id="bar" style="width:0;background:${barColor}"></div></div>
  ${classRows}
  <div class="footer">@civitas-cerebrum/test-coverage</div>
</div>
<script>setTimeout(()=>document.getElementById('bar').style.width='${pct.toFixed(1)}%',100)</script>
</body>
</html>`;

      const outPath = path.join(this.rootDir, 'test-coverage-report.html');
      fs.writeFileSync(outPath, html, 'utf-8');
      console.log(`HTML report written to ${outPath}`);
      return isSuccess;
    }

    // --- github ---
    if (this.outputFormat === 'github' || this.outputFormat === 'github-plain' || this.outputFormat === 'github-table') {
      const isTable = this.outputFormat === 'github-table';

      const comment = isTable
        ? generateGithubTableComment(results, { threshold: this.threshold })
        : generateGithubPlainComment(results, { threshold: this.threshold });

      const summaryPath = process.env.GITHUB_STEP_SUMMARY;
      if (summaryPath) fs.appendFileSync(summaryPath, comment, 'utf-8');
      else console.log(comment);

      const outPath = path.join(this.rootDir, 'test-coverage-report.md');
      fs.writeFileSync(outPath, comment, 'utf-8');
      return isSuccess;
    }

    // --- text (default) ---
    const lines: string[] = [];
    lines.push('\n=== API COVERAGE REPORT ===\n');

    const grouped = results.reduce((acc, r) => {
      if (!acc[r.className]) acc[r.className] = [];
      acc[r.className].push(r);
      return acc;
    }, {} as Record<string, CoverageResult[]>);

    for (const cls of Object.keys(grouped).sort()) {
      const methods = grouped[cls];
      const clsCovered = methods.filter(m => m.covered).length;
      lines.push(`${cls}: ${clsCovered}/${methods.length}`);
      for (const m of methods) {
        lines.push(`  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`);
      }
      lines.push('');
    }

    lines.push(
      `OVERALL: ${covered}/${total} (${total ? ((covered / total) * 100).toFixed(1) : 0}%)`
    );
    lines.push(`THRESHOLD: ${this.threshold}%`);
    lines.push(`STATUS: ${isSuccess ? 'PASSED' : 'FAILED'}`);

    if (uncovered.length) {
      lines.push('\nUncovered:');
      uncovered.forEach(u => lines.push(`  ${u.className}.${u.methodName}`));
    }

    const report = lines.join('\n');
    console.log(report);
    fs.writeFileSync(
      path.join(this.rootDir, 'test-coverage-report.txt'),
      report,
      'utf-8'
    );

    return isSuccess;
  }
}

export function generateGithubPlainComment(
  results: CoverageResult[],
  options: { threshold?: number } = {}
): string {
  const { threshold = 80 } = options;

  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
  const badge = `![API Coverage](https://img.shields.io/badge/API%20Coverage-${pct.toFixed(1)}%25-${color})`;

  const grouped = results.reduce<Record<string, CoverageResult[]>>((acc, r) => {
    (acc[r.className] ??= []).push(r);
    return acc;
  }, {});

  const classLines = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];
    const clsCovered = methods.filter(m => m.covered).length;
    const methodLines = methods
      .map(m => `  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`)
      .join('\n');
    return `**${cls}: ${clsCovered}/${methods.length}**\n${methodLines}`;
  }).join('\n\n');

  const status = passed
    ? `Build Passed: ${pct.toFixed(0)}% API Coverage!`
    : `Build Failed: coverage ${pct.toFixed(1)}% is below threshold ${threshold}%`;

  return [
    ``,
    `## 📊 API Coverage Report`,
    `\n`,
    `${badge}`,
    `\n`,
    `${status}`,
    `\n`,
    `<details>`,
    `<summary>🔍 View Detailed Coverage Breakdown</summary>`,
    `\n`,
    classLines,
    `\n`,
    `<sub>Plain report generated by \`@civitas-cerebrum/api-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
    `</details>`
  ].join('\n');
}

export function generateGithubTableComment(
  results: CoverageResult[],
  options: { threshold?: number } = {}
): string {
  const { threshold = 100 } = options;

  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';

  const badge = `![API Coverage](https://img.shields.io/badge/API%20Coverage-${pct.toFixed(1)}%25-${color})`;

  const grouped = results.reduce<Record<string, CoverageResult[]>>((acc, r) => {
    (acc[r.className] ??= []).push(r);
    return acc;
  }, {});

  const tableRows = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];

    const coveredMethods = methods.filter(m => m.covered).map(m => `\`${m.methodName}\``);
    const uncoveredMethods = methods.filter(m => !m.covered).map(m => `\`${m.methodName}\``);

    const coveredString = coveredMethods.join(', ');
    const uncoveredString = uncoveredMethods.join(', ');

    return `| **${cls}** | ${coveredMethods.length}/${methods.length} | ${uncoveredString} | ${coveredString} |`;
  }).join('\n');

  const status = passed
    ? `**Build Passed:** 🎉 ${pct.toFixed(1)}% API Coverage`
    : `**Build Failed:** ❌ Coverage ${pct.toFixed(1)}% is below the required threshold of ${threshold}%`;

  return [
    ``,
    `## 📊 API Coverage Report`,
    `\n`,
    `${badge}`,
    `\n`,
    `| Category | Coverage | Missing Coverage ❌ | Covered Methods ✅ |`,
    `| :--- | :---: | :--- | :--- |`,
    tableRows,
    `\n`,
    `---`,
    `${status}`,
    `\n`,
    `<sub>Table report generated by \`@civitas-cerebrum/api-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
  ].join('\n');
}

export type { ApiCoverageOptions, CoverageResult } from './types';
