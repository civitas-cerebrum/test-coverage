#!/usr/bin/env node
import { ApiCoverageReporter } from './index';

// You can easily add a library like 'commander' or 'yargs' here later 
// to parse CLI flags (like --src, --tests). For now, we rely on defaults.
const reporter = new ApiCoverageReporter();

reporter.runCoverageReport()
  .then((isSuccess) => {
    if (!isSuccess) {
      console.warn('\n❌ Build Failed: API coverage is not 100%.');
      process.exit(1);
    } else {
      console.log('\n✅ Build Passed: 100% API Coverage verified.');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('An unexpected error occurred during the coverage check:', err);
    process.exit(1);
  });