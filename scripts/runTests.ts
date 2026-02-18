#!/usr/bin/env node

/**
 * Tidum Platform - Test Execution Script
 * Run comprehensive tests from command line
 * 
 * Usage:
 *   npx ts-node scripts/runTests.ts
 *   npx ts-node scripts/runTests.ts --format json
 *   npx ts-node scripts/runTests.ts --format html
 *   npx ts-node scripts/runTests.ts --performance
 *   npx ts-node scripts/runTests.ts --ci
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

type OutputFormat = 'console' | 'json' | 'html' | 'markdown';

interface CliOptions {
  format: OutputFormat;
  verbose: boolean;
  performance: boolean;
  ci: boolean;
  save: boolean;
}

// Parse command line arguments
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  return {
    format: (args.find(arg => arg.startsWith('--format'))?.split('=')[1] || 'console') as OutputFormat,
    verbose: !args.includes('--quiet'),
    performance: args.includes('--performance'),
    ci: args.includes('--ci'),
    save: args.includes('--save'),
  };
}

// Main execution
async function main() {
  const options = parseArgs();

  console.log(
    '\n╔════════════════════════════════════════════════════════════════════════════════╗'
  );
  console.log('║                                                                            ║');
  console.log('║              Tidum Platform - Comprehensive Test Execution                ║');
  console.log('║                                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Configuration:`);
  console.log(`  Output Format: ${options.format}`);
  console.log(`  Verbose: ${options.verbose}`);
  console.log(`  Performance Testing: ${options.performance}`);
  console.log(`  CI Mode: ${options.ci}`);
  console.log(`  Save Report: ${options.save}`);
  console.log();

  try {
    // Dynamically import test runner (avoiding circular dependencies)
    const {
      runTests,
      runTestsWithReport,
      runTestsCI,
      runPerformanceTests,
    } = await import('../client/src/__mocks__/testRunner');

    let results;

    if (options.performance) {
      console.log('Running performance tests...\n');
      results = await runPerformanceTests();
    } else if (options.ci) {
      console.log('Running CI tests...\n');
      const success = await runTestsCI();
      process.exit(success ? 0 : 1);
    } else if (options.format !== 'console') {
      console.log(`Generating ${options.format} report...\n`);
      results = await runTestsWithReport(options.format as any);
    } else {
      console.log('Running all tests...\n');
      results = await runTests({
        verbose: options.verbose,
        outputFormat: options.format,
        saveReport: options.save,
      });
    }

    // Success indication
    if (results.totalFailed === 0) {
      console.log('\n✓ ALL TESTS PASSED!\n');
      process.exit(0);
    } else {
      console.log(`\n✗ ${results.totalFailed} TEST(S) FAILED!\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during test execution:');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Execute
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

export {};
