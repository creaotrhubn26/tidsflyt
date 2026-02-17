/**
 * Mock API Handlers & Test Utilities
 * Simulates API responses for comprehensive end-to-end testing
 */

import {
  mockUser,
  mockUsers,
  mockTimeEntries,
  mockWeeklyData,
  mockReports,
  mockReportStats,
  mockCaseReports,
  mockCaseStats,
  mockAccessRequests,
  mockAccessRequestStats,
  mockCaseReviews,
  mockCaseReviewStats,
  mockVendors,
  mockVendorStats,
  mockNotifications,
  mockAnalytics,
  mockSearchResults,
  mockPaginatedResponse,
} from './mockData';

// ============================================================================
// MOCK API HANDLERS
// ============================================================================

export const mockApiHandlers: { [key: string]: any } = {
  // AUTH ENDPOINTS
  ['POST /api/auth/login']: async (credentials: any) => {
    if (credentials.email === 'user@example.com' && credentials.password === 'password') {
      return { success: true, user: mockUser, token: 'mock-jwt-token' };
    }
    throw new Error('Invalid credentials');
  },

  'POST /api/auth/logout': async () => {
    return { success: true };
  },

  'GET /api/auth/me': async () => {
    return { success: true, user: mockUser };
  },

  // USER ENDPOINTS
  'GET /api/users': async () => {
    return { success: true, data: mockUsers, total: mockUsers.length };
  },

  'GET /api/users/:id': async (id: string) => {
    const user = mockUsers.find(u => u.id === id);
    if (!user) throw new Error('User not found');
    return { success: true, data: user };
  },

  'POST /api/users': async (userData: any) => {
    const newUser = { id: `user-${Date.now()}`, ...userData };
    return { success: true, data: newUser };
  },

  'PUT /api/users/:id': async (id: string, userData: any) => {
    const user = mockUsers.find(u => u.id === id);
    if (!user) throw new Error('User not found');
    return { success: true, data: { ...user, ...userData } };
  },

  'DELETE /api/users/:id': async (id: string) => {
    return { success: true, message: 'User deleted' };
  },

  // TIME ENTRY ENDPOINTS
  'GET /api/time-entries': async () => {
    return { success: true, data: mockTimeEntries, total: mockTimeEntries.length };
  },

  'GET /api/time-entries/week': async () => {
    return { success: true, data: mockWeeklyData };
  },

  'GET /api/time-entries/:id': async (id: string) => {
    const entry = mockTimeEntries.find(e => e.id === id);
    if (!entry) throw new Error('Time entry not found');
    return { success: true, data: entry };
  },

  'POST /api/time-entries': async (entryData: any) => {
    const newEntry = { id: `entry-${Date.now()}`, ...entryData };
    return { success: true, data: newEntry };
  },

  'PUT /api/time-entries/:id': async (id: string, entryData: any) => {
    const entry = mockTimeEntries.find(e => e.id === id);
    if (!entry) throw new Error('Time entry not found');
    return { success: true, data: { ...entry, ...entryData } };
  },

  'DELETE /api/time-entries/:id': async (id: string) => {
    return { success: true, message: 'Time entry deleted' };
  },

  // BULK TIME ENTRIES
  'POST /api/time-entries/bulk': async (bulkData: any) => {
    return { success: true, created: bulkData.entries.length, message: 'Bulk entries created' };
  },

  // REPORTS ENDPOINTS
  'GET /api/reports': async () => {
    return { success: true, data: mockReports, total: mockReports.length };
  },

  'GET /api/reports/stats': async () => {
    return { success: true, data: mockReportStats };
  },

  'GET /api/reports/trends': async () => {
    return { success: true, data: mockAnalytics.reports };
  },

  'GET /api/reports/:id': async (id: string) => {
    const report = mockReports.find(r => r.id === id);
    if (!report) throw new Error('Report not found');
    return { success: true, data: report };
  },

  'POST /api/reports': async (reportData: any) => {
    const newReport = { id: `report-${Date.now()}`, ...reportData };
    return { success: true, data: newReport };
  },

  'PUT /api/reports/:id': async (id: string, reportData: any) => {
    const report = mockReports.find(r => r.id === id);
    if (!report) throw new Error('Report not found');
    return { success: true, data: { ...report, ...reportData } };
  },

  'POST /api/reports/:id/approve': async (id: string) => {
    return { success: true, message: 'Report approved' };
  },

  'POST /api/reports/:id/reject': async (id: string) => {
    return { success: true, message: 'Report rejected' };
  },

  // CASE REPORTS ENDPOINTS
  'GET /api/cases': async () => {
    return { success: true, data: mockCaseReports, total: mockCaseReports.length };
  },

  'GET /api/cases/stats': async () => {
    return { success: true, data: mockCaseStats };
  },

  'GET /api/cases/:id': async (id: string) => {
    const caseReport = mockCaseReports.find(c => c.id === id);
    if (!caseReport) throw new Error('Case not found');
    return { success: true, data: caseReport };
  },

  'POST /api/cases': async (caseData: any) => {
    const newCase = { id: `case-${Date.now()}`, ...caseData };
    return { success: true, data: newCase };
  },

  'PUT /api/cases/:id': async (id: string, caseData: any) => {
    const caseReport = mockCaseReports.find(c => c.id === id);
    if (!caseReport) throw new Error('Case not found');
    return { success: true, data: { ...caseReport, ...caseData } };
  },

  // ACCESS REQUESTS ENDPOINTS
  'GET /api/access-requests': async () => {
    return { success: true, data: mockAccessRequests, total: mockAccessRequests.length };
  },

  'GET /api/access-requests/stats': async () => {
    return { success: true, data: mockAccessRequestStats };
  },

  'POST /api/access-requests/:id/approve': async (id: string) => {
    return { success: true, message: 'Access request approved' };
  },

  'POST /api/access-requests/:id/reject': async (id: string) => {
    return { success: true, message: 'Access request rejected' };
  },

  // CASE REVIEWS ENDPOINTS
  'GET /api/admin/case-reviews': async () => {
    return { success: true, data: mockCaseReviews, total: mockCaseReviews.length };
  },

  'GET /api/admin/case-reviews/stats': async () => {
    return { success: true, data: mockCaseReviewStats };
  },

  'POST /api/admin/case-reviews/:id/approve': async (id: string) => {
    return { success: true, message: 'Case review approved' };
  },

  'POST /api/admin/case-reviews/:id/reject': async (id: string) => {
    return { success: true, message: 'Case review rejected' };
  },

  // VENDORS ENDPOINTS
  'GET /api/vendors': async () => {
    return { success: true, data: mockVendors, total: mockVendors.length };
  },

  'GET /api/vendors/stats': async () => {
    return { success: true, data: mockVendorStats };
  },

  'GET /api/vendors/:id': async (id: string) => {
    const vendor = mockVendors.find(v => v.id === id);
    if (!vendor) throw new Error('Vendor not found');
    return { success: true, data: vendor };
  },

  'POST /api/vendors': async (vendorData: any) => {
    const newVendor = { id: `vendor-${Date.now()}`, ...vendorData };
    return { success: true, data: newVendor };
  },

  'PUT /api/vendors/:id': async (id: string, vendorData: any) => {
    const vendor = mockVendors.find(v => v.id === id);
    if (!vendor) throw new Error('Vendor not found');
    return { success: true, data: { ...vendor, ...vendorData } };
  },

  // NOTIFICATIONS
  'GET /api/notifications': async () => {
    return { success: true, data: mockNotifications };
  },

  'POST /api/notifications/:id/read': async (id: string) => {
    return { success: true, message: 'Notification marked as read' };
  },

  'POST /api/notifications/read-all': async () => {
    return { success: true, message: 'All notifications marked as read' };
  },

  // SEARCH
  'GET /api/search': async (query: string) => {
    return { success: true, data: mockSearchResults };
  },

  // ANALYTICS
  'GET /api/analytics': async () => {
    return { success: true, data: mockAnalytics };
  },

  // EXPORT
  'POST /api/export': async (exportConfig: any) => {
    const fileId = `export-${Date.now()}`;
    return { success: true, fileId, fileName: `export-${new Date().toISOString()}.${exportConfig.format}` };
  },

  'GET /api/export/:fileId': async (fileId: string) => {
    return { success: true, data: 'mock-file-content' };
  },
};

