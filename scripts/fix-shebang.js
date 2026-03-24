#!/usr/bin/env node
// Prepends #!/usr/bin/env node to dist/cli.js after tsc strips it.
// Run automatically via the "build" npm script.
const fs = require('fs');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
const content = fs.readFileSync(cliPath, 'utf8');

if (!content.startsWith('#!/usr/bin/env node')) {
  fs.writeFileSync(cliPath, '#!/usr/bin/env node\n' + content, 'utf8');
  console.log('shebang added to dist/cli.js');
}