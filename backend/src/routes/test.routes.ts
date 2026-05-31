import { Router } from "express";
import {
  AuthRequest,
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";

const router = Router();

// Tất cả tài khoản đã đăng nhập đều truy cập được
router.get("/profile", authenticateToken, (req: AuthRequest, res) => {
  return res.json({
    message: "Token hợp lệ",
    data: {
      userId: req.user?.userId,
      email: req.user?.email,
      role: req.user?.role,
    },
  });
});

// Chỉ ADMIN truy cập được
router.get(
  "/admin-only",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req: AuthRequest, res) => {
    return res.json({
      message: "Bạn đang truy cập chức năng dành cho Admin",
      data: {
        email: req.user?.email,
        role: req.user?.role,
      },
    });
  }
);

// ADMIN và MANAGER truy cập được
router.get(
  "/manager-area",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  (req: AuthRequest, res) => {
    return res.json({
      message: "Bạn được phép truy cập khu vực quản lý",
      data: {
        email: req.user?.email,
        role: req.user?.role,
      },
    });
  }
);

export default router;