// ============================================================================
// API SIMULATION FUNCTION
// ============================================================================

export async function simulateApiCall(method: string, endpoint: string, data?: any): Promise<any> {
  const pathWithMethod = `${method} ${endpoint}`;
  const handler = mockApiHandlers[pathWithMethod as keyof typeof mockApiHandlers];

  if (!handler) {
    throw new Error(`No mock handler found for: ${pathWithMethod}`);
  }

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));

  try {
    return await handler(data);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// TEST SETUP UTILITIES
// ============================================================================

export const testSetup = {
  // Initialize mock data
  initializeMockData: () => {
    return {
      users: mockUsers,
      timeEntries: mockTimeEntries,
      reports: mockReports,
      cases: mockCaseReports,
      accessRequests: mockAccessRequests,
      caseReviews: mockCaseReviews,
      vendors: mockVendors,
      notifications: mockNotifications,
    };
  },

  // Reset mock data
  resetMockData: () => {
    // Clear any cached data
    localStorage.clear();
    sessionStorage.clear();
  },

  // Create test user
  createTestUser: (overrides?: any) => {
    return { ...mockUser, ...overrides };
  },

  // Create test time entry
  createTestTimeEntry: (overrides?: any) => {
    return { ...mockTimeEntries[0], id: `entry-${Date.now()}`, ...overrides };
  },

  // Create test report
  createTestReport: (overrides?: any) => {
    return { ...mockReports[0], id: `report-${Date.now()}`, ...overrides };
  },

  // Create test case
  createTestCase: (overrides?: any) => {
    return { ...mockCaseReports[0], id: `case-${Date.now()}`, ...overrides };
  },

  // Create test vendor
  createTestVendor: (overrides?: any) => {
    return { ...mockVendors[0], id: `vendor-${Date.now()}`, ...overrides };
  },
};

// ============================================================================
// WORKFLOW TEST HELPERS
// ============================================================================

export const workflowTests = {
  // Complete Time Tracking Workflow
  completeTimeTrackingWorkflow: async () => {
    const steps = [];

    steps.push({
      name: 'Create time entry',
      result: await simulateApiCall('POST', '/api/time-entries', testSetup.createTestTimeEntry()),
    });

    steps.push({
      name: 'Fetch weekly data',
      result: await simulateApiCall('GET', '/api/time-entries/week'),
    });

    steps.push({
      name: 'Update time entry',
      result: await simulateApiCall('PUT', '/api/time-entries/entry-1', { status: 'submitted' }),
    });

    return steps;
  },

  // Complete Report Workflow
  completeReportWorkflow: async () => {
    const steps = [];

    steps.push({
      name: 'Create report',
      result: await simulateApiCall('POST', '/api/reports', testSetup.createTestReport()),
    });

    steps.push({
      name: 'Fetch report stats',
      result: await simulateApiCall('GET', '/api/reports/stats'),
    });

    steps.push({
      name: 'Approve report',
      result: await simulateApiCall('POST', '/api/reports/report-1/approve'),
    });

    return steps;
  },

  // Complete Case Management Workflow
  completeCaseManagementWorkflow: async () => {
    const steps = [];

    steps.push({
      name: 'Create case',
      result: await simulateApiCall('POST', '/api/cases', testSetup.createTestCase()),
    });

    steps.push({
      name: 'Fetch case stats',
      result: await simulateApiCall('GET', '/api/cases/stats'),
    });

    steps.push({
      name: 'Update case status',
      result: await simulateApiCall('PUT', '/api/cases/case-1', { status: 'in_review' }),
    });

    return steps;
  },

  // Complete Access Request Workflow
  completeAccessRequestWorkflow: async () => {
    const steps = [];

    steps.push({
      name: 'Fetch access requests',
      result: await simulateApiCall('GET', '/api/access-requests'),
    });

    steps.push({
      name: 'Fetch access request stats',
      result: await simulateApiCall('GET', '/api/access-requests/stats'),
    });

    steps.push({
      name: 'Approve access request',
      result: await simulateApiCall('POST', '/api/access-requests/req-1/approve'),
    });

    return steps;
  },

  // Complete Vendor Management Workflow
  completeVendorManagementWorkflow: async () => {
    const steps = [];

    steps.push({
      name: 'Create vendor',
      result: await simulateApiCall('POST', '/api/vendors', testSetup.createTestVendor()),
    });

    steps.push({
      name: 'Fetch vendor stats',
      result: await simulateApiCall('GET', '/api/vendors/stats'),
    });

    steps.push({
      name: 'Update vendor',
      result: await simulateApiCall('PUT', '/api/vendors/vendor-1', { status: 'inactive' }),
    });

    return steps;
  },

  // Complete Admin Case Review Workflow
  completeAdminCaseReviewWorkflow: async () => {
    const steps = [];

    steps.push({
      name: 'Fetch case reviews',
      result: await simulateApiCall('GET', '/api/admin/case-reviews'),
    });

    steps.push({
      name: 'Fetch review stats',
      result: await simulateApiCall('GET', '/api/admin/case-reviews/stats'),
    });

    steps.push({
      name: 'Approve case review',
      result: await simulateApiCall('POST', '/api/admin/case-reviews/review-1/approve'),
    });

    return steps;
  },

  // Complete Full Platform Workflow
  completeFullPlatformWorkflow: async () => {
    const allWorkflows = [];

    allWorkflows.push({
      workflow: 'Time Tracking',
      steps: await workflowTests.completeTimeTrackingWorkflow(),
    });

    allWorkflows.push({
      workflow: 'Reports',
      steps: await workflowTests.completeReportWorkflow(),
    });

    allWorkflows.push({
      workflow: 'Cases',
      steps: await workflowTests.completeCaseManagementWorkflow(),
    });

    allWorkflows.push({
      workflow: 'Access Requests',
      steps: await workflowTests.completeAccessRequestWorkflow(),
    });

    allWorkflows.push({
      workflow: 'Vendors',
      steps: await workflowTests.completeVendorManagementWorkflow(),
    });

    allWorkflows.push({
      workflow: 'Case Reviews',
      steps: await workflowTests.completeAdminCaseReviewWorkflow(),
    });

    return allWorkflows;
  },
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export const validators = {
  // Validate API response structure
  validateApiResponse: (response: any) => {
    return response && typeof response === 'object' && 'success' in response;
  },

  // Validate user data
  validateUser: (user: any) => {
    return user && user.id && user.email && user.name;
  },

  // Validate time entry
  validateTimeEntry: (entry: any) => {
    return entry && entry.id && entry.userId && entry.duration > 0;
  },

  // Validate report
  validateReport: (report: any) => {
    return report && report.id && report.title && report.totalHours > 0;
  },

  // Validate case
  validateCase: (caseData: any) => {
    return caseData && caseData.id && caseData.caseNumber && caseData.status;
  },

  // Validate vendor
  validateVendor: (vendor: any) => {
    return vendor && vendor.id && vendor.name && vendor.status;
  },
};

// ============================================================================
// PERFORMANCE TESTING HELPERS
// ============================================================================

export const performanceHelpers = {
  // Measure API call latency
  measureApiLatency: async (method: string, endpoint: string, iterations: number = 10) => {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await simulateApiCall(method, endpoint);
      const end = performance.now();
      times.push(end - start);
    }

    return {
      min: Math.min(...times),
      max: Math.max(...times),
      avg: times.reduce((a, b) => a + b) / times.length,
      median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
    };
  },

  // Simulate bulk operations
  simulateBulkImport: async (count: number) => {
    const entries = Array.from({ length: count }, (_, i) =>
      testSetup.createTestTimeEntry({ id: `entry-${i}` })
    );

    return await simulateApiCall('POST', '/api/time-entries/bulk', { entries });
  },

  // Simulate concurrent requests
  simulateConcurrentRequests: async (endpoints: string[], concurrent: number = 5) => {
    const results: any[] = [];
    const chunks = [];

    for (let i = 0; i < endpoints.length; i += concurrent) {
      chunks.push(endpoints.slice(i, i + concurrent));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(endpoint => simulateApiCall('GET', endpoint));
      results.push(await Promise.all(promises));
    }

    return results;
  },
};

// ============================================================================
// REPORT GENERATION
// ============================================================================

export const generateTestReport = async () => {
  const report = {
    timestamp: new Date(),
    summary: {},
    workflows: {} as any,
    validations: {} as any,
    performance: {} as any,
  };

  // Run all workflows
  const fullWorkflow = await workflowTests.completeFullPlatformWorkflow();
  report.workflows = Object.fromEntries(
    fullWorkflow.map(w => [w.workflow, { success: w.steps.every(s => s.result.success) }])
  );

  // Count validations
  const allUsers = [mockUser, ...mockUsers];
  const allEntries = mockTimeEntries;
  const allReports = mockReports;

  report.validations = {
    users: allUsers.filter(u => validators.validateUser(u)).length + ' / ' + allUsers.length,
    timeEntries: allEntries.filter(e => validators.validateTimeEntry(e)).length + ' / ' + allEntries.length,
    reports: allReports.filter(r => validators.validateReport(r)).length + ' / ' + allReports.length,
  };

  // Performance stats
  report.performance = await performanceHelpers.measureApiLatency('GET', '/api/reports');

  return report;
};

export default {
  mockApiHandlers,
  simulateApiCall,
  testSetup,
  workflowTests,
  validators,
  performanceHelpers,
  generateTestReport,
};
