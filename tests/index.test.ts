import * as path from 'path';
import * as fs from 'fs';
import { ApiCoverageReporter } from '../src';

describe('ApiCoverageReporter', () => {
  const fixtureDir = path.resolve(__dirname, 'fixtures');
  const reportOutput = path.join(fixtureDir, 'test-coverage-report.txt');

  afterEach(() => {
    if (fs.existsSync(reportOutput)) {
      fs.unlinkSync(reportOutput);
    }
  });

  it('should return false when there are uncovered methods', async () => {
    const reporter = new ApiCoverageReporter({
      rootDir: fixtureDir,
      srcDir: path.join(fixtureDir, 'src'),
      testDir: path.join(fixtureDir, 'tests'),
      // Ignore a non-existent path so no real node_modules are scanned,
      // keeping the fixture program clean and fast.
      ignorePaths: ['does_not_exist'],
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await reporter.runCoverageReport();

    consoleSpy.mockRestore();
    warnSpy.mockRestore();

    expect(result).toBe(false); // subtract() is not covered
    expect(fs.existsSync(reportOutput)).toBe(true); // report file must be written
  });

  it('should return true when all methods are covered', async () => {
    const specPath = path.join(fixtureDir, 'tests', 'MathUtils.spec.ts');
    const originalSpec = fs.readFileSync(specPath, 'utf-8');

    // Dynamically append a subtract() call so coverage hits 100%.
    fs.writeFileSync(specPath, originalSpec + '\nutils.subtract(2, 1);\n');

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    let result: boolean;

    try {
      const reporter = new ApiCoverageReporter({
        rootDir: fixtureDir,
        srcDir: path.join(fixtureDir, 'src'),
        testDir: path.join(fixtureDir, 'tests'),
        ignorePaths: ['does_not_exist'],
      });

      result = await reporter.runCoverageReport();
    } finally {
      // Always restore the spec file, even if the reporter throws.
      fs.writeFileSync(specPath, originalSpec);
      consoleSpy.mockRestore();
    }

    expect(result!).toBe(true);
  });
});