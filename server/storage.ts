import { type User, type InsertUser, type TimeEntry, type InsertTimeEntry, type Activity, type InsertActivity } from "@shared/schema";
import { randomUUID } from "crypto";

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private timeEntries: Map<string, TimeEntry>;
  private activities: Map<string, Activity>;

  constructor() {
    this.users = new Map();
    this.timeEntries = new Map();
    this.activities = new Map();
    this.seedData();
  }

  private seedData() {
    const seedUsers: User[] = [
      { id: "1", username: "admin", password: "admin123", name: "Erik Hansen", email: "erik@smarttiming.no", role: "admin", department: "IT", status: "active", hoursThisWeek: 38.5, pendingApprovals: 3 },
      { id: "2", username: "kari", password: "pass123", name: "Kari Olsen", email: "kari@smarttiming.no", role: "case_manager", department: "Saksbehandling", status: "active", hoursThisWeek: 42.0, pendingApprovals: 0 },
      { id: "3", username: "ole", password: "pass123", name: "Ole Johansen", email: "ole@smarttiming.no", role: "member", department: "Salg", status: "active", hoursThisWeek: 35.5, pendingApprovals: 0 },
      { id: "4", username: "anna", password: "pass123", name: "Anna Berg", email: "anna@smarttiming.no", role: "member", department: "Kundeservice", status: "pending", hoursThisWeek: 0, pendingApprovals: 0 },
      { id: "5", username: "lars", password: "pass123", name: "Lars Nilsen", email: "lars@smarttiming.no", role: "member", department: "Utvikling", status: "active", hoursThisWeek: 40.0, pendingApprovals: 0 },
    ];

    const now = new Date();
    const seedEntries: TimeEntry[] = [
      { id: "t1", userId: "1", caseNumber: "SAK-2024-001", description: "Kundemote og oppfolging", hours: 3.5, date: now.toISOString().split('T')[0], status: "approved", createdAt: now.toISOString() },
      { id: "t2", userId: "1", caseNumber: "SAK-2024-002", description: "Systemutvikling", hours: 5.0, date: now.toISOString().split('T')[0], status: "pending", createdAt: now.toISOString() },
      { id: "t3", userId: "2", caseNumber: "SAK-2024-003", description: "Saksbehandling", hours: 4.0, date: new Date(now.getTime() - 86400000).toISOString().split('T')[0], status: "approved", createdAt: new Date(now.getTime() - 86400000).toISOString() },
      { id: "t4", userId: "3", caseNumber: "SAK-2024-004", description: "Salgsrapport", hours: 2.5, date: new Date(now.getTime() - 86400000).toISOString().split('T')[0], status: "pending", createdAt: new Date(now.getTime() - 86400000).toISOString() },
      { id: "t5", userId: "5", caseNumber: "SAK-2024-005", description: "Kodegjennomgang", hours: 6.0, date: new Date(now.getTime() - 172800000).toISOString().split('T')[0], status: "approved", createdAt: new Date(now.getTime() - 172800000).toISOString() },
    ];

    const seedActivities: Activity[] = [
      { id: "a1", userId: "2", action: "time_approved", description: "Kari Olsen godkjente 3.5 timer for Erik Hansen", timestamp: new Date(now.getTime() - 300000).toISOString() },
      { id: "a2", userId: "3", action: "time_logged", description: "Ole Johansen registrerte 2.5 timer pa SAK-2024-004", timestamp: new Date(now.getTime() - 3600000).toISOString() },
      { id: "a3", userId: "1", action: "user_invited", description: "Erik Hansen inviterte Anna Berg til teamet", timestamp: new Date(now.getTime() - 7200000).toISOString() },
      { id: "a4", userId: "5", action: "case_completed", description: "Lars Nilsen fullforte SAK-2024-005", timestamp: new Date(now.getTime() - 14400000).toISOString() },
    ];

    seedUsers.forEach(u => this.users.set(u.id, u));
    seedEntries.forEach(e => this.timeEntries.set(e.id, e));
    seedActivities.forEach(a => this.activities.set(a.id, a));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, hoursThisWeek: 0, pendingApprovals: 0 };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async getTimeEntries(filters?: { userId?: string; startDate?: string; endDate?: string; status?: string }): Promise<TimeEntry[]> {
    let entries = Array.from(this.timeEntries.values());
    if (filters?.userId) entries = entries.filter(e => e.userId === filters.userId);
    if (filters?.startDate) entries = entries.filter(e => e.date >= filters.startDate!);
    if (filters?.endDate) entries = entries.filter(e => e.date <= filters.endDate!);
    if (filters?.status) entries = entries.filter(e => e.status === filters.status);
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    return this.timeEntries.get(id);
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const id = randomUUID();
    const timeEntry: TimeEntry = { ...entry, id };
    this.timeEntries.set(id, timeEntry);
    return timeEntry;
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry | undefined> {
    const entry = this.timeEntries.get(id);
    if (!entry) return undefined;
    const updated = { ...entry, ...updates };
    this.timeEntries.set(id, updated);
    return updated;
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    return this.timeEntries.delete(id);
  }

  async getActivities(limit?: number): Promise<Activity[]> {
    const activities = Array.from(this.activities.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return limit ? activities.slice(0, limit) : activities;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const id = randomUUID();
    const act: Activity = { ...activity, id };
    this.activities.set(id, act);
    return act;
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
    const entries = Array.from(this.timeEntries.values())
      .filter(e => e.date >= startDateStr);
    const users = Array.from(this.users.values());
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const activeUsers = users.filter(u => u.status === "active").length;
    const pendingApprovals = entries.filter(e => e.status === "pending").length;
    const uniqueCases = new Set(entries.map(e => e.caseNumber).filter(Boolean)).size;
    
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
}

export const storage = new MemStorage();
