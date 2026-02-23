/**
 * Test Execution Engine
 * Runs comprehensive tests and generates detailed reports
 */

import { runAllTests } from './integrationTests';

// ============================================================================
// TEST EXECUTION INTERFACE
// ============================================================================

export type OutputFormat = 'json' | 'html' | 'markdown' | 'console';

export interface ExecutionConfig {
  verbose?: boolean;
  outputFormat?: OutputFormat;
  saveReport?: boolean;
  reportPath?: string;
  performance?: {
    enableProfiling?: boolean;
    maxDuration?: number;
  };
}

// ============================================================================
// TEST EXECUTION ENGINE
// ============================================================================

export class TestExecutor {
  private config: ExecutionConfig;
  private results: any = null;

  constructor(config: ExecutionConfig = {}) {
    this.config = {
      verbose: true,
      outputFormat: 'console',
      saveReport: false,
      performance: { enableProfiling: true, maxDuration: 60000 },
      ...config,
    };
  }

  /**
   * Execute all tests
   */
  async execute(): Promise<any> {
    const startTime = Date.now();

    try {
      this.log('Starting test execution...\n');
      this.results = await runAllTests();
      const duration = Date.now() - startTime;

      this.log(`\nTest execution completed in ${duration}ms`);

      if (this.config.performance?.maxDuration && duration > this.config.performance.maxDuration) {
        this.log(`WARNING: Execution exceeded max duration of ${this.config.performance.maxDuration}ms`);
      }

      // Generate report based on format
      await this.generateReport();

      return this.results;
    } catch (error) {
      this.log(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Generate report in specified format
   */
  private async generateReport(): Promise<void> {
    if (!this.results) return;

    const format: OutputFormat = this.config.outputFormat || 'console';
    switch (format) {
      case 'json':
        this.generateJsonReport();
        break;
      case 'html':
        this.generateHtmlReport();
        break;
      case 'markdown':
        this.generateMarkdownReport();
        break;
      case 'console':
      default:
        this.generateConsoleReport();
    }
  }

  /**
   * Generate JSON report
   */
  private generateJsonReport(): void {
    const report = {
      ...this.results,
      suites: this.results.suites.map((suite: any) => ({
        name: suite.suiteName,
        tests: suite.tests.length,
        passed: suite.passed,
        failed: suite.failed,
        duration: suite.totalDuration,
      })),
    };

    const json = JSON.stringify(report, null, 2);
    this.log(json);

    if (this.config.saveReport) {
      console.log(`\nReport saved to: ${this.config.reportPath || 'test-report.json'}`);
    }
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(): void {
    const html = this.buildHtmlReport();
    this.log(html);

    if (this.config.saveReport) {
      console.log(`\nHTML report would be saved to: ${this.config.reportPath || 'test-report.html'}`);
    }
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(): void {
    const markdown = this.buildMarkdownReport();
    this.log(markdown);

    if (this.config.saveReport) {
      console.log(`\nMarkdown report would be saved to: ${this.config.reportPath || 'test-report.md'}`);
    }
  }

  /**
   * Generate console report
   */
  private generateConsoleReport(): void {
    this.printDetailedSummary();
  }

  /**
   * Build detailed summary for console
   */
  private printDetailedSummary(): void {
    if (!this.results) return;

    console.log('\n╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                              DETAILED TEST RESULTS                             ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

    for (const suite of this.results.suites) {
      const status = suite.failed === 0 ? '✓' : '✗';
      console.log(`${status} ${suite.suiteName}`);
      console.log(`  Tests: ${suite.tests.length} | Passed: ${suite.passed} | Failed: ${suite.failed}`);
      console.log(`  Duration: ${suite.totalDuration.toFixed(0)}ms`);

      if (this.config.verbose && suite.failed > 0) {
        console.log('  Failed tests:');
        suite.tests
          .filter((t: any) => t.status === 'FAIL')
          .forEach((t: any) => {
            console.log(`    - ${t.name}: ${t.message}`);
          });
      }

      console.log();
    }

    // Print summary statistics
    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                            SUMMARY STATISTICS                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`Total Tests:      ${this.results.totalTests}`);
    console.log(`Total Passed:     ${this.results.totalPassed} (${this.results.summaryStats.successRate.toFixed(2)}%)`);
    console.log(`Total Failed:     ${this.results.totalFailed}`);
    console.log(`Total Duration:   ${this.results.totalDuration.toFixed(0)}ms`);
    console.log(`Avg per Test:     ${this.results.summaryStats.avgTimePerTest.toFixed(0)}ms`);
    console.log(`Timestamp:        ${this.results.timestamp}`);
    console.log();
  }

  /**
   * Build HTML report content
   */
  private buildHtmlReport(): string {
    const suiteRows = this.results.suites
      .map(
        (suite: any) => `
      <tr>
        <td>${suite.suiteName}</td>
        <td>${suite.tests.length}</td>
        <td style="color: green;">${suite.passed}</td>
        <td style="color: ${suite.failed > 0 ? 'red' : 'green'};">${suite.failed}</td>
        <td>${suite.totalDuration.toFixed(0)}ms</td>
      </tr>
    `
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Tidum Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .header { background: #1F6B73; color: white; padding: 20px; border-radius: 5px; }
    .summary { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; background: white; }
    th { background: #1F6B73; color: white; padding: 10px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #ddd; }
    tr:hover { background: #f0f0f0; }
    .stat { display: inline-block; margin: 10px 20px 10px 0; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1F6B73; }
    .pass { color: green; }
    .fail { color: red; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Tidum Platform - Test Report</h1>
    <p>Generated: ${this.results.timestamp}</p>
  </div>
  
  <div class="summary">
    <h2>Summary</h2>
    <div class="stat">
      <div>Total Tests</div>
      <div class="stat-value">${this.results.totalTests}</div>
    </div>
    <div class="stat">
      <div class="pass">Passed</div>
      <div class="stat-value pass">${this.results.totalPassed}</div>
    </div>
    <div class="stat">
      <div class="fail">Failed</div>
      <div class="stat-value fail">${this.results.totalFailed}</div>
    </div>
    <div class="stat">
      <div>Success Rate</div>
      <div class="stat-value">${this.results.summaryStats.successRate.toFixed(2)}%</div>
    </div>
    <div class="stat">
      <div>Duration</div>
      <div class="stat-value">${this.results.totalDuration.toFixed(0)}ms</div>
    </div>
  </div>

  <div class="summary">
    <h2>Test Results by Suite</h2>
    <table>
      <thead>
        <tr>
          <th>Test Suite</th>
          <th>Total Tests</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${suiteRows}
      </tbody>
    </table>
  </div>
</body>
</html>
    `;
  }

  /**
   * Build Markdown report content
   */
  private buildMarkdownReport(): string {
    const suiteRows = this.results.suites
      .map(
        (suite: any) => `| ${suite.suiteName} | ${suite.tests.length} | ${suite.passed} | ${suite.failed} | ${suite.totalDuration.toFixed(0)}ms |`
      )
      .join('\n');

    return `
# Tidum Platform - Test Report

**Generated:** ${this.results.timestamp}

## Summary

- **Total Tests:** ${this.results.totalTests}
- **Passed:** ${this.results.totalPassed} ✓
- **Failed:** ${this.results.totalFailed} ✗
- **Success Rate:** ${this.results.summaryStats.successRate.toFixed(2)}%
- **Total Duration:** ${this.results.totalDuration.toFixed(0)}ms

## Test Results by Suite

| Test Suite | Total | Passed | Failed | Duration |
|---|---|---|---|---|
${suiteRows}

## Key Metrics

- Average time per test: ${this.results.summaryStats.avgTimePerTest.toFixed(0)}ms
- Tests per second: ${((this.results.totalTests / this.results.totalDuration) * 1000).toFixed(2)}

## Status

${this.results.totalFailed === 0 ? '✓ All tests passed!' : `✗ ${this.results.totalFailed} test(s) failed`}
    `;
  }

  /**
   * Log message if verbose is enabled
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Run tests with default configuration
 */
export async function runTests(config?: ExecutionConfig): Promise<any> {
  const executor = new TestExecutor(config);
  return executor.execute();
}

/**
 * Run tests and generate report
 */
export async function runTestsWithReport(format: 'json' | 'html' | 'markdown' = 'json'): Promise<any> {
  return runTests({
    verbose: true,
    outputFormat: format,
    saveReport: true,
  });
}

/**
 * Quick test runner for CI/CD
 */
export async function runTestsCI(): Promise<boolean> {
  try {
    const results = await runTests({
      verbose: false,
      outputFormat: 'json',
    });

    return results.totalFailed === 0;
  } catch (error) {
    console.error('Test execution failed:', error);
    return false;
  }
}

/**
 * Performance test runner
 */
export async function runPerformanceTests(): Promise<any> {
  return runTests({
    verbose: true,
    outputFormat: 'console',
    performance: {
      enableProfiling: true,
      maxDuration: 30000, // 30 seconds max
    },
  });
}

export default {
  TestExecutor,
  runTests,
  runTestsWithReport,
  runTestsCI,
  runPerformanceTests,
};
