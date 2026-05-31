import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";

const router = Router();

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

const updateCategorySchema = z.object({
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
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

// Xem danh sách danh mục
router.get(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const categories = await prisma.category.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json({
        message: "Lấy danh sách danh mục thành công",
        data: categories,
      });
    } catch (error) {
      console.error("Lỗi lấy danh sách danh mục:", error);

      return res.status(500).json({
        message: "Lỗi server khi lấy danh sách danh mục",
      });
    }
  }
);

// Thêm danh mục mới
router.post(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const result = createCategorySchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          message:
            result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const { name, description } = result.data;

      const existingCategory = await prisma.category.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
      });

      if (existingCategory) {
        return res.status(409).json({
          message: "Tên danh mục đã tồn tại",
        });
      }

      const category = await prisma.category.create({
        data: {
          name,
          description: description || null,
          status: "ACTIVE",
        },
      });

      return res.status(201).json({
        message: "Thêm danh mục thành công",
        data: category,
      });
    } catch (error) {
      console.error("Lỗi thêm danh mục:", error);

      return res.status(500).json({
        message: "Lỗi server khi thêm danh mục",
      });
    }
  }
);

// Cập nhật danh mục
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const categoryId = Number(req.params.id);

      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({
          message: "ID danh mục không hợp lệ",
        });
      }

      const result = updateCategorySchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          message:
            result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const { name, description, status } = result.data;

      const existingCategory = await prisma.category.findUnique({
        where: {
          id: categoryId,
        },
      });

      if (!existingCategory) {
        return res.status(404).json({
          message: "Không tìm thấy danh mục",
        });
      }

      const duplicateCategory = await prisma.category.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
          NOT: {
            id: categoryId,
          },
        },
      });

      if (duplicateCategory) {
        return res.status(409).json({
          message: "Tên danh mục đã tồn tại",
        });
      }

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
        message: "Cập nhật danh mục thành công",
        data: updatedCategory,
      });
    } catch (error) {
      console.error("Lỗi cập nhật danh mục:", error);

      return res.status(500).json({
        message: "Lỗi server khi cập nhật danh mục",
      });
    }
  }
);

// Xóa mềm danh mục bằng cách chuyển trạng thái sang INACTIVE
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const categoryId = Number(req.params.id);

      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({
          message: "ID danh mục không hợp lệ",
        });
      }

      const existingCategory = await prisma.category.findUnique({
        where: {
          id: categoryId,
        },
      });

      if (!existingCategory) {
        return res.status(404).json({
          message: "Không tìm thấy danh mục",
        });
      }

      if (existingCategory.status === "INACTIVE") {
        return res.status(400).json({
          message: "Danh mục đã ngừng hoạt động trước đó",
        });
      }

      const deletedCategory = await prisma.category.update({
        where: {
          id: categoryId,
        },
        data: {
          status: "INACTIVE",
        },
      });

      return res.json({
        message: "Xóa danh mục thành công",
        data: deletedCategory,
      });
    } catch (error) {
      console.error("Lỗi xóa danh mục:", error);

      return res.status(500).json({
        message: "Lỗi server khi xóa danh mục",
      });
    }
  }
);

export default router;
