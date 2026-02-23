import { 
  type User, type InsertUser, type TimeEntry, type InsertTimeEntry, type Activity, type InsertActivity,
  type LogRow, type CompanyUser,
  type TimerSession, type InsertTimerSession,
  type SiteSetting, type LandingHero, type InsertLandingHero,
  type LandingFeature, type InsertLandingFeature, type LandingTestimonial, type InsertLandingTestimonial,
  type LandingCta, type InsertLandingCta,
  type WhyPageHero, type InsertWhyPageHero, type WhyPageStat, type InsertWhyPageStat,
  type WhyPageBenefit, type InsertWhyPageBenefit, type WhyPageFeature, type InsertWhyPageFeature,
  type WhyPageContent, type InsertWhyPageContent,
  type DashboardTask, type UserTaskPrefs,
  logRow, companyUsers, timerSessions,
  siteSettings, landingHero, landingFeatures, landingTestimonials, landingCta,
  whyPageHero, whyPageStats, whyPageBenefits, whyPageFeatures, whyPageContent,
  dashboardTasks, userTaskPrefs
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

// ── Task learning types ──
export interface TaskPrefsData {
  keywordLinks: Record<string, Record<string, number>>; // token → { url: count }
  linkUsage: Record<string, number>;                     // url → total uses
  totalCreated: number;
  totalCompleted: number;
  recentCompletionMs: number[];                          // last 20 task completion durations
}

export type TaskEvent =
  | { type: "task_created"; title: string; linkedUrl?: string | null }
  | { type: "task_completed"; createdAtMs: number };

export interface TimeTrackingFeedbackEvent {
  suggestionType: "project" | "description" | "hours" | "bulk_copy_prev_month" | "apply_all" | "manual_prefill";
  outcome: "accepted" | "rejected";
  date?: string | null;
  suggestedValue?: string | null;
  chosenValue?: string | null;
  metadata?: Record<string, unknown> | null;
  timestamp?: string;
}

export interface CaseReportingFeedbackEvent {
  suggestionType: string;
  outcome: "accepted" | "rejected";
  month?: string | null;
  caseId?: string | null;
  suggestedValue?: string | null;
  chosenValue?: string | null;
  metadata?: Record<string, unknown> | null;
  timestamp?: string;
}

export interface TimeTrackingFeedbackCount {
  accepted: number;
  rejected: number;
}

export interface TimeTrackingPrefsData {
  feedbackByType: Record<string, TimeTrackingFeedbackCount>;
  recentFeedback: Array<{
    suggestionType: string;
    outcome: "accepted" | "rejected";
    date?: string | null;
    suggestedValue?: string | null;
    chosenValue?: string | null;
    timestamp: string;
  }>;
  totalAccepted: number;
  totalRejected: number;
}

export interface CaseReportingFeedbackCount {
  accepted: number;
  rejected: number;
}

export interface CaseReportingPrefsData {
  feedbackByType: Record<string, CaseReportingFeedbackCount>;
  recentFeedback: Array<{
    suggestionType: string;
    outcome: "accepted" | "rejected";
    month?: string | null;
    caseId?: string | null;
    suggestedValue?: string | null;
    chosenValue?: string | null;
    timestamp: string;
  }>;
  totalAccepted: number;
  totalRejected: number;
}

export type SuggestionMode = "off" | "dashboard_only" | "balanced" | "proactive";
export type SuggestionFrequency = "low" | "normal" | "high";
export type SuggestionBlockCategory = "project" | "description" | "case_id";

export interface SuggestionBlockedData {
  projects: string[];
  descriptions: string[];
  caseIds: string[];
}

export interface SuggestionSettingsData {
  mode: SuggestionMode;
  frequency: SuggestionFrequency;
  confidenceThreshold: number;
  blocked: SuggestionBlockedData;
  userOverride: boolean;
  updatedAt: string;
}

const EMPTY_PREFS: TaskPrefsData = {
  keywordLinks: {},
  linkUsage: {},
  totalCreated: 0,
  totalCompleted: 0,
  recentCompletionMs: [],
};

const EMPTY_TIME_TRACKING_PREFS: TimeTrackingPrefsData = {
  feedbackByType: {},
  recentFeedback: [],
  totalAccepted: 0,
  totalRejected: 0,
};

const EMPTY_CASE_REPORTING_PREFS: CaseReportingPrefsData = {
  feedbackByType: {},
  recentFeedback: [],
  totalAccepted: 0,
  totalRejected: 0,
};

const EMPTY_SUGGESTION_SETTINGS: SuggestionSettingsData = {
  mode: "balanced",
  frequency: "normal",
  confidenceThreshold: 0.45,
  blocked: {
    projects: [],
    descriptions: [],
    caseIds: [],
  },
  userOverride: false,
  updatedAt: new Date(0).toISOString(),
};

function normalizeBlockedValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Map<string, string>();
  raw.forEach((value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, trimmed);
    }
  });
  return Array.from(unique.values()).slice(-120);
}

function normalizeBlockedSuggestions(raw: unknown): SuggestionBlockedData {
  if (!raw || typeof raw !== "object") {
    return {
      projects: [],
      descriptions: [],
      caseIds: [],
    };
  }

  const blockedRaw = raw as Record<string, unknown>;

  return {
    projects: normalizeBlockedValues(blockedRaw.projects),
    descriptions: normalizeBlockedValues(blockedRaw.descriptions),
    caseIds: normalizeBlockedValues(blockedRaw.caseIds),
  };
}

