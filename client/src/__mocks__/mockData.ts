/**
 * Comprehensive Mock Data for Tidum Platform
 * Tests all functionalities from top to bottom
 */

// ============================================================================
// USER & AUTH MOCKS
// ============================================================================

export const mockUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'John Doe',
  role: 'admin',
  avatar: 'https://api.example.com/avatars/user-1',
  createdAt: new Date('2024-01-15'),
  lastLogin: new Date(),
};

export const mockUsers = [
  {
    id: 'user-1',
    email: 'john@example.com',
    name: 'John Doe',
    role: 'admin',
    status: 'active',
    hoursLogged: 160,
    department: 'Management',
  },
  {
    id: 'user-2',
    email: 'jane@example.com',
    name: 'Jane Smith',
    role: 'user',
    status: 'active',
    hoursLogged: 145,
    department: 'Engineering',
  },
  {
    id: 'user-3',
    email: 'bob@example.com',
    name: 'Bob Johnson',
    role: 'user',
    status: 'pending',
    hoursLogged: 0,
    department: 'Sales',
  },
  {
    id: 'user-4',
    email: 'alice@example.com',
    name: 'Alice Williams',
    role: 'vendor',
    status: 'active',
    hoursLogged: 120,
    department: 'Consulting',
  },
];

// ============================================================================
// TIME ENTRY MOCKS
// ============================================================================

export const mockTimeEntries = [
  {
    id: 'entry-1',
    userId: 'user-1',
    date: new Date('2024-02-14'),
    startTime: '08:00',
    endTime: '12:00',
    duration: 4,
    project: 'Tidum',
    task: 'Feature Development',
    description: 'Implemented time tracking dashboard',
    status: 'logged',
    type: 'work',
  },
  {
    id: 'entry-2',
    userId: 'user-1',
    date: new Date('2024-02-14'),
    startTime: '13:00',
    endTime: '17:30',
    duration: 4.5,
    project: 'Tidum',
    task: 'Code Review',
    description: 'Reviewed pull requests',
    status: 'logged',
    type: 'work',
  },
  {
    id: 'entry-3',
    userId: 'user-1',
    date: new Date('2024-02-13'),
    startTime: '08:30',
    endTime: '12:00',
    duration: 3.5,
    project: 'Client A',
    task: 'Consultation',
    description: 'Client meeting and requirements gathering',
    status: 'logged',
    type: 'work',
  },
  {
    id: 'entry-4',
    userId: 'user-2',
    date: new Date('2024-02-14'),
    startTime: '09:00',
    endTime: '17:00',
    duration: 8,
    project: 'Tidum',
    task: 'Testing',
    description: 'E2E testing',
    status: 'logged',
    type: 'work',
  },
];

export const mockWeeklyData = [
  { day: 'Mon', hours: 8, target: 8, status: 'completed' },
  { day: 'Tue', hours: 8.5, target: 8, status: 'completed' },
  { day: 'Wed', hours: 7.5, target: 8, status: 'partial' },
  { day: 'Thu', hours: 8, target: 8, status: 'completed' },
  { day: 'Fri', hours: 4.5, target: 8, status: 'in-progress' },
];

// ============================================================================
// REPORTS MOCKS
// ============================================================================

export const mockReports = [
  {
    id: 'report-1',
    title: 'January 2024 Report',
    period: 'Jan 1 - Jan 31, 2024',
    totalHours: 160,
    status: 'approved',
    createdAt: new Date('2024-02-01'),
    approvedAt: new Date('2024-02-05'),
    department: 'Engineering',
  },
  {
    id: 'report-2',
    title: 'February 2024 Report',
    period: 'Feb 1 - Feb 14, 2024',
    totalHours: 72.5,
    status: 'pending',
    createdAt: new Date('2024-02-14'),
    department: 'Management',
  },
  {
    id: 'report-3',
    title: 'December 2023 Report',
    period: 'Dec 1 - Dec 31, 2023',
    totalHours: 165,
    status: 'approved',
    createdAt: new Date('2024-01-02'),
    approvedAt: new Date('2024-01-08'),
    department: 'Sales',
  },
];

