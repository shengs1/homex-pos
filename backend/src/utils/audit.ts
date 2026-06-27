import { PrismaClient, Prisma } from "@prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";

const globalPrisma = new PrismaClient();

export interface CreateAuditLogParams {
  req?: AuthRequest | any;
  userId?: number;
  userName?: string;
  role?: string;
  action: string;
  entityType: string;
  entityId: number;
  description?: string;
  metadata?: any;
}

export async function createAuditLog(
  paramsOrClient: CreateAuditLogParams | any,
  params?: CreateAuditLogParams
) {
  try {
    // Determine if first arg is Prisma Client/Transaction or Params
    let client = globalPrisma;
    let actualParams: CreateAuditLogParams;

    if (params) {
      client = paramsOrClient;
      actualParams = params;
    } else {
      actualParams = paramsOrClient;
    }

    const { req, action, entityType, entityId, metadata } = actualParams;
    
    // Extract user info from req if not explicitly provided
    const userId = actualParams.userId || req?.user?.userId;
    const userName = actualParams.userName || req?.user?.email || "Unknown";
    const role = actualParams.role || req?.user?.role || "UNKNOWN";
    
    // IP and UserAgent can be extracted from req
    const ipAddress = req?.ip || req?.headers?.["x-forwarded-for"]?.toString() || "Unknown";
    const userAgent = req?.headers?.["user-agent"] || "Unknown";

    if (!userId) {
      console.warn("Audit Log: Missing userId, skipping log.", { action, entityType, entityId });
      return;
    }

    // Format description nicely if not provided
    let finalDescription = actualParams.description;
    if (!finalDescription) {
      finalDescription = `${userName} (${role}) performed ${action} on ${entityType} ID ${entityId}`;
    }

    // Keep metadata concise.
    let cleanMetadata = undefined;
    if (metadata) {
      // Remove any sensitive/huge fields if they exist (token, password, etc)
      const { password, token, refreshToken, ...restMetadata } = metadata;
      
      const metaString = JSON.stringify(restMetadata);
      if (metaString.length > 2000) {
        cleanMetadata = JSON.stringify({ note: "Metadata too large, truncated", keys: Object.keys(restMetadata) });
      } else {
        cleanMetadata = metaString;
      }
    }

    let enrichedDescription = finalDescription;
    if (cleanMetadata || ipAddress !== "Unknown") {
      enrichedDescription += ` | IP: ${ipAddress}`;
      if (cleanMetadata) {
        enrichedDescription += ` | Meta: ${cleanMetadata}`;
      }
      
      if (enrichedDescription.length > 4000) {
        enrichedDescription = enrichedDescription.substring(0, 3995) + "...";
      }
    }

    await client.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        description: enrichedDescription,
      },
    });

  } catch (error) {
    console.error("Audit log failed:", error);
  }
}
