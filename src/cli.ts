#!/usr/bin/env node
import { ApiCoverageReporter } from './index';

const args = process.argv.slice(2);
const formatArg = args.find(a => a.startsWith('--format='))?.split('=')[1]
               ?? args[args.indexOf('--format') + 1];

const validFormats = ['pretty', 'text', 'json', 'html', 'badge', 'github'];

const outputFormat: any =
  formatArg && validFormats.includes(formatArg)
    ? formatArg
    : process.stdout.isTTY ? 'pretty' : 'text';

const reporter = new ApiCoverageReporter({ outputFormat });

reporter.runCoverageReport()
  .then((isSuccess) => {
    if (!isSuccess) {
      console.warn('\nBuild Failed: API coverage is not 100%.');
      process.exit(1);
    } else {
      console.log('\nBuild Passed: 100% API Coverage!');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('An unexpected error occurred during the coverage check:', err);
    process.exit(1);
  });