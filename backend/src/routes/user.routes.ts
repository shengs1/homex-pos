import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
  AuthRequest,
} from "../middlewares/auth.middleware";
import { USER_ROLES, RECORD_STATUS } from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

const userRoleSchema = z.enum([USER_ROLES.ADMIN, USER_ROLES.CASHIER]);

const userStatusSchema = z.enum([
  RECORD_STATUS.ACTIVE,
  RECORD_STATUS.INACTIVE,
]);

const optionalTextSchema = (max: number, message: string) =>
  z.union([z.string().trim().max(max, message), z.literal("")]).optional();

const createUserSchema = z.object({
  employeeCode: optionalTextSchema(20, "Employee code must not exceed 20 characters"),
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Full name must not exceed 100 characters"),
  email: z
    .union([
      z.string().trim().email("Invalid email").max(100, "Email must not exceed 100 characters"),
      z.literal(""),
    ])
    .optional(),
  phone: optionalTextSchema(20, "Phone must not exceed 20 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100, "Password must not exceed 100 characters"),
  role: userRoleSchema,
});

const updateUserSchema = z.object({
  employeeCode: optionalTextSchema(20, "Employee code must not exceed 20 characters"),
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Full name must not exceed 100 characters"),
  email: z
    .union([
      z.string().trim().email("Invalid email").max(100, "Email must not exceed 100 characters"),
      z.literal(""),
    ])
    .optional(),
  phone: optionalTextSchema(20, "Phone must not exceed 20 characters"),
  role: userRoleSchema,
  status: userStatusSchema,
});

const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, "New password must be at least 6 characters")
    .max(100, "New password must not exceed 100 characters"),
});

const userInclude = {
  role: {
    select: {
      id: true,
      name: true,
      description: true,
    },
  },
} satisfies Prisma.UserInclude;

type UserWithRole = Prisma.UserGetPayload<{
  include: typeof userInclude;
}>;

function formatUser(user: UserWithRole) {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    roleId: user.roleId,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeOptionalText(value?: string | null) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";
  return trimmedValue || null;
}

function normalizeEmployeeCode(value?: string | null) {
  return normalizeOptionalText(value)?.toUpperCase() || null;
}

function getInternalEmail(employeeCode: string) {
  return `${employeeCode.toLowerCase()}@homex.local`;
}

function isInternalEmail(email: string) {
  return email.toLowerCase().endsWith("@homex.local");
}

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getUserId(value: string) {
  const userId = Number(value);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError("Invalid user ID", 400);
  }

  return userId;
}

function getAuthenticatedUserId(req: AuthRequest) {
  if (!req.user || !req.user.userId) {
    throw new AppError("Authentication required", 401);
  }

  return req.user.userId;
}

function validateParseResult<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError }
) {
  if (!result.success) {
    throw new AppError(result.error.issues[0]?.message || "Invalid data", 400);
  }

  return result.data;
}

async function checkDuplicateEmail(email: string, ignoredUserId?: number) {
  if (!email) {
    return;
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      id: ignoredUserId
        ? {
            not: ignoredUserId,
          }
        : undefined,
    },
  });

  if (existingUser) {
    throw new AppError("Email already exists", 409);
  }
}

async function checkDuplicateEmployeeCode(employeeCode: string, ignoredUserId?: number) {
  const existingUser = await prisma.user.findFirst({
    where: {
      employeeCode: {
        equals: employeeCode,
        mode: "insensitive",
      },
      id: ignoredUserId
        ? {
            not: ignoredUserId,
          }
        : undefined,
    },
  });

  if (existingUser) {
    throw new AppError("Employee code already exists", 409);
  }
}

async function generateEmployeeCode() {
  const latestUser = await prisma.user.findFirst({
    orderBy: {
      id: "desc",
    },
    select: {
      id: true,
    },
  });

  const baseId = latestUser?.id || 0;

  for (let offset = 1; offset <= 1000; offset += 1) {
    const candidate = `NV${String(baseId + offset).padStart(4, "0")}`;
    const existingUser = await prisma.user.findUnique({
      where: {
        employeeCode: candidate,
      },
      select: {
        id: true,
      },
    });

    if (!existingUser) {
      return candidate;
    }
  }

  throw new AppError("Unable to generate employee code", 500);
}

async function getRoleByName(roleName: string) {
  const role = await prisma.role.findUnique({
    where: {
      name: roleName,
    },
  });

  if (!role) {
    throw new AppError(`Role ${roleName} does not exist`, 400);
  }

  return role;
}

