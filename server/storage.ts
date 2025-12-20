import { 
  type User, type InsertUser, type TimeEntry, type InsertTimeEntry, type Activity, type InsertActivity,
  type LogRow, type CompanyUser, type ProjectInfo, type UserSettings,
  type SiteSetting, type InsertSiteSetting, type LandingHero, type InsertLandingHero,
  type LandingFeature, type InsertLandingFeature, type LandingTestimonial, type InsertLandingTestimonial,
  type LandingCta, type InsertLandingCta,
  type WhyPageHero, type InsertWhyPageHero, type WhyPageStat, type InsertWhyPageStat,
  type WhyPageBenefit, type InsertWhyPageBenefit, type WhyPageFeature, type InsertWhyPageFeature,
  type WhyPageContent, type InsertWhyPageContent,
  logRow, companyUsers, projectInfo, userSettings, companyAuditLog, companies,
  siteSettings, landingHero, landingFeatures, landingTestimonials, landingCta,
  whyPageHero, whyPageStats, whyPageBenefits, whyPageFeatures, whyPageContent
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db, pool } from "./db";
import { eq, desc, and, gte, lte, sql, asc } from "drizzle-orm";

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
    const now = new Date();
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
        hoursTrend: 12.5,
        usersTrend: 8.3,
        approvalsTrend: -5.2,
        casesTrend: 15.0,
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
}

export const storage = new ExternalDbStorage();
