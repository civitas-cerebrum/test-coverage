import { test, expect } from '@playwright/test';
import * as path from 'path';
import { generateApiCoverage } from '@civitas-cerebrum/test-coverage';

// TODO: Import the classes you want to measure here
// import { ExamplePage } from '../src/ExamplePage';

test('API Coverage Report', async ({}, testInfo) => {
  const result = generateApiCoverage({
    testDirs: [path.resolve(__dirname)],
    reportOutputDir: path.resolve(__dirname, '..'),
    targets: [
      // TODO: Configure your target classes
      // { category: 'ExamplePage', tier: 'primary', classRef: ExamplePage }
    ]
  });

  await testInfo.attach('API Coverage Report', {
    body: result.report,
    contentType: 'text/plain',
  });

  expect(result.uncoveredMethods.length, 'Uncovered methods found!').toBe(0);
});
