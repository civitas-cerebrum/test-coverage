#!/usr/bin/env node
import { ApiCoverageReporter } from './index';

const args = process.argv.slice(2);

// 1. Safely Parse Format
let formatArg = args.find(a => a.startsWith('--format='))?.split('=')[1];
if (!formatArg && args.includes('--format')) {
  formatArg = args[args.indexOf('--format') + 1];
}

const validFormats = ['pretty', 'text', 'json', 'html', 'badge', 'github', 'github-plain', 'github-table'];
const outputFormat: any =
  formatArg && validFormats.includes(formatArg)
    ? formatArg
    : process.stdout.isTTY ? 'pretty' : 'text';

// 2. Safely Parse Threshold
let thresholdArg: string | undefined;

const thresholdMatch = args.find(a => a.startsWith('--threshold='));
if (thresholdMatch) {
  thresholdArg = thresholdMatch.split('=')[1];
} else if (args.includes('--threshold')) {
  thresholdArg = args[args.indexOf('--threshold') + 1];
}

// Only call parseFloat if thresholdArg is a string; otherwise, default to 100
const parsedThreshold = thresholdArg ? parseFloat(thresholdArg) : 100;

// Final fallback in case they passed a non-number string (e.g., --threshold=abc)
const threshold = !isNaN(parsedThreshold) ? parsedThreshold : 100;

// 3. Run Reporter
const reporter = new ApiCoverageReporter({ outputFormat, threshold });

reporter.runCoverageReport()
  .then((isSuccess) => {
    if (!isSuccess) {
      console.warn(`\n❌ Build Failed: API coverage is below the required ${threshold}% threshold.`);
      process.exit(1);
    } else {
      console.log(`\n✅ Build Passed: API Coverage meets or exceeds the ${threshold}% threshold!`);
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('An unexpected error occurred during the coverage check:', err);
    process.exit(1);
  });