function normalizeTimeTrackingPrefs(raw: any): TimeTrackingPrefsData {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_TIME_TRACKING_PREFS };
  }

  const recentFeedback = Array.isArray(raw.recentFeedback)
    ? raw.recentFeedback
        .map((item: any) => ({
          suggestionType: String(item?.suggestionType || ""),
          outcome: item?.outcome === "accepted" ? "accepted" : "rejected",
          date: item?.date ?? null,
          suggestedValue: item?.suggestedValue ?? null,
          chosenValue: item?.chosenValue ?? null,
          timestamp: typeof item?.timestamp === "string" && item.timestamp ? item.timestamp : new Date().toISOString(),
        }))
        .filter((item: { suggestionType: string }) => item.suggestionType)
    : [];

  const feedbackByTypeRaw = raw.feedbackByType && typeof raw.feedbackByType === "object"
    ? raw.feedbackByType
    : {};

  const feedbackByType: Record<string, TimeTrackingFeedbackCount> = {};
  Object.entries(feedbackByTypeRaw as Record<string, any>).forEach(([key, value]) => {
    feedbackByType[key] = {
      accepted: Number((value as any)?.accepted || 0),
      rejected: Number((value as any)?.rejected || 0),
    };
  });

  return {
    feedbackByType,
    recentFeedback,
    totalAccepted: Number(raw.totalAccepted || 0),
    totalRejected: Number(raw.totalRejected || 0),
  };
}

function normalizeCaseReportingPrefs(raw: any): CaseReportingPrefsData {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_CASE_REPORTING_PREFS };
  }

  const recentFeedback = Array.isArray(raw.recentFeedback)
    ? raw.recentFeedback
        .map((item: any) => ({
          suggestionType: String(item?.suggestionType || ""),
          outcome: item?.outcome === "accepted" ? "accepted" : "rejected",
          month: item?.month ?? null,
          caseId: item?.caseId ?? null,
          suggestedValue: item?.suggestedValue ?? null,
          chosenValue: item?.chosenValue ?? null,
          timestamp: typeof item?.timestamp === "string" && item.timestamp ? item.timestamp : new Date().toISOString(),
        }))
        .filter((item: { suggestionType: string }) => item.suggestionType)
    : [];

  const feedbackByTypeRaw = raw.feedbackByType && typeof raw.feedbackByType === "object"
    ? raw.feedbackByType
    : {};

  const feedbackByType: Record<string, CaseReportingFeedbackCount> = {};
  Object.entries(feedbackByTypeRaw as Record<string, any>).forEach(([key, value]) => {
    feedbackByType[key] = {
      accepted: Number((value as any)?.accepted || 0),
      rejected: Number((value as any)?.rejected || 0),
    };
  });

  return {
    feedbackByType,
    recentFeedback,
    totalAccepted: Number(raw.totalAccepted || 0),
    totalRejected: Number(raw.totalRejected || 0),
  };
}

function normalizeSuggestionSettings(raw: any): SuggestionSettingsData {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_SUGGESTION_SETTINGS };
  }

  const modeRaw = typeof raw.mode === "string" ? raw.mode : EMPTY_SUGGESTION_SETTINGS.mode;
  const frequencyRaw = typeof raw.frequency === "string" ? raw.frequency : EMPTY_SUGGESTION_SETTINGS.frequency;
  const updatedAtRaw = typeof raw.updatedAt === "string" && raw.updatedAt
    ? raw.updatedAt
    : EMPTY_SUGGESTION_SETTINGS.updatedAt;
  const confidenceThresholdRaw = Number(raw.confidenceThreshold);
  const confidenceThreshold = Number.isFinite(confidenceThresholdRaw)
    ? Math.max(0.2, Math.min(0.95, confidenceThresholdRaw))
    : EMPTY_SUGGESTION_SETTINGS.confidenceThreshold;
  const blocked = normalizeBlockedSuggestions(raw.blocked);
  const userOverride = typeof raw.userOverride === "boolean"
    ? raw.userOverride
    : EMPTY_SUGGESTION_SETTINGS.userOverride;

  const mode: SuggestionMode = (
    modeRaw === "off" ||
    modeRaw === "dashboard_only" ||
    modeRaw === "balanced" ||
    modeRaw === "proactive"
  ) ? modeRaw : EMPTY_SUGGESTION_SETTINGS.mode;

  const frequency: SuggestionFrequency = (
    frequencyRaw === "low" ||
    frequencyRaw === "normal" ||
    frequencyRaw === "high"
  ) ? frequencyRaw : EMPTY_SUGGESTION_SETTINGS.frequency;

  return {
    mode,
    frequency,
    confidenceThreshold,
    blocked,
    userOverride,
    updatedAt: updatedAtRaw,
  };
}

