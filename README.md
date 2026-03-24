# @civitas-cerebrum/test-coverage

[![NPM Version](https://img.shields.io/npm/v/@civitas-cerebrum/test-coverage?color=rgb(88%2C%20171%2C%2070))](https://www.npmjs.com/package/@civitas-cerebrum/test-coverage)

> 🔍 **Zero-tolerance API coverage enforcement for TypeScript projects.** > Uses TypeScript's compiler API (AST + type checker) to verify that every public method of every exported class is exercised in your test suite — at the static analysis level, before a single test runs.

---

## How It Works

The reporter runs in two passes over your TypeScript program:

1. **API Indexing** — scans your `src/` directory, finds all exported classes, and catalogs their public non-constructor methods (including arrow function properties).
2. **Call Detection** — scans your test files and uses the TypeScript type checker to find typed call expressions that resolve back to those methods. Three strategies are applied in order of precision: signature-based resolution → apparent type hierarchy traversal → name-based fallback for mocked/`as any` instances.

If your coverage percentage meets or exceeds your defined **threshold**, the process exits `0` ✅. Otherwise, it exits `1` ❌, failing your build.

---

## Installation

```bash
npm install --save-dev @civitas-cerebrum/test-coverage
```

---

## Usage

### CLI

```bash
# Run with default settings (100% threshold)
npx test-coverage

# Custom threshold and format
npx test-coverage --threshold=85 --format=github-table
```

### Programmatic

```typescript
import { ApiCoverageReporter } from '@civitas-cerebrum/test-coverage';

const reporter = new ApiCoverageReporter({
  rootDir: process.cwd(),
  srcDir: './src',
  testDir: './tests',
  outputFormat: 'github-table',
  threshold: 85, // Fail build if below 85%
});

const passed = await reporter.runCoverageReport();
process.exit(passed ? 0 : 1);
```

### Pipeline Script

Add the following stage to your GitHub Actions pipeline.
```yaml
      - name: 📊 Generate & Post Table Report
        if: always()
        uses: actions/github-script@v7
        env:
          REPORT_FORMAT: 'table'
        with:
          script: |
            const fs = require('fs');
            const cp = require('child_process');
            
            const config = {
              table: { flag: 'github-table', header: 'Table report'},
              plain: { flag: 'github-plain', header: 'Plain report' }
            }[process.env.REPORT_FORMAT];

            cp.execSync(`npx test-coverage --format=${config.flag}`);
            const body = fs.readFileSync('test-coverage-report.md', 'utf-8');

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            
            const existing = comments.find(c => 
              c.user.login === 'github-actions[bot]' && 
              c.body.includes(config.header)
            );

            const commentPayload = {
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            };

            if (existing) {
              await github.rest.issues.updateComment({ ...commentPayload, comment_id: existing.id });
            } else {
              await github.rest.issues.createComment({ ...commentPayload, issue_number: context.issue.number });
            }
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Project root (must contain `tsconfig.json`) |
| `srcDir` | `string` | `<rootDir>/src` | Where exported classes live |
| `testDir` | `string` | `<rootDir>/tests` | Where test files live |
| `threshold` | `number` | `100` | Min percentage (0-100) required to pass the build |
| `ignorePaths` | `string[]` | `['node_modules', 'dist']` | Path segments to skip during scanning |
| `outputFormat` | `string` | auto | `pretty`, `text`, `json`, `html`, `badge`, `github-plain`, `github-table` |
| `debug` | `boolean` | `false` | 🐛 Print file discovery and call-matching trace |

---

## Output Formats

### 🎨 `pretty` (default in terminal)
Colorized ANSI output with a progress bar and per-class breakdown. Automatically selected in interactive terminals.

### 🐙 GitHub Formats
Optimized for GitHub Actions Summaries and PR comments.

* **`github-plain`** (or `github`): The classic list-based view with `[x]` checkboxes. Best for smaller APIs.
* **`github-table`**: A high-density table view that groups covered and uncovered methods into compact cells. **Recommended for large projects** to avoid massive scrolling.

### 📄 `text`
Plain-text summary saved as `test-coverage-report.txt`. Best for logs.

### 🗂️ `json`
Machine-readable output saved as `test-coverage-report.json`. Includes `summary.passed` boolean based on your threshold.

### 🌐 `html`
A self-contained visual report saved as `test-coverage-report.html`. Includes an animated progress bar and color-coded method badges.

### 🏷️ `badge`
Generates a shields.io-compatible SVG saved as `test-coverage-badge.svg`. The badge color automatically turns **red** if you are below your specified `threshold`.

---

## ⚙️ CI Integration

### GitHub Actions

```yaml
- name: Check API coverage
  run: npx test-coverage --threshold=90 --format=github-table
```

### Uploading Reports

```yaml
- name: Upload HTML report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: api-coverage-report
    path: |
      test-coverage-report.html
      test-coverage-report.md
```

---

## 🔎 What Gets Tracked

| ✅ Included | ❌ Excluded |
|---|---|
| Public methods on exported classes | `private` / `protected` members |
| Public arrow function properties | `constructor` |
| Inherited public methods | Methods prefixed with `_` |

---

## 🐛 Debugging Zero Coverage

If the API index builds correctly but coverage shows 0%, enable debug mode:
`npx test-coverage --debug`

Common causes:
- **Test files not found**: Ensure they end in `.spec.ts` / `.test.ts`.
- **Heavily mocked instances (`as any`)**: The name-based fallback usually covers this, but check the debug output for `[name-only match]` lines.

---

## License

MIT © [Umut Ay Bora](https://github.com/civitas-cerebrum)