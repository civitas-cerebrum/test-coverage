import * as path from 'path';
import * as fs from 'fs';
import { ApiCoverageReporter } from '../src';

describe('ApiCoverageReporter', () => {
  const fixtureDir = path.resolve(__dirname, 'fixtures');
  const reportOutput = path.join(fixtureDir, 'test-coverage-report.txt');

  // Clean up the generated report file after each test
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
      nodeModulesDir: path.join(fixtureDir, 'does_not_exist') // Skip node_modules for this test
    });

    // Suppress console.log/warn during tests to keep the terminal clean
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await reporter.runCoverageReport();

    expect(result).toBe(false); // subtract() is missing
    expect(fs.existsSync(reportOutput)).toBe(true); // check if report was written

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should return true when all methods are covered', async () => {
    // Dynamically update the spec file to cover the 'subtract' method
    const specPath = path.join(fixtureDir, 'tests', 'MathUtils.spec.ts');
    const originalSpec = fs.readFileSync(specPath, 'utf-8');

    fs.writeFileSync(specPath, originalSpec + '\nutils.subtract(2, 1);');

    const reporter = new ApiCoverageReporter({
      rootDir: fixtureDir,
      srcDir: path.join(fixtureDir, 'src'),
      testDir: path.join(fixtureDir, 'tests'),
      nodeModulesDir: path.join(fixtureDir, 'does_not_exist')
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await reporter.runCoverageReport();

    // Revert the spec file back to its original state
    fs.writeFileSync(specPath, originalSpec);

    expect(result).toBe(true); // Now 100% covered

    consoleSpy.mockRestore();
  });
});