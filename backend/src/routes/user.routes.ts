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

const createUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Họ tên không được để trống")
    .max(100, "Họ tên không được vượt quá 100 ký tự"),

  email: z
    .string()
    .trim()
    .email("Email không hợp lệ")
    .max(100, "Email không được vượt quá 100 ký tự"),

  password: z
    .string()
    .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
    .max(100, "Mật khẩu không được vượt quá 100 ký tự"),

  role: userRoleSchema,
});

const updateUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Họ tên không được để trống")
    .max(100, "Họ tên không được vượt quá 100 ký tự"),

  email: z
    .string()
    .trim()
    .email("Email không hợp lệ")
    .max(100, "Email không được vượt quá 100 ký tự"),

  role: userRoleSchema,

  status: userStatusSchema,
});

const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, "Mật khẩu mới phải có ít nhất 6 ký tự")
    .max(100, "Mật khẩu mới không được vượt quá 100 ký tự"),
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
    fullName: user.fullName,
    email: user.email,
    roleId: user.roleId,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
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
    throw new AppError("ID người dùng không hợp lệ", 400);
  }

  return userId;
}

function getAuthenticatedUserId(req: AuthRequest) {
  if (!req.user || !req.user.userId) {
    throw new AppError("Bạn chưa đăng nhập", 401);
  }

  return req.user.userId;
}

function validateParseResult<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError }
) {
  if (!result.success) {
    throw new AppError(
      result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
      400
    );
  }

  return result.data;
}

async function checkDuplicateEmail(email: string, ignoredUserId?: number) {
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
    throw new AppError("Email đã tồn tại", 409);
  }
}

async function getRoleByName(roleName: string) {
  const role = await prisma.role.findUnique({
    where: {
      name: roleName,
    },
  });

  if (!role) {
    throw new AppError(`Vai trò ${roleName} chưa tồn tại trong database`, 400);
  }

  return role;
}

// GET /api/users?page=1&limit=10&search=&role=ADMIN&status=ACTIVE
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
      ];
    }

    if (req.query.role) {
      if (role !== USER_ROLES.ADMIN && role !== USER_ROLES.CASHIER) {
        throw new AppError("Vai trò không hợp lệ", 400);
      }

      where.role = {
        name: role,
      };
    }

    if (req.query.status) {
      if (status !== RECORD_STATUS.ACTIVE && status !== RECORD_STATUS.INACTIVE) {
        throw new AppError("Trạng thái người dùng không hợp lệ", 400);
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
      message: "Lấy danh sách người dùng thành công",
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

// GET /api/users/:id
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
      throw new AppError("Không tìm thấy người dùng", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết người dùng thành công",
      data: formatUser(user),
    });
  })
);

// POST /api/users
router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userData = validateParseResult(createUserSchema.safeParse(req.body));

    const { fullName, email, password, role } = userData;

    await checkDuplicateEmail(email);

    const roleRecord = await getRoleByName(role);

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        roleId: roleRecord.id,
        status: RECORD_STATUS.ACTIVE,
      },
      include: userInclude,
    });

    return res.status(201).json({
      success: true,
      message: "Tạo người dùng thành công",
      data: formatUser(createdUser),
    });
  })
);

// PUT /api/users/:id
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
      throw new AppError("Không tìm thấy người dùng", 404);
    }

    if (
      userId === currentUserId &&
      existingUser.role.name === USER_ROLES.ADMIN &&
      userData.role !== USER_ROLES.ADMIN
    ) {
      throw new AppError("Bạn không thể tự hạ quyền ADMIN của chính mình", 400);
    }

    if (userId === currentUserId && userData.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("Bạn không thể tự khóa tài khoản của chính mình", 400);
    }

    await checkDuplicateEmail(userData.email, userId);

    const roleRecord = await getRoleByName(userData.role);

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        fullName: userData.fullName,
        email: userData.email,
        roleId: roleRecord.id,
        status: userData.status,
      },
      include: userInclude,
    });

    return res.json({
      success: true,
      message: "Cập nhật người dùng thành công",
      data: formatUser(updatedUser),
    });
  })
);

// PATCH /api/users/:id/change-password
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
      throw new AppError("Không tìm thấy người dùng", 404);
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
      message: "Đổi mật khẩu người dùng thành công",
      data: formatUser(updatedUser),
    });
  })
);

// DELETE /api/users/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const userId = getUserId(String(req.params.id));
    const currentUserId = getAuthenticatedUserId(req as AuthRequest);

    if (userId === currentUserId) {
      throw new AppError("Bạn không thể tự khóa tài khoản của chính mình", 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new AppError("Không tìm thấy người dùng", 404);
    }

    if (existingUser.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("Người dùng đã bị khóa trước đó", 400);
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
      message: "Khóa người dùng thành công",
      data: formatUser(updatedUser),
    });
  })
);

// PATCH /api/users/:id/restore
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
      throw new AppError("Không tìm thấy người dùng", 404);
    }

    if (existingUser.status === RECORD_STATUS.ACTIVE) {
      throw new AppError("Người dùng đang hoạt động", 400);
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
      message: "Mở khóa người dùng thành công",
      data: formatUser(updatedUser),
    });
  })
);

export default router;