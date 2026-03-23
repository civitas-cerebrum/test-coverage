# Test Coverage Reporter

[![NPM Version](https://img.shields.io/npm/v/@civitas-cerebrum/test-coverage?color=rgb(88%2C%20171%2C%2070))](https://www.npmjs.com/package/@civitas-cerebrum/test-coverage)

A lightweight, programmatic API coverage reporter. Automatically scans your test files to measure and enforce method usage across your framework's internal classes, ensuring no dead code or untested helpers are left behind.

## 🚀 What is it good for?

  * **Zero-Config Setup:** Includes a smart CLI scanner that automatically finds your classes and wires up your coverage script instantly.
  * **Enforce Framework Coverage:** Ensure developers are actually utilizing the Page Objects, Step Definitions, or Utilities that you write.
  * **Detect Dead Code:** Instantly spot legacy methods sitting in your framework that are no longer called by any active tests.
  * **CI/CD Ready:** Programmatically generates a clean `.txt` report and logs warnings to the console without aggressively breaking your builds.
  * **Agnostic & Encapsulated:** Safely ignores `private` methods and `constructors`. Works securely regardless of how developers name their instantiated variables.

-----

## 📦 Installation & Setup

Install the package via your preferred package manager as a development dependency:

```bash
npm i -D @civitas-cerebrum/test-coverage
```

### The Magic Init Command

You do not need to write any configuration files manually. Simply run the included initialization command:

```bash
npx init-coverage
```

**What this does:**

1.  Crawls your project looking for exported TypeScript classes.
2.  Automatically generates `scripts/api-coverage.ts`.
3.  Auto-wires all relative imports and configures the target arrays for you.

-----

## 💻 Usage

Because the generated file is a pure TypeScript script, you don't need a specific test runner (like Jest or Playwright) to execute it. You can run it directly using `tsx` or `ts-node`:

```bash
npx tsx scripts/api-coverage.ts
```

### Adding to your `package.json`

For easy use in your CI/CD pipelines, add it to your package scripts:

```json
"scripts": {
  "coverage:api": "tsx scripts/api-coverage.ts"
}
```

Now you can run `npm run coverage:api` anytime to generate a fresh `api-coverage-report.txt` and see if any dead code has accumulated in your framework\!

-----

## 🛑 Disabling or Removing

### Temporarily Disable

If you are doing heavy refactoring and don't want to see the coverage warnings in your CI logs, simply remove the `npm run coverage:api` step from your pipeline configuration.

### Complete Removal

To completely remove the coverage reporter from your project:

1.  Delete the generated `scripts/api-coverage.ts` file.
2.  Delete any generated `api-coverage-report.txt` files.
3.  Uninstall the package:
    ```bash
    npm uninstall @civitas-cerebrum/test-coverage
    ```

-----

## 🛠️ Advanced API Reference

If you want to manually tweak the auto-generated `scripts/api-coverage.ts` file, here is the API reference for the core runner.

### `generateApiCoverage(options)`

Executes synchronously and returns a `CoverageResult` object containing:

  * `report`: The formatted string report.
  * `uncoveredMethods`: An array of objects detailing which methods were missed.
  * `reportPath`: The absolute path where the report was saved.

#### `options.testDirs` *(Required, `string[]`)*

An array of absolute directory paths. The runner will recursively search these folders for `.spec.ts` files to scan.

#### `options.reportOutputDir` *(Required, `string`)*

The absolute path to the directory where the coverage text file should be written.

#### `options.targets` *(Required, `CoverageTarget[]`)*

An array of configurations dictating which classes to analyze.

  * `category` *(string)*: A grouping name for the final report (e.g., "PageObjects", "APIHelpers").
  * `tier` *('primary' | 'advanced')*: Determines which visual block of the report the class is grouped under.
  * `classRef` *(any)*: The actual class reference. *Note: Pass the class itself, not an instantiated object.*

#### `options.ignorePatterns` *(Optional, `string[]`)*

An array of substrings used to filter out files. If a scanned filename contains any of these strings, it will be skipped. Useful for ignoring the coverage script itself.

#### `options.reportFileName` *(Optional, `string`)*

Overrides the default output filename. Defaults to `"api-coverage-report.txt"`.