router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const page = getPaginationValue(req.query.page, 1);
    const limit = Math.min(getPaginationValue(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const role = String(req.query.role || "").trim().toUpperCase();
    const status = String(req.query.status || "").trim().toUpperCase();

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        {
          fullName: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          employeeCode: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          phone: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (req.query.role) {
      if (role !== USER_ROLES.ADMIN && role !== USER_ROLES.CASHIER) {
        throw new AppError("Invalid role", 400);
      }

      where.role = {
        name: role,
      };
    }

    if (req.query.status) {
      if (status !== RECORD_STATUS.ACTIVE && status !== RECORD_STATUS.INACTIVE) {
        throw new AppError("Invalid user status", 400);
      }

      where.status = status as "ACTIVE" | "INACTIVE";
    }

    const [users, totalItems] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.user.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Users loaded successfully",
      data: {
        items: users.map(formatUser),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
        },
      },
    });
  })
);

router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userId = getUserId(String(req.params.id));

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: userInclude,
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return res.json({
      success: true,
      message: "User loaded successfully",
      data: formatUser(user),
    });
  })
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userData = validateParseResult(createUserSchema.safeParse(req.body));

    const employeeCode =
      normalizeEmployeeCode(userData.employeeCode) || (await generateEmployeeCode());
    const email = normalizeOptionalText(userData.email) || getInternalEmail(employeeCode);
    const phone = normalizeOptionalText(userData.phone);

    await checkDuplicateEmployeeCode(employeeCode);
    await checkDuplicateEmail(email);

    const roleRecord = await getRoleByName(userData.role);
    const passwordHash = await bcrypt.hash(userData.password, 10);

    const createdUser = await prisma.user.create({
      data: {
        employeeCode,
        fullName: userData.fullName,
        email,
        phone,
        passwordHash,
        roleId: roleRecord.id,
        status: RECORD_STATUS.ACTIVE,
      },
      include: userInclude,
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: formatUser(createdUser),
    });
  })
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userId = getUserId(String(req.params.id));
    const currentUserId = getAuthenticatedUserId(req as AuthRequest);
    const userData = validateParseResult(updateUserSchema.safeParse(req.body));

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: userInclude,
    });

    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    if (
      userId === currentUserId &&
      existingUser.role.name === USER_ROLES.ADMIN &&
      userData.role !== USER_ROLES.ADMIN
    ) {
      throw new AppError("You cannot demote your own ADMIN account", 400);
    }

    if (userId === currentUserId && userData.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("You cannot lock your own account", 400);
    }

    const employeeCode =
      normalizeEmployeeCode(userData.employeeCode) ||
      existingUser.employeeCode ||
      (await generateEmployeeCode());
    const email =
      normalizeOptionalText(userData.email) ||
      (isInternalEmail(existingUser.email) ? getInternalEmail(employeeCode) : existingUser.email);
    const phone = normalizeOptionalText(userData.phone);

    await checkDuplicateEmployeeCode(employeeCode, userId);
    await checkDuplicateEmail(email, userId);

    const roleRecord = await getRoleByName(userData.role);

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        employeeCode,
        fullName: userData.fullName,
        email,
        phone,
        roleId: roleRecord.id,
        status: userData.status,
      },
      include: userInclude,
    });

    return res.json({
      success: true,
      message: "User updated successfully",
      data: formatUser(updatedUser),
    });
  })
);

router.patch(
  "/:id/change-password",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userId = getUserId(String(req.params.id));
    const passwordData = validateParseResult(
      changePasswordSchema.safeParse(req.body)
    );

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    const passwordHash = await bcrypt.hash(passwordData.newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
      include: userInclude,
    });

    return res.json({
      success: true,
      message: "Password changed successfully",
      data: formatUser(updatedUser),
    });
  })
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userId = getUserId(String(req.params.id));
    const currentUserId = getAuthenticatedUserId(req as AuthRequest);

    if (userId === currentUserId) {
      throw new AppError("You cannot lock your own account", 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    if (existingUser.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("User is already locked", 400);
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        status: RECORD_STATUS.INACTIVE,
      },
      include: userInclude,
    });

    return res.json({
      success: true,
      message: "User locked successfully",
      data: formatUser(updatedUser),
    });
  })
);

router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userId = getUserId(String(req.params.id));

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    if (existingUser.status === RECORD_STATUS.ACTIVE) {
      throw new AppError("User is already active", 400);
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        status: RECORD_STATUS.ACTIVE,
      },
      include: userInclude,
    });

    return res.json({
      success: true,
      message: "User restored successfully",
      data: formatUser(updatedUser),
    });
  })
);

export default router;
