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

export function parseBusinessHours(businessHoursStr?: string | null): { startHour: number; startMinute: number; endHour: number; endMinute: number } | null {
  if (!businessHoursStr || !businessHoursStr.trim()) return null;
  
  const str = businessHoursStr.trim().toLowerCase();
  const parts = str.split(/[-–—]|đến|\bto\b/);
  if (parts.length !== 2) return null;

  const parseTime = (timeStr: string) => {
    const clean = timeStr.trim();
    const colonMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
      return { h: parseInt(colonMatch[1], 10), m: parseInt(colonMatch[2], 10) };
    }
    const hMatch = clean.match(/^(\d{1,2})h(\d{2})?$/);
    if (hMatch) {
      return { h: parseInt(hMatch[1], 10), m: hMatch[2] ? parseInt(hMatch[2], 10) : 0 };
    }
    const numMatch = clean.match(/^(\d{1,2})$/);
    if (numMatch) {
      return { h: parseInt(numMatch[1], 10), m: 0 };
    }
    return null;
  };

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);

  if (!start || !end) return null;
  return {
    startHour: start.h,
    startMinute: start.m,
    endHour: end.h,
    endMinute: end.m,
  };
}

export function isWithinBusinessHours(date: Date = new Date(), parsedHours?: { startHour: number; startMinute: number; endHour: number; endMinute: number } | null) {
  const startHour = parsedHours ? parsedHours.startHour : 7;
  const startMinute = parsedHours ? parsedHours.startMinute : 0;
  const endHour = parsedHours ? parsedHours.endHour : 22;
  const endMinute = parsedHours ? parsedHours.endMinute : 0;

  const { hour, minute } = getVietnamDateParts(date);
  const currentMins = hour * 60 + minute;
  const startMins = startHour * 60 + startMinute;
  const endMins = endHour * 60 + endMinute;

  if (startMins === endMins) {
    return true; // 24h operation
  }

  if (startMins < endMins) {
    // Normal same-day operating hours (e.g., 07:00 to 22:00)
    return currentMins >= startMins && currentMins < endMins;
  }

  // Overnight operating hours spanning past midnight (e.g., 07:00 AM to 02:00 AM next day)
  return currentMins >= startMins || currentMins < endMins;
}

export async function ensureWithinBusinessHours(date: Date = new Date()) {
  const setting = await prisma.setting.findFirst();
  const parsed = parseBusinessHours(setting?.businessHours);

  if (!isWithinBusinessHours(date, parsed)) {
    const startHour = parsed ? parsed.startHour : 7;
    const startMinute = parsed ? parsed.startMinute : 0;
    const endHour = parsed ? parsed.endHour : 22;
    const endMinute = parsed ? parsed.endMinute : 0;

    const startStr = `${startHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}`;
    const endStr = `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;
    throw new AppError(`Hệ thống POS chỉ cho phép mở ca trong khung giờ hoạt động từ ${startStr} đến ${endStr}.`, 400);
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
