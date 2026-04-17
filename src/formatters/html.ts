import * as path from 'path';
import { CoverageResult } from '../types';
import { FormatterInput, FormatterOutput } from './text';
import { groupByClass } from './shared';

export function formatHtml(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const uncovered = results.filter(r => !r.covered);
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;
  const barColor = passed ? '#1D9E75' : '#E24B4A';

  const grouped = groupByClass(results);

  const classRows = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];
    const clsCovered = methods.filter(m => m.covered).length;
    const clsPct = methods.length ? (clsCovered / methods.length) * 100 : 0;
    const clsColor = clsPct >= threshold ? '#1D9E75' : clsPct >= 60 ? '#BA7517' : '#E24B4A';
    const badges = methods.map((m: CoverageResult) =>
      `<span class="method ${m.covered ? 'covered' : 'uncovered'}">${m.methodName}</span>`,
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
    <div class="metric"><div class="metric-label">Coverage (Target: ${threshold}%)</div><div class="metric-value" style="color:${barColor}">${pct.toFixed(1)}%</div></div>
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

  return {
    output: html,
    writePath: path.join(rootDir, 'test-coverage-report.html'),
  };
}