function applyEvent(prefs: TaskPrefsData, event: TaskEvent): TaskPrefsData {
  const p = { ...prefs, keywordLinks: { ...prefs.keywordLinks }, linkUsage: { ...prefs.linkUsage } };
  if (event.type === "task_created") {
    p.totalCreated++;
    if (event.linkedUrl) {
      p.linkUsage[event.linkedUrl] = (p.linkUsage[event.linkedUrl] ?? 0) + 1;
      const tokens = event.title.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        if (!p.keywordLinks[token]) p.keywordLinks[token] = {};
        p.keywordLinks[token][event.linkedUrl] = (p.keywordLinks[token][event.linkedUrl] ?? 0) + 1;
      }
    }
  } else if (event.type === "task_completed") {
    p.totalCompleted++;
    const ms = Date.now() - event.createdAtMs;
    if (ms > 0) {
      p.recentCompletionMs = [...(prefs.recentCompletionMs ?? []).slice(-19), ms];
    }
  }
  return p;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<User>): Promise<User | undefined>;
  
  getTimeEntries(filters?: { userId?: string; startDate?: string; endDate?: string; status?: string }): Promise<TimeEntry[]>;
  getTimeEntry(id: string): Promise<TimeEntry | undefined>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, entry: Partial<TimeEntry>): Promise<TimeEntry | undefined>;
  deleteTimeEntry(id: string): Promise<boolean>;

  getTimerSession(userId: string): Promise<TimerSession | undefined>;
  upsertTimerSession(session: InsertTimerSession): Promise<TimerSession>;
  deleteTimerSession(userId: string): Promise<boolean>;
  
  getActivities(limit?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  
  getStats(range?: string): Promise<{
    totalHours: number;
    activeUsers: number;
    pendingApprovals: number;
    casesThisWeek: number;
    hoursTrend: number;
    usersTrend: number;
    approvalsTrend: number;
    casesTrend: number;
  }>;
  
  seedData(): Promise<void>;

  // Dashboard tasks
  getDashboardTasks(userId: string): Promise<DashboardTask[]>;
  createDashboardTask(userId: string, title: string, linkedUrl?: string, linkedLabel?: string): Promise<DashboardTask>;
  updateDashboardTask(id: number, userId: string, data: Partial<Pick<DashboardTask, 'title' | 'done' | 'linkedUrl' | 'linkedLabel' | 'snoozedUntil'>>): Promise<DashboardTask | undefined>;
  deleteDashboardTask(id: number, userId: string): Promise<boolean>;

  // Task learning
  getUserTaskPrefs(userId: string): Promise<TaskPrefsData>;
  recordTaskEvent(userId: string, event: TaskEvent): Promise<void>;
  getUserTimeTrackingPrefs(userId: string): Promise<TimeTrackingPrefsData>;
  recordTimeTrackingFeedback(userId: string, event: TimeTrackingFeedbackEvent): Promise<void>;
  getUserCaseReportingPrefs(userId: string): Promise<CaseReportingPrefsData>;
  recordCaseReportingFeedback(userId: string, event: CaseReportingFeedbackEvent): Promise<void>;
  getUserSuggestionSettings(userId: string): Promise<SuggestionSettingsData>;
  updateUserSuggestionSettings(userId: string, patch: Partial<SuggestionSettingsData>): Promise<SuggestionSettingsData>;
  addUserSuggestionBlock(userId: string, block: { category: SuggestionBlockCategory; value: string }): Promise<SuggestionSettingsData>;
  removeUserSuggestionBlock(userId: string, block: { category: SuggestionBlockCategory; value: string }): Promise<SuggestionSettingsData>;

  // CMS Methods
  getSiteSettings(): Promise<SiteSetting[]>;
  getSiteSetting(key: string): Promise<SiteSetting | undefined>;
  upsertSiteSetting(key: string, value: string): Promise<SiteSetting>;
  
  getLandingHero(): Promise<LandingHero | undefined>;
  upsertLandingHero(data: InsertLandingHero): Promise<LandingHero>;
  
  getLandingFeatures(): Promise<LandingFeature[]>;
  createLandingFeature(data: InsertLandingFeature): Promise<LandingFeature>;
  updateLandingFeature(id: number, data: Partial<InsertLandingFeature>): Promise<LandingFeature | undefined>;
  deleteLandingFeature(id: number): Promise<boolean>;
  
  getLandingTestimonials(): Promise<LandingTestimonial[]>;
  createLandingTestimonial(data: InsertLandingTestimonial): Promise<LandingTestimonial>;
  updateLandingTestimonial(id: number, data: Partial<InsertLandingTestimonial>): Promise<LandingTestimonial | undefined>;
  deleteLandingTestimonial(id: number): Promise<boolean>;
  
  getLandingCta(): Promise<LandingCta | undefined>;
  upsertLandingCta(data: InsertLandingCta): Promise<LandingCta>;
  
  // Why Page Methods
  getWhyPageHero(): Promise<WhyPageHero | undefined>;
  upsertWhyPageHero(data: InsertWhyPageHero): Promise<WhyPageHero>;
  
  getWhyPageStats(): Promise<WhyPageStat[]>;
  createWhyPageStat(data: InsertWhyPageStat): Promise<WhyPageStat>;
  updateWhyPageStat(id: number, data: Partial<InsertWhyPageStat>): Promise<WhyPageStat | undefined>;
  deleteWhyPageStat(id: number): Promise<boolean>;
  
  getWhyPageBenefits(): Promise<WhyPageBenefit[]>;
  createWhyPageBenefit(data: InsertWhyPageBenefit): Promise<WhyPageBenefit>;
  updateWhyPageBenefit(id: number, data: Partial<InsertWhyPageBenefit>): Promise<WhyPageBenefit | undefined>;
  deleteWhyPageBenefit(id: number): Promise<boolean>;
  
  getWhyPageFeatures(): Promise<WhyPageFeature[]>;
  createWhyPageFeature(data: InsertWhyPageFeature): Promise<WhyPageFeature>;
  updateWhyPageFeature(id: number, data: Partial<InsertWhyPageFeature>): Promise<WhyPageFeature | undefined>;
  deleteWhyPageFeature(id: number): Promise<boolean>;
  
  getWhyPageContent(sectionId: string): Promise<WhyPageContent | undefined>;
  upsertWhyPageContent(sectionId: string, data: InsertWhyPageContent): Promise<WhyPageContent>;
}

export class ExternalDbStorage implements IStorage {
  private isExternalDb: boolean;

  constructor() {
    this.isExternalDb = !!process.env.EXTERNAL_DATABASE_URL;
  }

  async getUser(id: string): Promise<User | undefined> {
    if (this.isExternalDb) {
      const result = await db.select().from(companyUsers).where(eq(companyUsers.id, parseInt(id))).limit(1);
      if (!result[0]) return undefined;
      return this.mapCompanyUserToUser(result[0]);
    }
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (this.isExternalDb) {
      const result = await db.select().from(companyUsers).where(eq(companyUsers.userEmail, username)).limit(1);
      if (!result[0]) return undefined;
      return this.mapCompanyUserToUser(result[0]);
    }
    return undefined;
  }

