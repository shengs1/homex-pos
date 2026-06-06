import { Prisma } from "@prisma/client";

type AuditLogClient = {
  auditLog: {
    create(args: Prisma.AuditLogCreateArgs): Promise<unknown>;
  };
};

type CreateAuditLogParams = {
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  description?: string | null;
};

export async function createAuditLog(
  client: AuditLogClient,
  params: CreateAuditLogParams
) {
  return client.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description || null,
    },
  });
}