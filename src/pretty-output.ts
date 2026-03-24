// ANSI escape helpers — no dependencies required.
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};

const BAR_WIDTH = 20;

function bar(covered: number, total: number): string {
  if (total === 0) return ''.padEnd(BAR_WIDTH, '░');
  const pct = covered / total;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty  = BAR_WIDTH - filled;
  const color  = pct === 1 ? c.green : pct >= 0.6 ? c.yellow : c.red;
  return color + '█'.repeat(filled) + c.dim + '░'.repeat(empty) + c.reset;
}

function pctColor(pct: number): string {
  if (pct === 100) return c.green;
  if (pct >= 60)   return c.yellow;
  return c.red;
}

export interface CoverageResult {
  className: string;
  methodName: string;
  covered: boolean;
}

export function prettyOutput(results: CoverageResult[]): void {
  const total   = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct     = total ? (covered / total) * 100 : 0;
  const uncovered = results.filter(r => !r.covered);

  const divider = c.dim + ' ' + '─'.repeat(47) + c.reset;

  const lines: string[] = [''];

  // Header
  lines.push(c.cyan + ' ╔' + '═'.repeat(45) + '╗' + c.reset);
  lines.push(c.cyan + ' ║' + c.reset + c.bold + '             api coverage report         ' + c.reset + c.cyan + '    ║' + c.reset);
  lines.push(c.cyan + ' ╚' + '═'.repeat(45) + '╝' + c.reset);
  lines.push('');

  // Overall bar
  const pctStr  = pctColor(pct) + pct.toFixed(1) + '%' + c.reset;
  const countStr = c.gray + `${covered} / ${total}` + c.reset;
  lines.push(` ${c.white}overall${c.reset}   ${bar(covered, total)}   ${pctStr}   ${countStr}`);
  lines.push('');
  lines.push(divider);

  // Per-class breakdown
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.className]) acc[r.className] = [];
    acc[r.className].push(r);
    return acc;
  }, {} as Record<string, CoverageResult[]>);

  for (const className of Object.keys(grouped).sort()) {
    const methods     = grouped[className];
    const clsCovered  = methods.filter(m => m.covered).length;
    const clsTotal    = methods.length;
    const allGood     = clsCovered === clsTotal;

    const ratio = (allGood ? c.green : c.yellow) +
      `${clsCovered} / ${clsTotal}` + c.reset;

    lines.push('');
    lines.push(` ${c.bold}${className.padEnd(36)}${c.reset}${ratio}`);

    for (const m of methods) {
      if (m.covered) {
        lines.push(`   ${c.green}✔${c.reset}  ${c.gray}${m.methodName}${c.reset}`);
      } else {
        lines.push(`   ${c.red}✘${c.reset}  ${c.red}${m.methodName}${c.reset}`);
      }
    }
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  // Uncovered summary
  if (uncovered.length > 0) {
    lines.push(` ${c.yellow}⚠  ${uncovered.length} uncovered method${uncovered.length === 1 ? '' : 's'}:${c.reset}`);
    for (const u of uncovered) {
      lines.push(`   ${c.gray}${u.className}.${u.methodName}${c.reset}`);
    }
    lines.push('');
    lines.push(` ${c.red}✘  build failed — coverage is not 100%${c.reset}`);
  } else {
    lines.push(` ${c.green}✔  all methods covered — build passed${c.reset}`);
  }

  lines.push('');

  console.log(lines.join('\n'));
}
