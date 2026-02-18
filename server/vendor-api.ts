import { Router } from "express";
import { db } from "./db";
import { apiKeyAuth, requirePermission, ApiRequest } from "./api-middleware";
import { 
  logRow, 
  companyUsers, 
  projectInfo, 
  caseReports,
  apiKeys,
  apiUsageLog,
  vendors
} from "@shared/schema";
import { eq, and, gte, desc, count } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

router.get("/time-entries", apiKeyAuth, requirePermission("read:time_entries"), async (req: ApiRequest, res) => {
  try {
    const params = dateRangeSchema.parse(req.query);
    const vendorId = req.vendorId!;
    const offset = (params.page - 1) * params.limit;

    const entries = await db
      .select({
        id: logRow.id,
        date: logRow.date,
        startTime: logRow.startTime,
        endTime: logRow.endTime,
        breakHours: logRow.breakHours,
        activity: logRow.activity,
        title: logRow.title,
        project: logRow.project,
        place: logRow.place,
        notes: logRow.notes,
        userId: logRow.userId,
        createdAt: logRow.createdAt,
      })
      .from(logRow)
      .where(eq(logRow.vendorId, vendorId))
      .orderBy(desc(logRow.date))
      .limit(params.limit)
      .offset(offset);

    const [countResult] = await db
      .select({ total: count() })
      .from(logRow)
      .where(eq(logRow.vendorId, vendorId));

    res.json({
      data: entries,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: countResult?.total || 0,
        pages: Math.ceil((countResult?.total || 0) / params.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid query parameters",
        details: error.errors,
      });
    }
    console.error("Error fetching time entries:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/time-entries/:id", apiKeyAuth, requirePermission("read:time_entries"), async (req: ApiRequest, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendorId!;

    const [entry] = await db
      .select()
      .from(logRow)
      .where(and(eq(logRow.id, id), eq(logRow.vendorId, vendorId)))
      .limit(1);

    if (!entry) {
      return res.status(404).json({
        error: "Not Found",
        message: "Time entry not found",
      });
    }

    res.json({ data: entry });
  } catch (error) {
    console.error("Error fetching time entry:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users", apiKeyAuth, requirePermission("read:users"), async (req: ApiRequest, res) => {
  try {
    const params = dateRangeSchema.parse(req.query);
    const vendorId = req.vendorId!;
    const offset = (params.page - 1) * params.limit;

    const userList = await db
      .select({
        id: companyUsers.id,
        companyId: companyUsers.companyId,
        userEmail: companyUsers.userEmail,
        googleEmail: companyUsers.googleEmail,
        role: companyUsers.role,
        approved: companyUsers.approved,
        createdAt: companyUsers.createdAt,
      })
      .from(companyUsers)
      .where(eq(companyUsers.vendorId, vendorId))
      .limit(params.limit)
      .offset(offset);

    const [countResult] = await db
      .select({ total: count() })
      .from(companyUsers)
      .where(eq(companyUsers.vendorId, vendorId));

    res.json({
      data: userList,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: countResult?.total || 0,
        pages: Math.ceil((countResult?.total || 0) / params.limit),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users/:id", apiKeyAuth, requirePermission("read:users"), async (req: ApiRequest, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendorId!;

    const [user] = await db
      .select({
        id: companyUsers.id,
        companyId: companyUsers.companyId,
        userEmail: companyUsers.userEmail,
        googleEmail: companyUsers.googleEmail,
        role: companyUsers.role,
        approved: companyUsers.approved,
        createdAt: companyUsers.createdAt,
      })
      .from(companyUsers)
      .where(and(eq(companyUsers.id, parseInt(id)), eq(companyUsers.vendorId, vendorId)))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
    }

    res.json({ data: user });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/reports", apiKeyAuth, requirePermission("read:reports"), async (req: ApiRequest, res) => {
  try {
    const params = dateRangeSchema.parse(req.query);
    const vendorId = req.vendorId!;
    const offset = (params.page - 1) * params.limit;

    const reports = await db
      .select({
        id: caseReports.id,
        userId: caseReports.userId,
        caseId: caseReports.caseId,
        month: caseReports.month,
        status: caseReports.status,
        createdAt: caseReports.createdAt,
        updatedAt: caseReports.updatedAt,
      })
      .from(caseReports)
      .where(eq(caseReports.vendorId, vendorId))
      .orderBy(desc(caseReports.createdAt))
      .limit(params.limit)
      .offset(offset);

    const [countResult] = await db
      .select({ total: count() })
      .from(caseReports)
      .where(eq(caseReports.vendorId, vendorId));

    res.json({
      data: reports,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: countResult?.total || 0,
        pages: Math.ceil((countResult?.total || 0) / params.limit),
      },
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/reports/:id", apiKeyAuth, requirePermission("read:reports"), async (req: ApiRequest, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendorId!;

    const [report] = await db
      .select()
      .from(caseReports)
      .where(and(eq(caseReports.id, parseInt(id)), eq(caseReports.vendorId, vendorId)))
      .limit(1);

    if (!report) {
      return res.status(404).json({
        error: "Not Found",
        message: "Report not found",
      });
    }

    res.json({ data: report });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/projects", apiKeyAuth, requirePermission("read:projects"), async (req: ApiRequest, res) => {
  try {
    const params = dateRangeSchema.parse(req.query);
    const vendorId = req.vendorId!;
    const offset = (params.page - 1) * params.limit;

    const projects = await db
      .select({
        id: projectInfo.id,
        konsulent: projectInfo.konsulent,
        bedrift: projectInfo.bedrift,
        oppdragsgiver: projectInfo.oppdragsgiver,
        tiltak: projectInfo.tiltak,
        periode: projectInfo.periode,
        klientId: projectInfo.klientId,
        isActive: projectInfo.isActive,
        createdAt: projectInfo.createdAt,
      })
      .from(projectInfo)
      .where(eq(projectInfo.vendorId, vendorId))
      .limit(params.limit)
      .offset(offset);

    const [countResult] = await db
      .select({ total: count() })
      .from(projectInfo)
      .where(eq(projectInfo.vendorId, vendorId));

    res.json({
      data: projects,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: countResult?.total || 0,
        pages: Math.ceil((countResult?.total || 0) / params.limit),
      },
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/usage", apiKeyAuth, async (req: ApiRequest, res) => {
  try {
    const vendorId = req.vendorId!;

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [usageCount] = await db
      .select({ total: count() })
      .from(apiUsageLog)
      .where(and(
        eq(apiUsageLog.vendorId, vendorId),
        gte(apiUsageLog.createdAt, thirtyDaysAgo)
      ));

    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.vendorId, vendorId));

    res.json({
      data: {
        subscription: {
          enabled: vendor?.apiAccessEnabled,
          startDate: vendor?.apiSubscriptionStart,
          endDate: vendor?.apiSubscriptionEnd,
          monthlyPrice: vendor?.apiMonthlyPrice,
        },
        usage: {
          requestsLast30Days: usageCount?.total || 0,
        },
        apiKeys: keys,
      },
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

export default router;
