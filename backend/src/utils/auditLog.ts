import { AuditLog, Prisma } from "@prisma/client";

type AuditLogClient = {
  auditLog: {
    create: (args: Prisma.AuditLogCreateArgs) => Promise<AuditLog>;
  };
};

type CreateAuditLogInput = {
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  description?: string | null;
};

export async function createAuditLog(
  client: AuditLogClient,
  input: CreateAuditLogInput
) {
  return client.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      description: input.description || null,
    },
  });
}