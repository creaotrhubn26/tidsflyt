import { type User, type InsertUser, type TimeEntry, type InsertTimeEntry, type Activity, type InsertActivity, users, timeEntries, activities } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

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
}

export class PostgresStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getTimeEntries(filters?: { userId?: string; startDate?: string; endDate?: string; status?: string }): Promise<TimeEntry[]> {
    const conditions = [];
    if (filters?.userId) conditions.push(eq(timeEntries.userId, filters.userId));
    if (filters?.startDate) conditions.push(gte(timeEntries.date, filters.startDate));
    if (filters?.endDate) conditions.push(lte(timeEntries.date, filters.endDate));
    if (filters?.status) conditions.push(eq(timeEntries.status, filters.status));
    
    if (conditions.length > 0) {
      return await db.select().from(timeEntries).where(and(...conditions)).orderBy(desc(timeEntries.createdAt));
    }
    return await db.select().from(timeEntries).orderBy(desc(timeEntries.createdAt));
  }

  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    const result = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
    return result[0];
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const result = await db.insert(timeEntries).values(entry).returning();
    return result[0];
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry | undefined> {
    const result = await db.update(timeEntries).set(updates).where(eq(timeEntries.id, id)).returning();
    return result[0];
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    const result = await db.delete(timeEntries).where(eq(timeEntries.id, id)).returning();
    return result.length > 0;
  }

  async getActivities(limit?: number): Promise<Activity[]> {
    const query = db.select().from(activities).orderBy(desc(activities.timestamp));
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const result = await db.insert(activities).values(activity).returning();
    return result[0];
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
    
    const allEntries = await db.select().from(timeEntries).where(gte(timeEntries.date, startDateStr));
    const allUsers = await db.select().from(users);
    
    const totalHours = allEntries.reduce((sum, e) => sum + e.hours, 0);
    const activeUsers = allUsers.filter(u => u.status === "active").length;
    const pendingApprovals = allEntries.filter(e => e.status === "pending").length;
    const uniqueCases = new Set(allEntries.map(e => e.caseNumber).filter(Boolean)).size;
    
    return {
      totalHours,
      activeUsers,
      pendingApprovals,
      casesThisWeek: uniqueCases,
      hoursTrend: 12.5,
      usersTrend: 8.3,
      approvalsTrend: -5.2,
      casesTrend: 15.0,
    };
  }

  async seedData(): Promise<void> {
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      console.log("Database already seeded");
      return;
    }

    const seedUsers: InsertUser[] = [
      { username: "admin", password: "admin123", name: "Erik Hansen", email: "erik@smarttiming.no", role: "admin", department: "IT", status: "active" },
      { username: "kari", password: "pass123", name: "Kari Olsen", email: "kari@smarttiming.no", role: "case_manager", department: "Saksbehandling", status: "active" },
      { username: "ole", password: "pass123", name: "Ole Johansen", email: "ole@smarttiming.no", role: "member", department: "Salg", status: "active" },
      { username: "anna", password: "pass123", name: "Anna Berg", email: "anna@smarttiming.no", role: "member", department: "Kundeservice", status: "pending" },
      { username: "lars", password: "pass123", name: "Lars Nilsen", email: "lars@smarttiming.no", role: "member", department: "Utvikling", status: "active" },
    ];

    const insertedUsers = await db.insert(users).values(seedUsers).returning();
    console.log(`Seeded ${insertedUsers.length} users`);

    const now = new Date();
    const seedEntries: InsertTimeEntry[] = [
      { userId: insertedUsers[0].id, caseNumber: "SAK-2024-001", description: "Kundemote og oppfolging", hours: 3.5, date: now.toISOString().split('T')[0], status: "approved", createdAt: now.toISOString() },
      { userId: insertedUsers[0].id, caseNumber: "SAK-2024-002", description: "Systemutvikling", hours: 5.0, date: now.toISOString().split('T')[0], status: "pending", createdAt: now.toISOString() },
      { userId: insertedUsers[1].id, caseNumber: "SAK-2024-003", description: "Saksbehandling", hours: 4.0, date: new Date(now.getTime() - 86400000).toISOString().split('T')[0], status: "approved", createdAt: new Date(now.getTime() - 86400000).toISOString() },
      { userId: insertedUsers[2].id, caseNumber: "SAK-2024-004", description: "Salgsrapport", hours: 2.5, date: new Date(now.getTime() - 86400000).toISOString().split('T')[0], status: "pending", createdAt: new Date(now.getTime() - 86400000).toISOString() },
      { userId: insertedUsers[4].id, caseNumber: "SAK-2024-005", description: "Kodegjennomgang", hours: 6.0, date: new Date(now.getTime() - 172800000).toISOString().split('T')[0], status: "approved", createdAt: new Date(now.getTime() - 172800000).toISOString() },
    ];

    await db.insert(timeEntries).values(seedEntries);
    console.log(`Seeded ${seedEntries.length} time entries`);

    const seedActivities: InsertActivity[] = [
      { userId: insertedUsers[1].id, action: "time_approved", description: "Kari Olsen godkjente 3.5 timer for Erik Hansen", timestamp: new Date(now.getTime() - 300000).toISOString() },
      { userId: insertedUsers[2].id, action: "time_logged", description: "Ole Johansen registrerte 2.5 timer pa SAK-2024-004", timestamp: new Date(now.getTime() - 3600000).toISOString() },
      { userId: insertedUsers[0].id, action: "user_invited", description: "Erik Hansen inviterte Anna Berg til teamet", timestamp: new Date(now.getTime() - 7200000).toISOString() },
      { userId: insertedUsers[4].id, action: "case_completed", description: "Lars Nilsen fullforte SAK-2024-005", timestamp: new Date(now.getTime() - 14400000).toISOString() },
    ];

    await db.insert(activities).values(seedActivities);
    console.log(`Seeded ${seedActivities.length} activities`);
  }
}

export const storage = new PostgresStorage();