export const mockReportStats = {
  totalReports: 42,
  pendingReports: 8,
  approvedReports: 32,
  rejectedReports: 2,
  avgHoursPerReport: 155,
};

export const mockTrendAnalysis = [
  { month: 'Jan', hours: 160, target: 160, trend: 'up' },
  { month: 'Feb', hours: 145, target: 160, trend: 'down' },
  { month: 'Mar', hours: 155, target: 160, trend: 'stable' },
  { month: 'Apr', hours: 168, target: 160, trend: 'up' },
];

// ============================================================================
// CASE REPORTS MOCKS
// ============================================================================

export const mockCaseReports = [
  {
    id: 'case-1',
    caseNumber: 'CASE-2024-001',
    title: 'Client A - Initial Assessment',
    status: 'open',
    priority: 'high',
    createdAt: new Date('2024-02-01'),
    assignedTo: 'user-1',
    description: 'Initial assessment and documentation',
    evidence: ['Document A', 'Document B'],
    requiredActions: ['Follow-up', 'Documentation'],
  },
  {
    id: 'case-2',
    caseNumber: 'CASE-2024-002',
    title: 'Client B - Resolution',
    status: 'closed',
    priority: 'medium',
    createdAt: new Date('2024-01-15'),
    assignedTo: 'user-2',
    description: 'Case resolved successfully',
    evidence: ['Report.pdf'],
    requiredActions: [],
    closedAt: new Date('2024-02-10'),
  },
  {
    id: 'case-3',
    caseNumber: 'CASE-2024-003',
    title: 'Client C - Pending Review',
    status: 'pending_review',
    priority: 'low',
    createdAt: new Date('2024-02-05'),
    assignedTo: 'user-3',
    description: 'Awaiting manager review',
    evidence: ['Attachment1', 'Attachment2', 'Attachment3'],
    requiredActions: ['Manager Review'],
  },
];

export const mockCaseStats = {
  total: 156,
  open: 45,
  closed: 100,
  pending_review: 11,
  avg_resolution_time: 8.5,
};

// ============================================================================
// ACCESS REQUESTS MOCKS
// ============================================================================

export const mockAccessRequests = [
  {
    id: 'req-1',
    userId: 'user-5',
    vendorId: 'vendor-1',
    status: 'pending',
    requestedAt: new Date('2024-02-12'),
    requesterName: 'New User',
    requesterEmail: 'newuser@example.com',
    reason: 'Need access to system',
  },
  {
    id: 'req-2',
    userId: 'user-6',
    vendorId: 'vendor-2',
    status: 'approved',
    requestedAt: new Date('2024-02-08'),
    approvedAt: new Date('2024-02-09'),
    requesterName: 'Approved User',
    requesterEmail: 'approved@example.com',
    reason: 'Contractor onboarding',
  },
  {
    id: 'req-3',
    userId: 'user-7',
    vendorId: 'vendor-1',
    status: 'rejected',
    requestedAt: new Date('2024-02-01'),
    rejectedAt: new Date('2024-02-02'),
    requesterName: 'Rejected User',
    requesterEmail: 'rejected@example.com',
    reason: 'Already has access',
  },
];

export const mockAccessRequestStats = {
  total: 127,
  pending: 23,
  approved: 98,
  rejected: 6,
  approvalRate: 0.94,
};

// ============================================================================
// ADMIN CASE REVIEWS MOCKS
// ============================================================================

