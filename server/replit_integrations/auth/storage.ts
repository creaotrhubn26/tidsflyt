import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { vendors } from "@shared/schema";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  findVendorByEmailDomain(email: string): Promise<number | null>;
  updateUserRole(userId: string, role: string, vendorId: number | null): Promise<User | undefined>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // Find vendor by email domain match
  async findVendorByEmailDomain(email: string): Promise<number | null> {
    if (!email) return null;
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;
    
    // Look for vendors with matching allowed domains in settings
    const vendorList = await db
      .select({ id: vendors.id, settings: vendors.settings })
      .from(vendors)
      .where(eq(vendors.status, "active"));
    
    for (const vendor of vendorList) {
      const settings = vendor.settings as any;
      const allowedDomains = settings?.allowedEmailDomains || [];
      if (Array.isArray(allowedDomains) && allowedDomains.some((d: string) => d.toLowerCase() === domain)) {
        return vendor.id;
      }
    }
    return null;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user exists
    const [existingUser] = await db.select().from(users).where(eq(users.id, userData.id!));
    
    if (existingUser) {
      // Update existing user, preserve role and vendorId
      const [user] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id!))
        .returning();
      return user;
    }
    
    // New user - try to find vendor by email domain
    let vendorId: number | null = null;
    if (userData.email) {
      vendorId = await this.findVendorByEmailDomain(userData.email);
    }
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: "user",
        vendorId,
      })
      .returning();
    return user;
  }

  async updateUserRole(userId: string, role: string, vendorId: number | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, vendorId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
