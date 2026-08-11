import { Router } from "express";
import * as bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../lib/prisma";
import { createAuditLog } from "../utils/audit";

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1, "Employee code or email is required"),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message || "Invalid data",
      });
    }

    const { email, password } = result.data;
    const identifier = email.trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          {
            email: {
              equals: identifier,
              mode: "insensitive",
            },
          },
          {
            employeeCode: {
              equals: identifier.toUpperCase(),
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Employee code/email or password is incorrect",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Account is locked",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Employee code/email or password is incorrect",
      });
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        message: "Server is missing JWT_SECRET",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        employeeCode: user.employeeCode,
        role: user.role.name,
      },
      jwtSecret,
      {
        expiresIn: "1d",
      }
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    await createAuditLog({
      req: req as any,
      userId: user.id,
      userName: user.email,
      role: user.role.name,
      action: "LOGIN",
      entityType: "AUTH",
      entityId: user.id,
      metadata: { employeeCode: user.employeeCode },
    });

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user.id,
          employeeCode: user.employeeCode,
          fullName: user.fullName,
          email: user.email,
          role: user.role.name,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while logging in",
    });
  }
});

export default router;
