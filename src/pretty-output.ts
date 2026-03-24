const BAR_WIDTH = 20;

function bar(covered: number, total: number): string {
  if (total === 0) return ''.padEnd(BAR_WIDTH, '░');
  const pct = covered / total;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty  = BAR_WIDTH - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export interface CoverageResult {
  className: string;
  methodName: string;
  covered: boolean;
}

export function prettyOutput(results: CoverageResult[]): void {
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const uncovered = results.filter(r => !r.covered);

  // 1. Pre-calculate the components of the "overall" line to determine width
  const pctStr = pct.toFixed(1) + '%';
  const countStr = `${covered} / ${total}`;
  const barStr = bar(covered, total);
  
  // This matches the format used in the line: ` overall   ${barStr}   ${pctStr}   ${countStr}`
  // Total logic: " overall   " (11) + BAR_WIDTH (20) + "   " (3) + pctStr + "   " (3) + countStr
  const overallContent = ` overall   ${barStr}   ${pctStr}   ${countStr}`;
  const contentWidth = overallContent.length;

  // 2. Setup the Header Box with dynamic padding
  const title = "api coverage report";
  const boxWidth = Math.max(contentWidth, title.length ); // Ensure box is at least wide enough for title
  const titlePadding = boxWidth - title.length;
  const leftPad = Math.floor(titlePadding / 2);
  const rightPad = titlePadding - leftPad;

  const divider = ' ' + '─'.repeat(boxWidth);
  const lines: string[] = [''];

  // Header
  lines.push(' ╔' + '═'.repeat(boxWidth) + '╗');
  lines.push(` ║${' '.repeat(leftPad)}${title}${' '.repeat(rightPad)}║`);
  lines.push(' ╚' + '═'.repeat(boxWidth) + '╝');
  lines.push('');

  // Overall bar (using the pre-calculated width for alignment)
  lines.push(` ${overallContent}`);
  lines.push('');
  lines.push(divider);

  // Per-class breakdown
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.className]) acc[r.className] = [];
    acc[r.className].push(r);
    return acc;
  }, {} as Record<string, CoverageResult[]>);

  for (const className of Object.keys(grouped).sort()) {
    const methods = grouped[className];
    const clsCovered = methods.filter(m => m.covered).length;
    const clsTotal = methods.length;
    const ratio = `${clsCovered} / ${clsTotal}`;

    lines.push('');
    // Dynamically pad the class name based on the box width minus the ratio length
    const namePadding = boxWidth - ratio.length;
    lines.push(` ${className.padEnd(namePadding)}${ratio}`);

    for (const m of methods) {
      lines.push(m.covered ? `   ✔  ${m.methodName}` : `   ✘  ${m.methodName}`);
    }
  }

  lines.push('', divider, '');

  // Uncovered summary
  if (uncovered.length > 0) {
    lines.push(` ⚠  ${uncovered.length} uncovered method${uncovered.length === 1 ? '' : 's'}:`);
    for (const u of uncovered) {
      lines.push(`   ${u.className}.${u.methodName}`);
    }
    lines.push('', ` ✘  build failed — coverage is not 100%`);
  } else {
    lines.push(` ✔  all methods covered — build passed`);
  }

  lines.push('');
  console.log(lines.join('\n'));
}