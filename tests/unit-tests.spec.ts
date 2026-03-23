import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateApiCoverage, CoverageTarget } from '../src/runner';

// --- Dummy Classes for Testing ---
class DummyPrimary {
  publicMethod1() {}
  publicMethod2() {}
  _privateMethod() {} // Should be ignored
}

class DummyAdvanced {
  advancedMethod() {}
}

describe('API Coverage Runner', () => {
  let tmpDir: string;
  let testFilesDir: string;
  let outputDir: string;

  // Setup: Create a real temporary sandbox on the OS before each test
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-test-'));
    testFilesDir = path.join(tmpDir, 'tests');
    outputDir = path.join(tmpDir, 'output');
    
    fs.mkdirSync(testFilesDir);
  });

  // Teardown: Delete the sandbox after each test
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper to write dummy test files
  const createTestFile = (filename: string, content: string) => {
    fs.writeFileSync(path.join(testFilesDir, filename), content, 'utf-8');
  };

  it('should accurately detect covered and uncovered methods', () => {
    // Arrange: Create a test file that only calls publicMethod1
    createTestFile('login.spec.ts', `
      test('dummy', () => {
        myInstance.publicMethod1();
      });
    `);

    const targets: CoverageTarget[] = [
      { category: 'Primary', tier: 'primary', classRef: DummyPrimary }
    ];

    // Act
    const result = generateApiCoverage({
      testDirs: [testFilesDir],
      reportOutputDir: outputDir,
      targets
    });

    // Assert
    expect(result.uncoveredMethods).toHaveLength(1);
    expect(result.uncoveredMethods[0].name).toBe('publicMethod2');
    
    // Ensure the private method was completely ignored
    expect(result.report).not.toContain('_privateMethod');
  });

  it('should ignore files matching ignorePatterns', () => {
    // Arrange: Create two files. The ignored one contains the method call.
    createTestFile('standard.spec.ts', `// no methods called here`);
    createTestFile('api-coverage.spec.ts', `myInstance.publicMethod1();`);

    const targets: CoverageTarget[] = [
      { category: 'Primary', tier: 'primary', classRef: DummyPrimary }
    ];

    // Act
    const result = generateApiCoverage({
      testDirs: [testFilesDir],
      reportOutputDir: outputDir,
      targets,
      ignorePatterns: ['api-coverage'] // Should skip the file we just made
    });

    // Assert: publicMethod1 should be flagged as uncovered because the file was ignored
    expect(result.uncoveredMethods.map(m => m.name)).toContain('publicMethod1');
  });

  it('should enforce word boundaries to prevent false positives', () => {
    // Arrange: Call a method that has a similar name, but isn't exact
    createTestFile('falsy.spec.ts', `myInstance.publicMethod1Extra();`);

    const targets: CoverageTarget[] = [
      { category: 'Primary', tier: 'primary', classRef: DummyPrimary }
    ];

    // Act
    const result = generateApiCoverage({
      testDirs: [testFilesDir],
      reportOutputDir: outputDir,
      targets
    });

    // Assert: publicMethod1 should remain uncovered
    expect(result.uncoveredMethods.map(m => m.name)).toContain('publicMethod1');
  });

  it('should recursively scan nested directories', () => {
    // Arrange: Put a test inside a nested folder
    const nestedDir = path.join(testFilesDir, 'deeply', 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'deep.spec.ts'), 'myInstance.advancedMethod();', 'utf-8');

    const targets: CoverageTarget[] = [
      { category: 'Advanced', tier: 'advanced', classRef: DummyAdvanced }
    ];

    // Act
    const result = generateApiCoverage({
      testDirs: [testFilesDir],
      reportOutputDir: outputDir,
      targets
    });

    // Assert: It should find the nested file and mark the method as covered
    expect(result.uncoveredMethods).toHaveLength(0);
  });

  it('should create the output directory if it does not exist and write the report', () => {
    // Arrange: The outputDir does not exist yet
    expect(fs.existsSync(outputDir)).toBe(false);

    // Act
    const result = generateApiCoverage({
      testDirs: [testFilesDir],
      reportOutputDir: outputDir,
      targets: [],
      reportFileName: 'custom-report.txt'
    });

    // Assert
    expect(fs.existsSync(outputDir)).toBe(true);
    const expectedFilePath = path.join(outputDir, 'custom-report.txt');
    expect(fs.existsSync(expectedFilePath)).toBe(true);
    expect(result.reportPath).toBe(expectedFilePath);
  });

  it('should handle missing test directories gracefully', () => {
    // Act
    const result = generateApiCoverage({
      testDirs: [path.join(tmpDir, 'does-not-exist')],
      reportOutputDir: outputDir,
      targets: [{ category: 'Adv', tier: 'advanced', classRef: DummyAdvanced }]
    });

    // Assert: It shouldn't crash, it should just report 0 coverage
    expect(result.uncoveredMethods).toHaveLength(1);
    expect(result.uncoveredMethods[0].name).toBe('advancedMethod');
  });
});