  async getAllUsers(): Promise<User[]> {
    if (this.isExternalDb) {
      const result = await db.select().from(companyUsers);
      return result.map(cu => this.mapCompanyUserToUser(cu));
    }
    return [];
  }

  private mapCompanyUserToUser(cu: CompanyUser): User {
    return {
      id: cu.id.toString(),
      username: cu.userEmail,
      name: cu.userEmail.split('@')[0],
      email: cu.userEmail,
      role: cu.role || 'member',
      department: null,
      status: cu.approved ? 'active' : 'pending',
      hoursThisWeek: 0,
      pendingApprovals: 0,
    };
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(companyUsers).values({
      companyId: 1,
      userEmail: user.email,
      role: user.role,
      approved: user.status === 'active',
    }).returning();
    return this.mapCompanyUserToUser(result[0]);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(companyUsers)
      .set({ 
        role: updates.role,
        approved: updates.status === 'active',
      })
      .where(eq(companyUsers.id, parseInt(id)))
      .returning();
    if (!result[0]) return undefined;
    return this.mapCompanyUserToUser(result[0]);
  }

  async getTimeEntries(filters?: { userId?: string; startDate?: string; endDate?: string; status?: string }): Promise<TimeEntry[]> {
    if (this.isExternalDb) {
      const conditions = [];
      if (filters?.userId) conditions.push(eq(logRow.userId, filters.userId));
      if (filters?.startDate) conditions.push(gte(logRow.date, filters.startDate));
      if (filters?.endDate) conditions.push(lte(logRow.date, filters.endDate));
      
      let result;
      if (conditions.length > 0) {
        result = await db.select().from(logRow).where(and(...conditions)).orderBy(desc(logRow.createdAt)).limit(100);
      } else {
        result = await db.select().from(logRow).orderBy(desc(logRow.createdAt)).limit(100);
      }
      return result.map(lr => this.mapLogRowToTimeEntry(lr));
    }
    return [];
  }

  private mapLogRowToTimeEntry(lr: LogRow): TimeEntry {
    const start = lr.startTime ? new Date(`2000-01-01T${lr.startTime}`) : new Date();
    const end = lr.endTime ? new Date(`2000-01-01T${lr.endTime}`) : new Date();
    const breakHrs = parseFloat(lr.breakHours?.toString() || '0');
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60) - breakHrs;
    
