#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const targetDir = path.join(projectRoot, 'scripts');
const targetFile = path.join(targetDir, 'api-coverage.ts');

console.log('🕵️‍♂️ Scanning your project for TypeScript classes...\n');

// --- 1. THE SCANNER ---
// Recursively search for .ts files and extract exported classes
function findExportedClasses(dir, classList = []) {
  if (!fs.existsSync(dir)) return classList;

  // Directories to strictly ignore during the crawl
  const ignoreDirs = ['node_modules', 'dist', 'build', 'tests', 'e2e', 'scripts', '.git'];

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        findExportedClasses(fullPath, classList);
      }
    } else if (stat.isFile() && file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.d.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Match 'export class MyClass' or 'export default class MyClass'
      const classRegex = /export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)/g;
      let match;
      
      while ((match = classRegex.exec(content)) !== null) {
        const className = match[1];
        
        // Calculate the relative import path from the 'scripts/' directory
        let relativePath = path.relative(targetDir, fullPath).replace(/\\/g, '/').replace(/\.ts$/, '');
        if (!relativePath.startsWith('.')) relativePath = './' + relativePath;

        classList.push({ className, relativePath, fileName: file });
      }
    }
  }
  return classList;
}

// Kick off the scan starting from the user's project root
const foundClasses = findExportedClasses(projectRoot);

// --- 2. TEMPLATE GENERATION ---
let dynamicImports = '';
let dynamicTargets = '';

if (foundClasses.length > 0) {
  console.log(`✅ Found ${foundClasses.length} exported classes to measure!`);
  
  // Generate the import statements
  dynamicImports = foundClasses
    .map(c => `import { ${c.className} } from '${c.relativePath}';`)
    .join('\n');

  // Generate the targets array configuration
  dynamicTargets = foundClasses
    .map(c => `      { category: '${c.className}', tier: 'primary', classRef: ${c.className} }`)
    .join(',\n');
} else {
  console.log(`⚠️  No classes found. Generating default template.`);
  dynamicImports = `// TODO: Import the classes you want to measure here\n// import { ExamplePage } from '../src/ExamplePage';`;
  dynamicTargets = `      // TODO: Configure your target classes\n      // { category: 'ExamplePage', tier: 'primary', classRef: ExamplePage }`;
}

// The core template with the dynamic strings injected
const template = `import * as path from 'path';
import { generateApiCoverage } from '@civitas-cerebrum/test-coverage';

// --- Auto-Generated Imports ---
${dynamicImports}

function runCoverage() {
  console.log('🔍 Running API Coverage Analysis...\\n');
  
  const result = generateApiCoverage({
    testDirs: [path.resolve(__dirname, '..')],
    reportOutputDir: path.resolve(__dirname, '..'),
    
    // --- Auto-Wired Targets ---
    targets: [
${dynamicTargets}
    ],
    
    ignorePatterns: ['api-coverage']
  });

  console.log(result.report);

  if (result.uncoveredMethods.length > 0) {
    const missing = result.uncoveredMethods.map(m => m.name).join(', ');
    console.warn(\`\\n⚠️  API Coverage Warning: Unused methods found.\\nThese methods are not currently called by any tests: \${missing}\`);
  } else {
    console.log('\\n✅ 100% API Coverage verified!');
  }
  
  process.exit(0); 
}

runCoverage();
`;

// --- 3. WRITE TO DISK ---
try {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (fs.existsSync(targetFile)) {
    console.log(`\n⚠️  The file scripts/api-coverage.ts already exists.`);
    console.log(`If you want to rescan and generate a fresh template, delete it and run 'npx init-coverage' again.\n`);
    process.exit(0);
  }

  fs.writeFileSync(targetFile, template, 'utf8');
  const relativePath = path.relative(projectRoot, targetFile);
  
  console.log(`\n🎉 Success! Coverage script fully wired and generated at: ${relativePath}`);
  console.log(`👉 Next step: Run it using 'npx tsx ${relativePath}'\n`);
  
} catch (error) {
  console.error('\n❌ Could not create the coverage script:', error.message);
  process.exit(1);
}