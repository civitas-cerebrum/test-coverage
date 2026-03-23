# @civitas-cerebrum/test-coverage 🛡️

A lightweight, static-analysis tool for TypeScript projects that verifies if the public methods of your classes are being called inside your test files. 

Stop wondering if you forgot to write a test for a new method. `@civitas-cerebrum/test-coverage` parses your TypeScript Abstract Syntax Tree (AST) to extract your classes and methods, then checks your test files to ensure every single public API is covered.

## ✨ Features
* **Zero Runtime Execution:** Uses static AST parsing. It doesn't need to run your code to know what your methods are.
* **100% Coverage Enforcement:** Fails the build (exits with code `1`) if any public method is uncovered, making it perfect for CI/CD pipelines.
* **Generates Reports:** Automatically outputs a clean `test-coverage-report.txt` file summarizing your coverage.
* **Smart Filtering:** Automatically ignores `private`, `protected`, constructors, and internal methods (prefixed with `_`).

---

## 📦 Installation

It is recommended to install this as a development dependency in your project:

**Using npm:**
```bash
npm install --save-dev @civitas-cerebrum/test-coverage
```

**Using yarn:**
```bash
yarn add -D @civitas-cerebrum/test-coverage
```

---

## 🚀 Usage

### 1. Command Line (CLI)
By default, the tool assumes your source code is in a `src/` directory and your tests are in a `tests/` directory.

Run the tool directly using `npx`:

```bash
npx test-coverage
```

**Adding to your `package.json` scripts:**
You can add it to your test pipeline to ensure coverage is checked automatically:

```json
{
  "scripts": {
    "test": "jest",
    "test:coverage": "test-coverage"
  }
}
```
Then run: `npm run test:coverage`

### 2. Programmatic Usage (Custom Scripts)
If you have a custom folder structure (e.g., your tests are in a `specs/` folder instead of `tests/`), you can use the package programmatically inside a custom Node script.

Create a file called `check-coverage.ts`:

```typescript
import { ApiCoverageReporter } from '@civitas-cerebrum/test-coverage';
import * as path from 'path';

const reporter = new ApiCoverageReporter({
  rootDir: process.cwd(),
  srcDir: path.resolve(process.cwd(), 'lib'),       // Custom source directory
  testDir: path.resolve(process.cwd(), 'specs'),    // Custom test directory
  ignoreTestPatterns: ['mock-data.ts']              // Ignore specific files
});

reporter.runCoverageReport()
  .then((passed) => {
    if (!passed) {
      console.error('Coverage check failed!');
      process.exit(1);
    }
    console.log('Coverage check passed!');
  })
  .catch(console.error);
```

---

## 📊 Example Output

When run, the tool outputs a summary to your terminal and generates an `test-coverage-report.txt` file.

```text
========================================================
                  API COVERAGE REPORT                    
========================================================

  MathUtils: 2/2 (100%)
      [x] add
      [x] subtract

  StringUtils: 1/2 (50%)
      [x] capitalize
      [ ] reverseString

========================================================
  OVERALL: 3/4 methods (75.0%)
========================================================

  Uncovered methods (not in any test):
    [ ] [StringUtils] reverseString

❌ Build Failed: API coverage is not 100%.
```

---

## 🗑️ Removal / Uninstalling

If you decide you no longer need the package, you can easily remove it:

**Using npm:**
```bash
npm uninstall @civitas-cerebrum/test-coverage
```

**Using yarn:**
```bash
yarn remove @civitas-cerebrum/test-coverage
```

Make sure to also remove any `npx test-coverage` commands you may have added to your GitHub Actions or `package.json` scripts!