export const mockCaseReviews = [
  {
    id: 'review-1',
    caseId: 'case-1',
    caseNumber: 'CASE-2024-001',
    title: 'Client A - Initial Assessment',
    status: 'pending',
    submittedAt: new Date('2024-02-12'),
    submittedBy: 'user-1',
    reviewComments: [],
  },
  {
    id: 'review-2',
    caseId: 'case-2',
    caseNumber: 'CASE-2024-002',
    title: 'Client B - Resolution',
    status: 'approved',
    submittedAt: new Date('2024-02-06'),
    submittedBy: 'user-2',
    reviewedAt: new Date('2024-02-08'),
    reviewedBy: 'user-1',
    reviewComments: ['Excellent documentation', 'All required actions completed'],
  },
  {
    id: 'review-3',
    caseId: 'case-3',
    caseNumber: 'CASE-2024-003',
    title: 'Client C - Pending Review',
    status: 'needs_revision',
    submittedAt: new Date('2024-02-10'),
    submittedBy: 'user-3',
    reviewedAt: new Date('2024-02-11'),
    reviewedBy: 'user-1',
    reviewComments: ['Missing evidence', 'Please add supporting documents'],
  },
];

export const mockCaseReviewStats = {
  total: 89,
  pending: 12,
  approved: 68,
  rejected: 5,
  needs_revision: 4,
  statusDistribution: { approved: 68, pending: 12, needs_revision: 4, rejected: 5 },
};

// ============================================================================
// VENDORS MOCKS
// ============================================================================

export const mockVendors = [
  {
    id: 'vendor-1',
    name: 'Acme Consulting',
    status: 'active',
    plan: 'premium',
    users: 15,
    createdAt: new Date('2023-06-01'),
    contact: 'contact@acme.com',
    avgRating: 4.8,
  },
  {
    id: 'vendor-2',
    name: 'Tech Solutions Inc',
    status: 'active',
    plan: 'standard',
    users: 8,
    createdAt: new Date('2023-08-15'),
    contact: 'sales@techsolutions.com',
    avgRating: 4.5,
  },
  {
    id: 'vendor-3',
    name: 'Creative Agency',
    status: 'suspended',
    plan: 'basic',
    users: 3,
    createdAt: new Date('2023-10-20'),
    contact: 'hello@creative.com',
    avgRating: 3.9,
  },
  {
    id: 'vendor-4',
    name: 'Strategic Partners',
    status: 'active',
    plan: 'premium',
    users: 22,
    createdAt: new Date('2023-03-10'),
    contact: 'partnership@strategic.com',
    avgRating: 4.9,
  },
];

export const mockVendorStats = {
  total: 42,
  active: 35,
  suspended: 5,
  inactive: 2,
  totalUsers: 287,
  avgUsers: 6.8,
  planDistribution: { premium: 12, standard: 20, basic: 10 },
};

// ============================================================================
// NOTIFICATIONS MOCKS
// ============================================================================

export const mockNotifications = [
  {
    id: 'notif-1',
    title: 'Time Entry Logged',
    message: '8.5 hours logged for Tidum project',
    priority: 'info',
    timestamp: new Date(),
    read: false,
  },
  {
    id: 'notif-2',
    title: 'Report Approved',
    message: 'Your February report has been approved',
    priority: 'success',
    timestamp: new Date(Date.now() - 3600000),
    read: true,
  },
  {
    id: 'notif-3',
    title: 'Access Request',
    message: 'New access request pending review',
    priority: 'warning',
    timestamp: new Date(Date.now() - 7200000),
    read: false,
  },
  {
    id: 'notif-4',
    title: 'System Error',
    message: 'Failed to process time entry',
    priority: 'error',
    timestamp: new Date(Date.now() - 10800000),
    read: true,
  },
];

// ============================================================================
// THEME MOCKS
// ============================================================================

export const mockThemeSettings = {
  currentTheme: 'dark',
  availableThemes: ['light', 'dark', 'sepia', 'high-contrast', 'system'],
  autoSwitchSystemPreference: true,
};

// ============================================================================
// SEARCH MOCKS
// ============================================================================

