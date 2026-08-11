import { Router } from "express";

const router = Router();

type RemoteScanPayload = {
  barcode: string;
  createdAt: number;
};

const activeScans = new Map<string, RemoteScanPayload[]>();
const connectedPhones = new Map<string, number>();
const maxQueueSizePerSession = 30;

function cleanupExpiredScans() {
  const now = Date.now();
  const maxAgeMs = 2 * 60 * 1000; // 2 minutes

  for (const [sessionId, queue] of activeScans.entries()) {
    const freshQueue = queue.filter((payload) => now - payload.createdAt <= maxAgeMs);

    if (freshQueue.length === 0) {
      activeScans.delete(sessionId);
    } else if (freshQueue.length !== queue.length) {
      activeScans.set(sessionId, freshQueue);
    }
  }

  for (const [sessionId, lastPingTime] of connectedPhones.entries()) {
    if (now - lastPingTime > 15000) {
      connectedPhones.delete(sessionId);
    }
  }
}

function validateSessionId(sessionId: unknown) {
  if (!sessionId || typeof sessionId !== "string") {
    return { error: "Mã phiên không hợp lệ." };
  }

  const cleanSessionId = sessionId.trim();
  if (!/^[a-zA-Z0-9]{4,12}$/.test(cleanSessionId)) {
    return { error: "Mã phiên không đúng định dạng." };
  }

  return { value: cleanSessionId };
}

function validateBarcode(barcode: unknown) {
  if (!barcode || typeof barcode !== "string" || !barcode.trim()) {
    return { error: "Mã vạch không được để trống." };
  }

  const cleanBarcode = barcode.trim();
  if (!/^[a-zA-Z0-9\s\-_]{1,50}$/.test(cleanBarcode)) {
    return { error: "Mã vạch chứa ký tự không hợp lệ." };
  }

  return { value: cleanBarcode };
}

// POST /api/pos/remote-scan-ping
router.post("/remote-scan-ping", (req, res, next) => {
  try {
    cleanupExpiredScans();
    const { sessionId } = req.body;
    const sessionResult = validateSessionId(sessionId);
    if (!sessionResult.error && sessionResult.value) {
      connectedPhones.set(sessionResult.value, Date.now());
    }
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/pos/remote-scan
router.post("/remote-scan", (req, res, next) => {
  try {
    cleanupExpiredScans();
    const { sessionId, barcode } = req.body;

    const sessionResult = validateSessionId(sessionId);
    if (sessionResult.error) {
      return res.status(400).json({
        success: false,
        message: sessionResult.error,
      });
    }

    const barcodeResult = validateBarcode(barcode);
    if (barcodeResult.error) {
      return res.status(400).json({
        success: false,
        message: barcodeResult.error,
      });
    }

    const cleanSessionId = sessionResult.value!;
    connectedPhones.set(cleanSessionId, Date.now());

    const queue = activeScans.get(cleanSessionId) || [];
    queue.push({
      barcode: barcodeResult.value!,
      createdAt: Date.now(),
    });

    if (queue.length > maxQueueSizePerSession) {
      queue.splice(0, queue.length - maxQueueSizePerSession);
    }

    activeScans.set(cleanSessionId, queue);

    return res.json({
      success: true,
      message: "Đã gửi mã vạch về POS.",
      data: {
        success: true,
        message: "Đã gửi mã vạch về POS.",
        queued: queue.length,
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/pos/remote-scan-poll/:sessionId
router.get("/remote-scan-poll/:sessionId", (req, res, next) => {
  try {
    cleanupExpiredScans();
    const { sessionId } = req.params;

    const sessionResult = validateSessionId(sessionId);
    if (sessionResult.error) {
      return res.status(400).json({
        success: false,
        message: sessionResult.error,
      });
    }

    const cleanSessionId = sessionResult.value!;
    const lastPing = connectedPhones.get(cleanSessionId);
    const isConnected = Boolean(lastPing && Date.now() - lastPing <= 8000);

    const queue = activeScans.get(cleanSessionId) || [];
    const payload = queue.shift();

    if (queue.length === 0) {
      activeScans.delete(cleanSessionId);
    } else {
      activeScans.set(cleanSessionId, queue);
    }

    if (payload) {
      return res.json({
        success: true,
        data: {
          success: true,
          barcode: payload.barcode,
          isConnected,
          remaining: queue.length,
        }
      });
    }

    return res.json({
      success: true,
      data: {
        success: false,
        isConnected,
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
