import prisma from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { PAYMENT_METHOD, PAYMENT_STATUS, USER_ROLES } from "../constants/app.constants";

export function getVietnamDateParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  
  const hour = parseInt(parts.find(p => p.type === "hour")!.value, 10);
  const minute = parseInt(parts.find(p => p.type === "minute")!.value, 10);
  const year = parseInt(parts.find(p => p.type === "year")!.value, 10);
  const month = parseInt(parts.find(p => p.type === "month")!.value, 10);
  const day = parseInt(parts.find(p => p.type === "day")!.value, 10);
  return { year, month, day, hour, minute, date };
}

export function isWithinBusinessHours(date: Date = new Date()) {
  const { hour } = getVietnamDateParts(date);
  // Khung giờ 07:00 đến trước 22:00
  return hour >= 7 && hour < 22;
}

export function ensureWithinBusinessHours(date: Date = new Date()) {
  if (!isWithinBusinessHours(date)) {
    throw new AppError("Hệ thống POS chỉ cho phép mở ca trong khung giờ hoạt động từ 07:00 đến 22:00.", 400);
  }
}

export async function ensureNoOpenShift(userId: number) {
  const openShift = await prisma.shift.findFirst({
    where: {
      userId,
      status: "OPEN",
    },
  });

  if (openShift) {
    throw new AppError("Bạn đang có một ca làm việc chưa đóng. Vui lòng kết ca cũ trước khi mở ca mới!", 400);
  }
}

export async function resolveShiftTargetUserId(reqUser: { id: number; role: string }, requestedUserId?: number) {
  let targetUserId = reqUser.id;

  if (requestedUserId && reqUser.role === USER_ROLES.ADMIN) {
    const userExists = await prisma.user.findUnique({ where: { id: requestedUserId } });
    if (!userExists) {
      throw new AppError("Không tìm thấy nhân viên", 404);
    }
    targetUserId = requestedUserId;
  }
  
  return targetUserId;
}

export async function ensureShiftCapacity(shiftType: string) {
  const setting = await prisma.setting.findFirst();
  const maxEmployees = setting?.maxEmployeesPerShift || 1;

  // We find currently OPEN shifts. autoCloseExpiredShifts should have already closed expired ones.
  // To be safe, we check if the OPEN shift was opened today (same businessDate).
  const now = new Date();
  const { year, month, day } = getVietnamDateParts(now);
  const startOfBusinessDate = new Date(`${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T00:00:00+07:00`);

  const count = await prisma.shift.count({
    where: {
      status: "OPEN",
      shiftType: shiftType as any,
      openedAt: {
        gte: startOfBusinessDate,
      },
    },
  });

  if (count >= maxEmployees) {
    const periodName = shiftType === "MORNING" ? "Ca sáng" : "Ca chiều";
    throw new AppError(`${periodName} hôm nay đã đạt giới hạn số thu ngân được mở theo cấu hình hiện tại.`, 400);
  }
}

export function getShiftScheduledEndAt(openedAt: Date, shiftType: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "numeric", day: "numeric",
  });
  
  const parts = formatter.formatToParts(openedAt);
  const year = parseInt(parts.find(p => p.type === "year")!.value, 10);
  const month = parseInt(parts.find(p => p.type === "month")!.value, 10) - 1;
  const day = parseInt(parts.find(p => p.type === "day")!.value, 10);
  
  const endHour = shiftType === "MORNING" ? 15 : 22;
  const endMinute = 5;
  
  const yyyy = year.toString().padStart(4, "0");
  const mm = (month + 1).toString().padStart(2, "0");
  const dd = day.toString().padStart(2, "0");
  const hh = endHour.toString().padStart(2, "0");
  const min = endMinute.toString().padStart(2, "0");
  
  const isoString = `${yyyy}-${mm}-${dd}T${hh}:${min}:00+07:00`;
  return new Date(isoString);
}

export async function autoCloseExpiredShifts() {
  const openShifts = await prisma.shift.findMany({
    where: { status: "OPEN" },
  });

  const now = new Date();

  for (const shift of openShifts) {
    const autoCloseTime = getShiftScheduledEndAt(shift.openedAt, shift.shiftType);
    
    if (now > autoCloseTime) {
      await prisma.shift.update({
        where: { id: shift.id },
        data: {
          status: "CLOSED",
          closedAt: now,
          note: "Hệ thống tự đóng ca do quá giờ.",
        },
      });
    }
  }
}

export async function calculateShiftStats(shiftId: number, openingCash: number) {
  const payments = await prisma.payment.groupBy({
    by: ['method'],
    where: {
      status: PAYMENT_STATUS.PAID,
      order: {
        shiftId,
      },
    },
    _sum: {
      amount: true,
    },
  });

  let cashRevenue = 0;
  let transferRevenue = 0;

  for (const p of payments) {
    if (p.method === PAYMENT_METHOD.CASH) {
      cashRevenue += Number(p._sum.amount || 0);
    } else {
      transferRevenue += Number(p._sum.amount || 0);
    }
  }

  const totalRevenue = cashRevenue + transferRevenue;
  const expectedCash = openingCash + cashRevenue;

  return {
    cashRevenue,
    transferRevenue,
    totalRevenue,
    expectedCash,
  };
}

export async function formatShiftWithStats(shift: any, formatShiftFn: (s: any) => any) {
  const baseFormat = formatShiftFn(shift);
  const stats = await calculateShiftStats(shift.id, baseFormat.openingCash);
  return { ...baseFormat, ...stats };
}
