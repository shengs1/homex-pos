import { Router } from "express";
import { z } from "zod";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware";
import { USER_ROLES } from "../constants/app.constants";
import { catchAsync } from "../utils/catchAsync";
import { salesAssistantService } from "../services/sales-assistant.service";

const router = Router();

const salesAssistantSchema = z.object({
  language: z.enum(["vi", "en"]).optional(),
  need: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  customerId: z.number().optional(),
  cartItems: z.array(
    z.object({
      productId: z.number(),
      name: z.string(),
      quantity: z.number()
    })
  ).optional(),
  preferences: z.object({
    preferPromotion: z.boolean().optional(),
    preferWarranty: z.boolean().optional(),
    preferHighStock: z.boolean().optional(),
    crossSellFromCart: z.boolean().optional()
  }).optional()
});

// POST /api/pos/sales-assistant
router.post(
  "/sales-assistant",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const payload = salesAssistantSchema.parse(req.body);
    const result = await salesAssistantService.getSuggestions(payload);
    return res.json({
      success: true,
      message: "Đã tạo gợi ý bán hàng.",
      data: result
    });
  })
);

export default router;
