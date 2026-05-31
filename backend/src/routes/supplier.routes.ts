import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";

const router = Router();

const createSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tên nhà cung cấp không được để trống")
    .max(100, "Tên nhà cung cấp không được vượt quá 100 ký tự"),

  phone: z
    .string()
    .trim()
    .max(20, "Số điện thoại không được vượt quá 20 ký tự")
    .optional(),

  address: z
    .string()
    .trim()
    .max(255, "Địa chỉ không được vượt quá 255 ký tự")
    .optional(),
});

const updateSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tên nhà cung cấp không được để trống")
    .max(100, "Tên nhà cung cấp không được vượt quá 100 ký tự"),

  phone: z
    .string()
    .trim()
    .max(20, "Số điện thoại không được vượt quá 20 ký tự")
    .optional(),

  address: z
    .string()
    .trim()
    .max(255, "Địa chỉ không được vượt quá 255 ký tự")
    .optional(),

  status: z.enum(["ACTIVE", "INACTIVE"]),
});

// Xem danh sách nhà cung cấp
router.get(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const suppliers = await prisma.supplier.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json({
        message: "Lấy danh sách nhà cung cấp thành công",
        data: suppliers,
      });
    } catch (error) {
      console.error("Lỗi lấy danh sách nhà cung cấp:", error);

      return res.status(500).json({
        message: "Lỗi server khi lấy danh sách nhà cung cấp",
      });
    }
  }
);

// Thêm nhà cung cấp mới
router.post(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const result = createSupplierSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          message:
            result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const { name, phone, address } = result.data;

      const existingSupplier = await prisma.supplier.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
      });

      if (existingSupplier) {
        return res.status(409).json({
          message: "Tên nhà cung cấp đã tồn tại",
        });
      }

      const supplier = await prisma.supplier.create({
        data: {
          name,
          phone: phone || null,
          address: address || null,
          status: "ACTIVE",
        },
      });

      return res.status(201).json({
        message: "Thêm nhà cung cấp thành công",
        data: supplier,
      });
    } catch (error) {
      console.error("Lỗi thêm nhà cung cấp:", error);

      return res.status(500).json({
        message: "Lỗi server khi thêm nhà cung cấp",
      });
    }
  }
);

// Cập nhật nhà cung cấp
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const supplierId = Number(req.params.id);

      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return res.status(400).json({
          message: "ID nhà cung cấp không hợp lệ",
        });
      }

      const result = updateSupplierSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          message:
            result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const { name, phone, address, status } = result.data;

      const existingSupplier = await prisma.supplier.findUnique({
        where: {
          id: supplierId,
        },
      });

      if (!existingSupplier) {
        return res.status(404).json({
          message: "Không tìm thấy nhà cung cấp",
        });
      }

      const duplicateSupplier = await prisma.supplier.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive",
          },
          NOT: {
            id: supplierId,
          },
        },
      });

      if (duplicateSupplier) {
        return res.status(409).json({
          message: "Tên nhà cung cấp đã tồn tại",
        });
      }

      const updatedSupplier = await prisma.supplier.update({
        where: {
          id: supplierId,
        },
        data: {
          name,
          phone: phone || null,
          address: address || null,
          status,
        },
      });

      return res.json({
        message: "Cập nhật nhà cung cấp thành công",
        data: updatedSupplier,
      });
    } catch (error) {
      console.error("Lỗi cập nhật nhà cung cấp:", error);

      return res.status(500).json({
        message: "Lỗi server khi cập nhật nhà cung cấp",
      });
    }
  }
);

// Xóa mềm nhà cung cấp bằng cách chuyển trạng thái sang INACTIVE
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const supplierId = Number(req.params.id);

      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return res.status(400).json({
          message: "ID nhà cung cấp không hợp lệ",
        });
      }

      const existingSupplier = await prisma.supplier.findUnique({
        where: {
          id: supplierId,
        },
      });

      if (!existingSupplier) {
        return res.status(404).json({
          message: "Không tìm thấy nhà cung cấp",
        });
      }

      if (existingSupplier.status === "INACTIVE") {
        return res.status(400).json({
          message: "Nhà cung cấp đã ngừng hoạt động trước đó",
        });
      }

      const deletedSupplier = await prisma.supplier.update({
        where: {
          id: supplierId,
        },
        data: {
          status: "INACTIVE",
        },
      });

      return res.json({
        message: "Xóa nhà cung cấp thành công",
        data: deletedSupplier,
      });
    } catch (error) {
      console.error("Lỗi xóa nhà cung cấp:", error);

      return res.status(500).json({
        message: "Lỗi server khi xóa nhà cung cấp",
      });
    }
  }
);

export default router;