    return {
      id: lr.id,
      userId: lr.userId || 'default',
      caseNumber: lr.project || null,
      description: lr.title || lr.activity || 'Work',
      hours: Math.max(0, hours),
      date: lr.date?.toString() || new Date().toISOString().split('T')[0],
      status: 'approved',
      createdAt: lr.createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    const result = await db.select().from(logRow).where(eq(logRow.id, id)).limit(1);
    if (!result[0]) return undefined;
    return this.mapLogRowToTimeEntry(result[0]);
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const result = await db.insert(logRow).values({
      userId: entry.userId,
      date: entry.date,
      startTime: '09:00',
      endTime: `${9 + Math.floor(entry.hours)}:${Math.round((entry.hours % 1) * 60).toString().padStart(2, '0')}`,
      title: entry.description,
      project: entry.caseNumber || undefined,
      activity: 'Work',
    }).returning();
    return this.mapLogRowToTimeEntry(result[0]);
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry | undefined> {
    const updateData: any = {};
    if (updates.description) updateData.title = updates.description;
    if (updates.caseNumber) updateData.project = updates.caseNumber;
    
    const result = await db.update(logRow).set(updateData).where(eq(logRow.id, id)).returning();
    if (!result[0]) return undefined;
    return this.mapLogRowToTimeEntry(result[0]);
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    const result = await db.delete(logRow).where(eq(logRow.id, id)).returning();
    return result.length > 0;
  }

  async getTimerSession(userId: string): Promise<TimerSession | undefined> {
    const result = await db.select().from(timerSessions).where(eq(timerSessions.userId, userId)).limit(1);
    return result[0];
  }

  async upsertTimerSession(session: InsertTimerSession): Promise<TimerSession> {
    const result = await db
      .insert(timerSessions)
      .values({
        userId: session.userId,
        elapsedSeconds: session.elapsedSeconds ?? 0,
        pausedSeconds: session.pausedSeconds ?? 0,
        isRunning: session.isRunning ?? true,
        pauseStartedAt: session.pauseStartedAt ?? null,
      })
      .onConflictDoUpdate({
        target: timerSessions.userId,
        set: {
          elapsedSeconds: session.elapsedSeconds ?? 0,
          pausedSeconds: session.pausedSeconds ?? 0,
          isRunning: session.isRunning ?? true,
          pauseStartedAt: session.pauseStartedAt ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  }

  async deleteTimerSession(userId: string): Promise<boolean> {
    const result = await db.delete(timerSessions).where(eq(timerSessions.userId, userId)).returning();
    return result.length > 0;
  }

  async getActivities(limit?: number): Promise<Activity[]> {
    if (this.isExternalDb) {
      try {
        const result = await pool.query(
          `SELECT id, actor_company_user_id, action, target_type, target_id, created_at 
           FROM company_audit_log 
           ORDER BY created_at DESC 
           LIMIT $1`,
          [limit || 10]
        );
        return result.rows.map((log: any) => ({
          id: log.id.toString(),
          userId: log.actor_company_user_id?.toString() || '0',
          action: log.action || 'activity',
          description: `${log.action || 'Activity'} - ${log.target_type || ''} ${log.target_id || ''}`,
          timestamp: log.created_at?.toISOString() || new Date().toISOString(),
        }));
      } catch (err) {
        console.error('Error fetching activities:', err);
        return [];
      }
    }
    return [];
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    try {
      const result = await pool.query(
        `INSERT INTO company_audit_log (company_id, action, target_type, details, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, created_at`,
        [1, activity.action, 'activity', JSON.stringify({ description: activity.description })]
      );
      return {
        id: result.rows[0].id.toString(),
        userId: activity.userId,
        action: activity.action,
        description: activity.description,
        timestamp: result.rows[0].created_at?.toISOString() || new Date().toISOString(),
      };
    } catch (err) {
      console.error('Error creating activity:', err);
      return {
        id: Date.now().toString(),
        userId: activity.userId,
        action: activity.action,
        description: activity.description,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getStats(range?: string): Promise<{
    totalHours: number;
    activeUsers: number;
    pendingApprovals: number;
    casesThisWeek: number;
    hoursTrend: number;
    usersTrend: number;
    approvalsTrend: number;
    casesTrend: number;
  }> {
    const now = new Date();
    let startDate: Date;
    
    switch (range) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "week":
      default:
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
    }
    
    const startDateStr = startDate.toISOString().split('T')[0];
    
    if (this.isExternalDb) {
      const entries = await db.select().from(logRow).where(gte(logRow.date, startDateStr));
      const users = await db.select().from(companyUsers);
      
      let totalHours = 0;
      entries.forEach(lr => {
        const start = lr.startTime ? new Date(`2000-01-01T${lr.startTime}`) : new Date();
        const end = lr.endTime ? new Date(`2000-01-01T${lr.endTime}`) : new Date();
        const breakHrs = parseFloat(lr.breakHours?.toString() || '0');
        totalHours += Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60) - breakHrs);
      });
      
      const activeUsers = users.filter(u => u.approved).length;
      const uniqueProjects = new Set(entries.map(e => e.project).filter(Boolean)).size;
      
      return {
        totalHours: Math.round(totalHours * 10) / 10,
        activeUsers,
        pendingApprovals: users.filter(u => !u.approved).length,
        casesThisWeek: uniqueProjects,
        hoursTrend: 0,
        usersTrend: 0,
        approvalsTrend: 0,
        casesTrend: 0,
      };
    }
    
    return {
      totalHours: 0,
      activeUsers: 0,
      pendingApprovals: 0,
      casesThisWeek: 0,
      hoursTrend: 0,
      usersTrend: 0,
      approvalsTrend: 0,
      casesTrend: 0,
    };
  }

  async seedData(): Promise<void> {
    console.log("Using external database - no seeding needed");
  }

  // CMS Methods
  async getSiteSettings(): Promise<SiteSetting[]> {
    return await db.select().from(siteSettings);
  }

  async getSiteSetting(key: string): Promise<SiteSetting | undefined> {
    const result = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
    return result[0];
  }

  async upsertSiteSetting(key: string, value: string): Promise<SiteSetting> {
    const existing = await this.getSiteSetting(key);
    if (existing) {
      const result = await db.update(siteSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(siteSettings.key, key))
        .returning();
      return result[0];
    }
    const result = await db.insert(siteSettings).values({ key, value }).returning();
    return result[0];
  }

  async getLandingHero(): Promise<LandingHero | undefined> {
    const result = await db.select().from(landingHero).where(eq(landingHero.isActive, true)).limit(1);
    return result[0];
  }

  async upsertLandingHero(data: InsertLandingHero): Promise<LandingHero> {
    const existing = await this.getLandingHero();
    if (existing) {
      const result = await db.update(landingHero)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(landingHero.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(landingHero).values(data).returning();
    return result[0];
  }

  async getLandingFeatures(): Promise<LandingFeature[]> {
    return await db.select().from(landingFeatures)
      .where(eq(landingFeatures.isActive, true))
      .orderBy(landingFeatures.displayOrder);
  }

  async createLandingFeature(data: InsertLandingFeature): Promise<LandingFeature> {
    const result = await db.insert(landingFeatures).values(data).returning();
    return result[0];
  }

  async updateLandingFeature(id: number, data: Partial<InsertLandingFeature>): Promise<LandingFeature | undefined> {
    const result = await db.update(landingFeatures)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(landingFeatures.id, id))
      .returning();
    return result[0];
  }

  async deleteLandingFeature(id: number): Promise<boolean> {
    const result = await db.delete(landingFeatures).where(eq(landingFeatures.id, id)).returning();
    return result.length > 0;
  }

  async getLandingTestimonials(): Promise<LandingTestimonial[]> {
    return await db.select().from(landingTestimonials)
      .where(eq(landingTestimonials.isActive, true))
      .orderBy(landingTestimonials.displayOrder);
  }

  async createLandingTestimonial(data: InsertLandingTestimonial): Promise<LandingTestimonial> {
    const result = await db.insert(landingTestimonials).values(data).returning();
    return result[0];
  }

  async updateLandingTestimonial(id: number, data: Partial<InsertLandingTestimonial>): Promise<LandingTestimonial | undefined> {
    const result = await db.update(landingTestimonials)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(landingTestimonials.id, id))
      .returning();
    return result[0];
  }

  async deleteLandingTestimonial(id: number): Promise<boolean> {
    const result = await db.delete(landingTestimonials).where(eq(landingTestimonials.id, id)).returning();
    return result.length > 0;
  }

  async getLandingCta(): Promise<LandingCta | undefined> {
    const result = await db.select().from(landingCta).where(eq(landingCta.isActive, true)).limit(1);
    return result[0];
  }

  async upsertLandingCta(data: InsertLandingCta): Promise<LandingCta> {
    const existing = await this.getLandingCta();
    if (existing) {
      const result = await db.update(landingCta)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(landingCta.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(landingCta).values(data).returning();
    return result[0];
  }

  // Why Page Methods
  async getWhyPageHero(): Promise<WhyPageHero | undefined> {
    const result = await db.select().from(whyPageHero).where(eq(whyPageHero.isActive, true)).limit(1);
    return result[0];
  }

  async upsertWhyPageHero(data: InsertWhyPageHero): Promise<WhyPageHero> {
    const existing = await this.getWhyPageHero();
    if (existing) {
      const result = await db.update(whyPageHero)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(whyPageHero.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(whyPageHero).values(data).returning();
    return result[0];
  }

  async getWhyPageStats(): Promise<WhyPageStat[]> {
    return await db.select().from(whyPageStats)
      .where(eq(whyPageStats.isActive, true))
      .orderBy(whyPageStats.displayOrder);
  }

  async createWhyPageStat(data: InsertWhyPageStat): Promise<WhyPageStat> {
    const result = await db.insert(whyPageStats).values(data).returning();
    return result[0];
  }

  async updateWhyPageStat(id: number, data: Partial<InsertWhyPageStat>): Promise<WhyPageStat | undefined> {
    const result = await db.update(whyPageStats)
      .set(data)
      .where(eq(whyPageStats.id, id))
      .returning();
    return result[0];
  }

  async deleteWhyPageStat(id: number): Promise<boolean> {
    await db.update(whyPageStats).set({ isActive: false }).where(eq(whyPageStats.id, id));
    return true;
  }

  async getWhyPageBenefits(): Promise<WhyPageBenefit[]> {
    return await db.select().from(whyPageBenefits)
      .where(eq(whyPageBenefits.isActive, true))
      .orderBy(whyPageBenefits.displayOrder);
  }

  async createWhyPageBenefit(data: InsertWhyPageBenefit): Promise<WhyPageBenefit> {
    const result = await db.insert(whyPageBenefits).values(data).returning();
    return result[0];
  }

  async updateWhyPageBenefit(id: number, data: Partial<InsertWhyPageBenefit>): Promise<WhyPageBenefit | undefined> {
    const result = await db.update(whyPageBenefits)
      .set(data)
      .where(eq(whyPageBenefits.id, id))
      .returning();
    return result[0];
  }

  async deleteWhyPageBenefit(id: number): Promise<boolean> {
    await db.update(whyPageBenefits).set({ isActive: false }).where(eq(whyPageBenefits.id, id));
    return true;
  }

  async getWhyPageFeatures(): Promise<WhyPageFeature[]> {
    return await db.select().from(whyPageFeatures)
      .where(eq(whyPageFeatures.isActive, true))
      .orderBy(whyPageFeatures.displayOrder);
  }

  async createWhyPageFeature(data: InsertWhyPageFeature): Promise<WhyPageFeature> {
    const result = await db.insert(whyPageFeatures).values(data).returning();
    return result[0];
  }

  async updateWhyPageFeature(id: number, data: Partial<InsertWhyPageFeature>): Promise<WhyPageFeature | undefined> {
    const result = await db.update(whyPageFeatures)
      .set(data)
      .where(eq(whyPageFeatures.id, id))
      .returning();
    return result[0];
  }

  async deleteWhyPageFeature(id: number): Promise<boolean> {
    await db.update(whyPageFeatures).set({ isActive: false }).where(eq(whyPageFeatures.id, id));
    return true;
  }

  async getWhyPageContent(sectionId: string): Promise<WhyPageContent | undefined> {
    const result = await db.select().from(whyPageContent).where(eq(whyPageContent.sectionId, sectionId)).limit(1);
    return result[0];
  }

  async upsertWhyPageContent(sectionId: string, data: InsertWhyPageContent): Promise<WhyPageContent> {
    const existing = await this.getWhyPageContent(sectionId);
    if (existing) {
      const result = await db.update(whyPageContent)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(whyPageContent.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(whyPageContent).values({ ...data, sectionId }).returning();
    return result[0];
  }

  // ── Dashboard tasks ──
  async getDashboardTasks(userId: string): Promise<DashboardTask[]> {
    return db.select().from(dashboardTasks)
      .where(eq(dashboardTasks.userId, userId))
      .orderBy(dashboardTasks.createdAt);
  }

  async createDashboardTask(userId: string, title: string, linkedUrl?: string, linkedLabel?: string): Promise<DashboardTask> {
    const [row] = await db.insert(dashboardTasks)
      .values({ userId, title, done: false, linkedUrl: linkedUrl ?? null, linkedLabel: linkedLabel ?? null })
      .returning();
    return row;
  }

  async updateDashboardTask(id: number, userId: string, data: Partial<Pick<DashboardTask, 'title' | 'done' | 'linkedUrl' | 'linkedLabel' | 'snoozedUntil'>>): Promise<DashboardTask | undefined> {
    const [row] = await db.update(dashboardTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(dashboardTasks.id, id), eq(dashboardTasks.userId, userId)))
      .returning();
    return row;
  }

  async deleteDashboardTask(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(dashboardTasks)
      .where(and(eq(dashboardTasks.id, id), eq(dashboardTasks.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Task learning ──
  async getUserTaskPrefs(userId: string): Promise<TaskPrefsData> {
    const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
    if (!row) return { ...EMPTY_PREFS };
    const rawRoot = (row.prefs ?? {}) as Record<string, unknown>;
    const raw = rawRoot as Partial<TaskPrefsData>;

    // Keep unknown keys in the object so other learning domains (time tracking)
    // survive task-pref updates that upsert the same JSON blob.
    return {
      ...(rawRoot as any),
      keywordLinks: raw.keywordLinks ?? {},
      linkUsage: raw.linkUsage ?? {},
      totalCreated: raw.totalCreated ?? 0,
      totalCompleted: raw.totalCompleted ?? 0,
      recentCompletionMs: raw.recentCompletionMs ?? [],
    };
  }

  async recordTaskEvent(userId: string, event: TaskEvent): Promise<void> {
    const current = await this.getUserTaskPrefs(userId);
    const updated = applyEvent(current, event);
    await db.insert(userTaskPrefs)
      .values({ userId, prefs: updated as any, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userTaskPrefs.userId,
        set: { prefs: updated as any, updatedAt: new Date() },
      });
  }

  async getUserTimeTrackingPrefs(userId: string): Promise<TimeTrackingPrefsData> {
    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      if (!row) return { ...EMPTY_TIME_TRACKING_PREFS };
      const rawRoot = (row.prefs ?? {}) as Record<string, unknown>;
      const rawTimeTracking = (rawRoot.timeTracking ?? {}) as Record<string, unknown>;
      return normalizeTimeTrackingPrefs(rawTimeTracking);
    } catch (error) {
      console.error("getUserTimeTrackingPrefs failed:", error);
      return { ...EMPTY_TIME_TRACKING_PREFS };
    }
  }

  async recordTimeTrackingFeedback(userId: string, event: TimeTrackingFeedbackEvent): Promise<void> {
    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      const rawRoot = ((row?.prefs ?? {}) as Record<string, unknown>) || {};
      const current = normalizeTimeTrackingPrefs((rawRoot.timeTracking ?? {}) as Record<string, unknown>);

      const nextFeedbackByType = { ...current.feedbackByType };
      const currentTypeStats = nextFeedbackByType[event.suggestionType] || { accepted: 0, rejected: 0 };
      if (event.outcome === "accepted") {
        currentTypeStats.accepted += 1;
      } else {
        currentTypeStats.rejected += 1;
      }
      nextFeedbackByType[event.suggestionType] = currentTypeStats;

      const timestamp = event.timestamp || new Date().toISOString();
      const nextRecentFeedback = [
        ...current.recentFeedback,
        {
          suggestionType: event.suggestionType,
          outcome: event.outcome,
          date: event.date ?? null,
          suggestedValue: event.suggestedValue ?? null,
          chosenValue: event.chosenValue ?? null,
          timestamp,
        },
      ].slice(-50);

      const nextTimeTracking: TimeTrackingPrefsData = {
        feedbackByType: nextFeedbackByType,
        recentFeedback: nextRecentFeedback,
        totalAccepted: current.totalAccepted + (event.outcome === "accepted" ? 1 : 0),
        totalRejected: current.totalRejected + (event.outcome === "rejected" ? 1 : 0),
      };

      const nextRoot = {
        ...rawRoot,
        timeTracking: nextTimeTracking,
      };

      await db.insert(userTaskPrefs)
        .values({ userId, prefs: nextRoot as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userTaskPrefs.userId,
          set: { prefs: nextRoot as any, updatedAt: new Date() },
        });
    } catch (error) {
      console.error("recordTimeTrackingFeedback failed:", error);
    }
  }

  async getUserCaseReportingPrefs(userId: string): Promise<CaseReportingPrefsData> {
    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      if (!row) return { ...EMPTY_CASE_REPORTING_PREFS };
      const rawRoot = (row.prefs ?? {}) as Record<string, unknown>;
      const rawCaseReporting = (rawRoot.caseReporting ?? {}) as Record<string, unknown>;
      return normalizeCaseReportingPrefs(rawCaseReporting);
    } catch (error) {
      console.error("getUserCaseReportingPrefs failed:", error);
      return { ...EMPTY_CASE_REPORTING_PREFS };
    }
  }

  async recordCaseReportingFeedback(userId: string, event: CaseReportingFeedbackEvent): Promise<void> {
    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      const rawRoot = ((row?.prefs ?? {}) as Record<string, unknown>) || {};
      const current = normalizeCaseReportingPrefs((rawRoot.caseReporting ?? {}) as Record<string, unknown>);

      const nextFeedbackByType = { ...current.feedbackByType };
      const currentTypeStats = nextFeedbackByType[event.suggestionType] || { accepted: 0, rejected: 0 };
      if (event.outcome === "accepted") {
        currentTypeStats.accepted += 1;
      } else {
        currentTypeStats.rejected += 1;
      }
      nextFeedbackByType[event.suggestionType] = currentTypeStats;

      const timestamp = event.timestamp || new Date().toISOString();
      const nextRecentFeedback = [
        ...current.recentFeedback,
        {
          suggestionType: event.suggestionType,
          outcome: event.outcome,
          month: event.month ?? null,
          caseId: event.caseId ?? null,
          suggestedValue: event.suggestedValue ?? null,
          chosenValue: event.chosenValue ?? null,
          timestamp,
        },
      ].slice(-80);

      const nextCaseReporting: CaseReportingPrefsData = {
        feedbackByType: nextFeedbackByType,
        recentFeedback: nextRecentFeedback,
        totalAccepted: current.totalAccepted + (event.outcome === "accepted" ? 1 : 0),
        totalRejected: current.totalRejected + (event.outcome === "rejected" ? 1 : 0),
      };

      const nextRoot = {
        ...rawRoot,
        caseReporting: nextCaseReporting,
      };

      await db.insert(userTaskPrefs)
        .values({ userId, prefs: nextRoot as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userTaskPrefs.userId,
          set: { prefs: nextRoot as any, updatedAt: new Date() },
        });
    } catch (error) {
      console.error("recordCaseReportingFeedback failed:", error);
    }
  }

  async getUserSuggestionSettings(userId: string): Promise<SuggestionSettingsData> {
    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      if (!row) return { ...EMPTY_SUGGESTION_SETTINGS };
      const rawRoot = (row.prefs ?? {}) as Record<string, unknown>;
      const rawSuggestionSettings = (rawRoot.suggestionSettings ?? {}) as Record<string, unknown>;
      return normalizeSuggestionSettings(rawSuggestionSettings);
    } catch (error) {
      console.error("getUserSuggestionSettings failed:", error);
      return { ...EMPTY_SUGGESTION_SETTINGS };
    }
  }

  async updateUserSuggestionSettings(userId: string, patch: Partial<SuggestionSettingsData>): Promise<SuggestionSettingsData> {
    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      const rawRoot = ((row?.prefs ?? {}) as Record<string, unknown>) || {};
      const current = normalizeSuggestionSettings((rawRoot.suggestionSettings ?? {}) as Record<string, unknown>);

      const nextSuggestionSettings: SuggestionSettingsData = {
        mode: (
          patch.mode === "off" ||
          patch.mode === "dashboard_only" ||
          patch.mode === "balanced" ||
          patch.mode === "proactive"
        ) ? patch.mode : current.mode,
        frequency: (
          patch.frequency === "low" ||
          patch.frequency === "normal" ||
          patch.frequency === "high"
        ) ? patch.frequency : current.frequency,
        confidenceThreshold: typeof patch.confidenceThreshold === "number" && Number.isFinite(patch.confidenceThreshold)
          ? Math.max(0.2, Math.min(0.95, patch.confidenceThreshold))
          : current.confidenceThreshold,
        blocked: patch.blocked ? normalizeBlockedSuggestions(patch.blocked) : current.blocked,
        userOverride: typeof patch.userOverride === "boolean" ? patch.userOverride : current.userOverride,
        updatedAt: new Date().toISOString(),
      };

      const nextRoot = {
        ...rawRoot,
        suggestionSettings: nextSuggestionSettings,
      };

      await db.insert(userTaskPrefs)
        .values({ userId, prefs: nextRoot as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userTaskPrefs.userId,
          set: { prefs: nextRoot as any, updatedAt: new Date() },
        });

      return nextSuggestionSettings;
    } catch (error) {
      console.error("updateUserSuggestionSettings failed:", error);
      return { ...EMPTY_SUGGESTION_SETTINGS };
    }
  }

  async addUserSuggestionBlock(
    userId: string,
    block: { category: SuggestionBlockCategory; value: string },
  ): Promise<SuggestionSettingsData> {
    const value = String(block.value || "").trim();
    if (!value) {
      return this.getUserSuggestionSettings(userId);
    }

    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      const rawRoot = ((row?.prefs ?? {}) as Record<string, unknown>) || {};
      const current = normalizeSuggestionSettings((rawRoot.suggestionSettings ?? {}) as Record<string, unknown>);
      const blocked = {
        ...current.blocked,
        projects: [...current.blocked.projects],
        descriptions: [...current.blocked.descriptions],
        caseIds: [...current.blocked.caseIds],
      };

      const addUnique = (target: string[]) => {
        const key = value.toLowerCase();
        if (!target.some((item) => item.toLowerCase() === key)) {
          target.push(value);
        }
        return target.slice(-120);
      };

      if (block.category === "project") {
        blocked.projects = addUnique(blocked.projects);
      } else if (block.category === "description") {
        blocked.descriptions = addUnique(blocked.descriptions);
      } else {
        blocked.caseIds = addUnique(blocked.caseIds);
      }

      const nextSuggestionSettings: SuggestionSettingsData = {
        ...current,
        blocked,
        userOverride: true,
        updatedAt: new Date().toISOString(),
      };

      const nextRoot = {
        ...rawRoot,
        suggestionSettings: nextSuggestionSettings,
      };

      await db.insert(userTaskPrefs)
        .values({ userId, prefs: nextRoot as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userTaskPrefs.userId,
          set: { prefs: nextRoot as any, updatedAt: new Date() },
        });

      return nextSuggestionSettings;
    } catch (error) {
      console.error("addUserSuggestionBlock failed:", error);
      return this.getUserSuggestionSettings(userId);
    }
  }

  async removeUserSuggestionBlock(
    userId: string,
    block: { category: SuggestionBlockCategory; value: string },
  ): Promise<SuggestionSettingsData> {
    const value = String(block.value || "").trim();
    if (!value) {
      return this.getUserSuggestionSettings(userId);
    }

    try {
      const [row] = await db.select().from(userTaskPrefs).where(eq(userTaskPrefs.userId, userId)).limit(1);
      const rawRoot = ((row?.prefs ?? {}) as Record<string, unknown>) || {};
      const current = normalizeSuggestionSettings((rawRoot.suggestionSettings ?? {}) as Record<string, unknown>);
      const key = value.toLowerCase();

      const blocked = {
        ...current.blocked,
        projects: current.blocked.projects.filter((item) => item.toLowerCase() !== key),
        descriptions: current.blocked.descriptions.filter((item) => item.toLowerCase() !== key),
        caseIds: current.blocked.caseIds.filter((item) => item.toLowerCase() !== key),
      };

      const nextSuggestionSettings: SuggestionSettingsData = {
        ...current,
        blocked,
        updatedAt: new Date().toISOString(),
      };

      const nextRoot = {
        ...rawRoot,
        suggestionSettings: nextSuggestionSettings,
      };

      await db.insert(userTaskPrefs)
        .values({ userId, prefs: nextRoot as any, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userTaskPrefs.userId,
          set: { prefs: nextRoot as any, updatedAt: new Date() },
        });

      return nextSuggestionSettings;
    } catch (error) {
      console.error("removeUserSuggestionBlock failed:", error);
      return this.getUserSuggestionSettings(userId);
    }
  }
}

export const storage = new ExternalDbStorage();
