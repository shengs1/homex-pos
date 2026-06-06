import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";
import { USER_ROLES, RECORD_STATUS } from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

const categoryStatusSchema = z.enum([
  RECORD_STATUS.ACTIVE,
  RECORD_STATUS.INACTIVE,
]);

const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tên danh mục không được để trống")
    .max(100, "Tên danh mục không được vượt quá 100 ký tự"),
  description: z
    .string()
    .trim()
    .max(255, "Mô tả không được vượt quá 255 ký tự")
    .optional(),
});

const updateCategorySchema = createCategorySchema.extend({
  status: categoryStatusSchema,
});

function getCategoryId(value: string) {
  const categoryId = Number(value);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new AppError("ID danh mục không hợp lệ", 400);
  }

  return categoryId;
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

async function checkDuplicateCategoryName(name: string, ignoredCategoryId?: number) {
  const duplicateCategory = await prisma.category.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
      id: ignoredCategoryId
        ? {
            not: ignoredCategoryId,
          }
        : undefined,
    },
  });

  if (duplicateCategory) {
    throw new AppError("Tên danh mục đã tồn tại", 409);
  }
}

// GET /api/categories
router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      success: true,
      message: "Lấy danh sách danh mục thành công",
      data: categories,
    });
  })
);

// POST /api/categories
router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const categoryData = validateParseResult(
      createCategorySchema.safeParse(req.body)
    );

    const { name, description } = categoryData;

    await checkDuplicateCategoryName(name);

    const category = await prisma.category.create({
      data: {
        name,
        description: description || null,
        status: RECORD_STATUS.ACTIVE,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Thêm danh mục thành công",
      data: category,
    });
  })
);

// PUT /api/categories/:id
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const categoryId = getCategoryId(String(req.params.id));
    const categoryData = validateParseResult(
      updateCategorySchema.safeParse(req.body)
    );

    const existingCategory = await prisma.category.findUnique({
      where: {
        id: categoryId,
      },
    });

    if (!existingCategory) {
      throw new AppError("Không tìm thấy danh mục", 404);
    }

    const { name, description, status } = categoryData;

    await checkDuplicateCategoryName(name, categoryId);

    const updatedCategory = await prisma.category.update({
      where: {
        id: categoryId,
      },
      data: {
        name,
        description: description || null,
        status,
      },
    });

    return res.json({
      success: true,
      message: "Cập nhật danh mục thành công",
      data: updatedCategory,
    });
  })
);

// PATCH /api/categories/:id/restore
router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const categoryId = getCategoryId(String(req.params.id));

    const existingCategory = await prisma.category.findUnique({
      where: {
        id: categoryId,
      },
    });

    if (!existingCategory) {
      throw new AppError("Không tìm thấy danh mục", 404);
    }

    if (existingCategory.status === RECORD_STATUS.ACTIVE) {
      throw new AppError("Danh mục đang hoạt động", 400);
    }

    const restoredCategory = await prisma.category.update({
      where: {
        id: categoryId,
      },
      data: {
        status: RECORD_STATUS.ACTIVE,
      },
    });

    return res.json({
      success: true,
      message: "Khôi phục danh mục thành công",
      data: restoredCategory,
    });
  })
);

// DELETE /api/categories/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const categoryId = getCategoryId(String(req.params.id));

    const existingCategory = await prisma.category.findUnique({
      where: {
        id: categoryId,
      },
    });

    if (!existingCategory) {
      throw new AppError("Không tìm thấy danh mục", 404);
    }

    if (existingCategory.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("Danh mục đã ngừng hoạt động trước đó", 400);
    }

    const deletedCategory = await prisma.category.update({
      where: {
        id: categoryId,
      },
      data: {
        status: RECORD_STATUS.INACTIVE,
      },
    });

    return res.json({
      success: true,
      message: "Xóa danh mục thành công",
      data: deletedCategory,
    });
  })
);

export default router;