export const mockSearchResults = {
  reports: [
    { id: 'report-1', title: 'January 2024 Report', type: 'report' },
    { id: 'report-2', title: 'February 2024 Report', type: 'report' },
  ],
  users: [
    { id: 'user-1', name: 'John Doe', type: 'user' },
    { id: 'user-2', name: 'Jane Smith', type: 'user' },
  ],
  cases: [
    { id: 'case-1', title: 'CASE-2024-001', type: 'case' },
    { id: 'case-2', title: 'CASE-2024-002', type: 'case' },
  ],
  entries: [
    { id: 'entry-1', task: 'Feature Development', type: 'entry' },
  ],
  pages: [
    { id: 'page-1', name: 'Dashboard', type: 'page' },
    { id: 'page-2', name: 'Time Tracking', type: 'page' },
  ],
};

// ============================================================================
// EXPORT MOCKS
// ============================================================================

export const mockExportData = {
  format: 'csv|excel|pdf',
  data: mockTimeEntries,
  fileName: 'time-entries-2024-02',
  timestamp: new Date(),
};

// ============================================================================
// ANALYTICS MOCKS
// ============================================================================

export const mockAnalytics = {
  timeTracking: {
    totalHoursThisWeek: 36.5,
    totalHoursThisMonth: 145.5,
    averagePerDay: 7.3,
    projectBreakdown: [
      { project: 'Tidum', hours: 65, percentage: 45 },
      { project: 'Client A', hours: 45, percentage: 31 },
      { project: 'Client B', hours: 35.5, percentage: 24 },
    ],
  },
  reports: {
    departmentStats: {
      Engineering: { count: 12, totalHours: 1920 },
      Management: { count: 8, totalHours: 1280 },
      Sales: { count: 10, totalHours: 1600 },
    },
    userStats: {
      activeUsers: 24,
      completedReports: 28,
      pendingReports: 4,
    },
  },
  cases: {
    openCases: 45,
    closedThisMonth: 15,
    avgResolutionDays: 8.5,
    priorityBreakdown: {
      high: 12,
      medium: 20,
      low: 13,
    },
  },
  vendors: {
    activeVendors: 35,
    totalUsers: 287,
    avgUsersPerVendor: 8.2,
    topVendors: [
      { name: 'Acme Consulting', hours: 450 },
      { name: 'Strategic Partners', hours: 380 },
    ],
  },
};

// ============================================================================
// FILTER & SORT MOCKS
// ============================================================================

export const mockFilterOptions = {
  status: ['active', 'pending', 'completed', 'archived'],
  priority: ['high', 'medium', 'low'],
  department: ['Engineering', 'Management', 'Sales', 'HR', 'Finance'],
  dateRange: ['today', 'this_week', 'this_month', 'custom'],
};

export const mockSortOptions = [
  { label: 'Newest', value: 'desc' },
  { label: 'Oldest', value: 'asc' },
  { label: 'Name A-Z', value: 'name' },
  { label: 'Hours High to Low', value: 'hours-desc' },
];

// ============================================================================
// ERROR & EDGE CASES MOCKS
// ============================================================================

export const mockErrorScenarios = {
  networkError: new Error('Network request failed'),
  validationError: { field: 'email', message: 'Invalid email format' },
  unauthorizedError: new Error('Unauthorized: Please log in'),
  notFoundError: new Error('Resource not found'),
  conflictError: new Error('Resource already exists'),
};

export const mockEmptyStates = {
  noTimeEntries: [],
  noReports: [],
  noCases: [],
  noNotifications: [],
  noResults: { reports: [], users: [], cases: [] },
};

// ============================================================================
// PAGINATION MOCKS
// ============================================================================

export const mockPaginatedResponse = {
  items: mockTimeEntries,
  total: 234,
  page: 1,
  pageSize: 10,
  totalPages: 24,
  hasNextPage: true,
  hasPreviousPage: false,
};

// ============================================================================
// BULK OPERATION MOCKS
// ============================================================================

export const mockBulkOperations = {
  selectedIds: ['entry-1', 'entry-2', 'entry-3'],
  operation: 'export',
  status: 'processing',
  progress: 65,
  result: { exported: 3, failed: 0 },
};
