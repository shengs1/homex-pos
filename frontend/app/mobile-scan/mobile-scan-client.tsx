"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { posService } from "@/services/homex.service";
import { toast } from "sonner";
import { Camera, Send, CheckCircle2, AlertCircle, RefreshCw, Video, Zap, ZoomIn, SwitchCamera } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import { LanguageToggle } from "@/components/shared/language-toggle";

export default function MobileScanClient() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sid")?.toUpperCase() || "";

  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const [lastScanned, setLastScanned] = useState<string>("");
  const [manualBarcode, setManualBarcode] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomValue, setZoomValue] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [cameraDevices, setCameraDevices] = useState<{ id: string; label: string }[]>([]);
  const [activeCameraId, setActiveCameraId] = useState("");
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);

  const scannerRef = useRef<any>(null);
  const isStartingRef = useRef<boolean>(false);
  const isRunningRef = useRef<boolean>(false);
  const cooldownRef = useRef<boolean>(false);
  const scanPausedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const nativeDetectorFrameRef = useRef<number | null>(null);
  const nativeDetectorRunningRef = useRef(false);
  const nativeDetectorBusyRef = useRef(false);
  const scannerOperationRef = useRef<Promise<void>>(Promise.resolve());


  useEffect(() => {
    setHasMounted(true);
  }, []);

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
  function getActiveVideoTrack() {
    const video = document.querySelector("#reader video") as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    return stream?.getVideoTracks()[0] || null;
  }

  async function optimizeActiveCameraTrack() {
    const track = getActiveVideoTrack();
    if (!track) return;

    videoTrackRef.current = track;
    const capabilities = typeof track.getCapabilities === "function" ? (track.getCapabilities() as any) : {};
    const advanced: Record<string, unknown> = {};

    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
      advanced.focusMode = "continuous";
    }
    if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes("continuous")) {
      advanced.exposureMode = "continuous";
    }
    if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes("continuous")) {
      advanced.whiteBalanceMode = "continuous";
    }
    if (Array.isArray(capabilities.resizeMode) && capabilities.resizeMode.includes("crop-and-scale")) {
      advanced.resizeMode = "crop-and-scale";
    }

    if (typeof capabilities.zoom?.min === "number" && typeof capabilities.zoom?.max === "number" && capabilities.zoom.max > capabilities.zoom.min) {
      const min = Number(capabilities.zoom.min);
      const max = Number(capabilities.zoom.max);
      const preferredZoom = Math.min(max, Math.max(min, 1));
      setZoomSupported(true);
      setZoomMin(min);
      setZoomMax(max);
      setZoomValue(preferredZoom);
      advanced.zoom = preferredZoom;
    } else {
      setZoomSupported(false);
    }

    setTorchSupported(Boolean(capabilities.torch));
    setTorchOn(false);

    if (Object.keys(advanced).length > 0) {
      try {
        await track.applyConstraints({ advanced: [advanced] } as any);
      } catch (err) {
        console.warn("Camera optimization constraints failed:", err);
      }
    }
  }

  async function toggleTorch() {
    const track = videoTrackRef.current || getActiveVideoTrack();
    if (!track) return;

    try {
      const nextValue = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: nextValue }] } as any);
      setTorchOn(nextValue);
    } catch (err) {
      console.warn("Torch toggle failed:", err);
      toast.error(t("mobileScan.torchNotAllowed"));
      setTorchSupported(false);
    }
  }

  async function applyZoom(nextZoom: number) {
    const track = videoTrackRef.current || getActiveVideoTrack();
    if (!track) return;

    const cleanZoom = Math.min(zoomMax, Math.max(zoomMin, nextZoom));
    setZoomValue(cleanZoom);

    try {
      await track.applyConstraints({ advanced: [{ zoom: cleanZoom }] } as any);
    } catch (err) {
      console.warn("Camera zoom failed:", err);
      setZoomSupported(false);
    }
  }
  const handleScanSuccess = useCallback(async (decodedText: string) => {
    const barcode = decodedText.trim();
    if (!barcode || cooldownRef.current || scanPausedRef.current) return;

    cooldownRef.current = true;
    scanPausedRef.current = true;
    setScanPaused(true);
    setStatus("sending");

    try {
      await posService.sendRemoteScan({ sessionId, barcode });
      setLastScanned(barcode);

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(100);
        } catch (e) {
          console.warn("Vibration failed:", e);
        }
      }

      toast.success(t("mobileScan.scanSuccessWithCode", { barcode }));
      await stopScannerNow();
      if (isMountedRef.current) setStatus("scan_success");
    } catch (err: any) {
      console.error("Failed to send remote scan:", err);
      toast.error(t("mobileScan.sendFailed"));
      scanPausedRef.current = false;
      setScanPaused(false);
      if (isMountedRef.current) setStatus("ready");
    } finally {
      window.setTimeout(() => {
        cooldownRef.current = false;
      }, 900);
    }
  }, [sessionId, t]);

  function stopNativeBarcodeDetectorLoop() {
    nativeDetectorRunningRef.current = false;
    nativeDetectorBusyRef.current = false;

    if (nativeDetectorFrameRef.current !== null) {
      window.cancelAnimationFrame(nativeDetectorFrameRef.current);
      nativeDetectorFrameRef.current = null;
    }
  }

  async function startNativeBarcodeDetectorLoop() {
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) return;

    const preferredFormats = [
      "code_128",
      "code_39",
      "code_93",
      "codabar",
      "ean_13",
      "ean_8",
      "itf",
      "upc_a",
      "upc_e",
      "qr_code",
    ];

    let formats = preferredFormats;
    try {
      if (typeof BarcodeDetectorCtor.getSupportedFormats === "function") {
        const supportedFormats = await BarcodeDetectorCtor.getSupportedFormats();
        formats = preferredFormats.filter((format) => supportedFormats.includes(format));
      }
    } catch (err) {
      console.warn("Cannot read native barcode detector formats:", err);
    }

    if (formats.length === 0) return;

    let detector: any;
    try {
      detector = new BarcodeDetectorCtor({ formats });
    } catch (err) {
      console.warn("Cannot create native barcode detector:", err);
      return;
    }

    stopNativeBarcodeDetectorLoop();
    nativeDetectorRunningRef.current = true;

    const tick = async () => {
      if (!nativeDetectorRunningRef.current || !isMountedRef.current) return;

      const video = document.querySelector("#reader video") as HTMLVideoElement | null;
      const canReadVideo = video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;

      if (canReadVideo && !nativeDetectorBusyRef.current && !cooldownRef.current) {
        nativeDetectorBusyRef.current = true;
        try {
          const detections = await detector.detect(video);
          const rawValue = detections?.find((item: any) => typeof item?.rawValue === "string" && item.rawValue.trim())?.rawValue;
          if (rawValue) {
            await handleScanSuccess(rawValue);
          }
        } catch (err) {
          console.warn("Native barcode detect failed:", err);
        } finally {
          nativeDetectorBusyRef.current = false;
        }
      }

      if (nativeDetectorRunningRef.current) {
        nativeDetectorFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    nativeDetectorFrameRef.current = window.requestAnimationFrame(tick);
  }
  async function stopScannerNow() {
    stopNativeBarcodeDetectorLoop();
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      if (scanner.isScanning || isRunningRef.current) {
        await scanner.stop();
        await wait(250);
      }
    } catch (err) {
      console.warn("Stop scanner failed:", err);
    }

    await wait(100);

    try {
      await scanner.clear();
    } catch (err) {
      console.warn("Clear scanner failed:", err);
    }

    isRunningRef.current = false;
    scannerRef.current = null;
    videoTrackRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
    setZoomSupported(false);
  }

  const startScanner = useCallback(async (preferredCameraId?: string) => {
    if (!sessionId || isStartingRef.current) return;

    try {
      isStartingRef.current = true;
      scanPausedRef.current = false;
      setScanPaused(false);
      setStatus("initializing");
      setError("");

      const isSecureContext = window.isSecureContext || window.location.hostname === "localhost";
      if (!isSecureContext) {
        setError(t("mobileScan.httpsRequired"));
        setStatus("camera_error");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("mobileScan.cameraUnsupported"));
        setStatus("camera_error");
        return;
      }

      await stopScannerNow();

      if (!isMountedRef.current) return;

      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const readerElement = document.getElementById("reader");
      if (!readerElement || !isMountedRef.current) return;

      const localScanner = new Html5Qrcode("reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
        ],
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      scannerRef.current = localScanner;

      let cameraConfig: any = { facingMode: "environment" };
      let selectedVideoConstraints: MediaTrackConstraints = {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
        frameRate: { ideal: 30 },
      };
      try {
        const cameras = await Html5Qrcode.getCameras();
        const cameraOptions = cameras.map((camera: any, index: number) => ({
          id: camera.id,
          label: camera.label || `Camera ${index + 1}`,
        }));
        setCameraDevices(cameraOptions);

        const savedCameraId = window.localStorage.getItem("homex_mobile_scan_camera_id") || "";
        const savedCamera = cameras.find((camera: any) => camera.id === savedCameraId);
        const requestedCamera = preferredCameraId ? cameras.find((camera: any) => camera.id === preferredCameraId) : null;
        const rearCamera = cameras.find((camera: any) => /back|rear|environment|sau|mặt sau|camera sau/i.test(camera.label));
        const selectedCameraId = requestedCamera?.id || savedCamera?.id || rearCamera?.id;

        if (selectedCameraId) {
          cameraConfig = { deviceId: { exact: selectedCameraId } };
          selectedVideoConstraints = {
            deviceId: { exact: selectedCameraId },
            width: { ideal: 1280 },
            height: { ideal: 960 },
            frameRate: { ideal: 30 },
          };
          setActiveCameraId(selectedCameraId);
          window.localStorage.setItem("homex_mobile_scan_camera_id", selectedCameraId);
        } else {
          setActiveCameraId("");
        }
      } catch (err) {
        console.warn("Cannot enumerate cameras, using environment facingMode fallback", err);
      }

      const scanConfig = {
        fps: 24,
        disableFlip: false,
        videoConstraints: selectedVideoConstraints,
        qrbox: (width: number, height: number) => {
          const boxWidth = Math.min(width * 0.88, height * 1.9);
          const boxHeight = Math.min(height * 0.38, boxWidth * 0.42);

          return boxWidth > 80 && boxHeight > 40
            ? { width: boxWidth, height: boxHeight }
            : { width: 300, height: 120 };
        }
      };

      await Promise.race([
        localScanner.start(
          cameraConfig,
          scanConfig,
          async (decodedText: string) => {
            if (!isMountedRef.current) return;
            await handleScanSuccess(decodedText);
          },
          () => {}
        ),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("camera_permission_timeout")), 8000)
        ),
      ]);

      isRunningRef.current = true;
      await optimizeActiveCameraTrack();
      await startNativeBarcodeDetectorLoop();

      if (isMountedRef.current) {
        setStatus("ready");
        setError("");
      }
    } catch (err: any) {
      console.error("Start mobile scanner failed:", err);
      if (isMountedRef.current) {
        const message = String(err?.message || err || "");
        const denied = /permission|denied|notallowed|notallowederror/i.test(message);
        const timeout = /camera_permission_timeout/i.test(message);
        setError(
          timeout
            ? t("mobileScan.cameraPermissionTimeout")
            : denied
              ? t("mobileScan.cameraDenied")
              : t("mobileScan.cameraOpenFailed", { message: message || t("common.unknownError") })
        );
        setStatus("camera_error");
      }
    } finally {
      isStartingRef.current = false;
    }  }, [handleScanSuccess, sessionId, t]);

  async function scanAgain() {
    if (isStartingRef.current) return;

    cooldownRef.current = false;
    scanPausedRef.current = false;
    setScanPaused(false);
    setLastScanned("");
    await startScanner(activeCameraId || undefined);
  }

  async function switchCamera() {
    if (cameraDevices.length <= 1) {
      toast.error(t("mobileScan.onlyOneCamera"));
      return;
    }

    if (isStartingRef.current || isSwitchingCamera) return;

    const currentIndex = cameraDevices.findIndex((camera) => camera.id === activeCameraId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cameraDevices.length : 0;
    const nextCamera = cameraDevices[nextIndex];
    if (!nextCamera) return;

    try {
      setIsSwitchingCamera(true);
      setStatus("initializing");
      setError("");
      await stopScannerNow();
      await wait(350);
      setActiveCameraId(nextCamera.id);
      window.localStorage.setItem("homex_mobile_scan_camera_id", nextCamera.id);
      await startScanner(nextCamera.id);
      toast.success(t("mobileScan.switchedCamera", { camera: nextCamera.label || t("mobileScan.otherCamera") }));
    } catch (err) {
      console.error("Switch camera failed:", err);
      toast.error(t("mobileScan.switchCameraFailed"));
      setStatus("camera_error");
    } finally {
      setIsSwitchingCamera(false);
    }
  }
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim() || isSubmitting) return;

    const barcode = manualBarcode.trim();
    setIsSubmitting(true);

    try {
      await posService.sendRemoteScan({ sessionId, barcode });
      setLastScanned(barcode);
      setManualBarcode("");
      toast.success(t("mobileScan.manualSent", { barcode }));
    } catch (err) {
      console.error("Failed to send manual barcode:", err);
      toast.error(t("mobileScan.sendFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    if (!sessionId) {
      setError(t("mobileScan.missingSession"));
      setStatus("camera_error");
      return;
    }

    setStatus("idle");

    // Send heartbeat ping to server
    const sendPing = () => {
      posService.pingRemoteScan({ sessionId }).catch(() => {});
    };
    sendPing();
    const pingTimer = window.setInterval(sendPing, 3500);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(pingTimer);
      void stopScannerNow();
    };
  }, [sessionId, t]);

  if (!hasMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white font-medium">
        <div className="fixed right-4 top-4 z-[100]"><LanguageToggle /></div>
        {t("mobileScan.loadingScanner")}
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-white">
        <div className="fixed right-4 top-4 z-[100]"><LanguageToggle /></div>
        <div className="rounded-full bg-red-950/50 p-4 border border-red-500/20 text-red-500 mb-4 animate-bounce">
          <AlertCircle className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t("mobileScan.cannotConnect")}</h2>
        <p className="text-sm text-slate-400 max-w-sm leading-relaxed mb-6">
          {t("mobileScan.missingSessionDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 p-4 pb-12 font-sans selection:bg-blue-500/30">
        <div className="fixed right-4 top-4 z-[100]"><LanguageToggle /></div>
      <div className="flex flex-col items-center justify-center text-center py-6 border-b border-slate-900 mb-6">
        <h1 className="text-xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
          Homex Mobile Scanner
        </h1>
        <div className="mt-2 inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="text-slate-400">{t("mobileScan.session")}</span>
          <span className="font-mono font-bold text-blue-400">{sessionId}</span>
        </div>
      </div>

      <style>{`
        #reader,
        #reader > div,
        #reader__scan_region {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }

        #reader video,
        #reader canvas {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          object-position: center center !important;
        }

        #reader img,
        #reader button,
        #reader select {
          display: none !important;
        }
      `}</style>
      <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full gap-6">
        <div className="relative w-full aspect-[4/3] max-w-[420px] mx-auto rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/50 shadow-2xl flex items-center justify-center">
          <div id="reader" className="absolute inset-0 h-full w-full overflow-hidden" />

          {status === "idle" && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-center p-5">
              <Camera className="h-10 w-10 text-blue-400 mb-4" />
              <p className="text-sm font-semibold text-slate-200 mb-4">{t("mobileScan.enableCameraPrompt")}</p>
              <button type="button" onClick={() => void startScanner()} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg active:scale-95">
                <Video className="h-4 w-4" />
                {t("mobileScan.enableCamera")}
              </button>
            </div>
          )}

          {status === "ready" && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative h-[38%] w-[88%] rounded-2xl border border-blue-400/75 bg-blue-500/5 shadow-[0_0_0_999px_rgba(2,6,23,0.18)]">
                <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_12px_rgba(96,165,250,0.9)] animate-pulse" />
                <div className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-blue-400" />
                <div className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-blue-400" />
                <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-blue-400" />
                <div className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-blue-400" />
              </div>
            </div>
          )}

          {status === "initializing" && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-center p-4">
              <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-300">{t("mobileScan.initializingCamera")}</p>
            </div>
          )}

          {status === "sending" && (
            <div className="absolute inset-0 bg-blue-950/90 flex flex-col items-center justify-center text-center p-4 animate-pulse">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-sm font-bold text-emerald-400">{t("mobileScan.sendingBarcode")}</p>
            </div>
          )}

          {status === "scan_success" && (
            <div className="absolute inset-0 bg-emerald-950/90 flex flex-col items-center justify-center text-center p-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-sm font-bold text-emerald-300 mb-1">{t("mobileScan.scanSuccess")}</p>
              <p className="font-mono text-sm text-emerald-100 mb-4">{lastScanned}</p>
              <button type="button" onClick={() => void scanAgain()} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg active:scale-95">
                <Camera className="h-4 w-4" />
                {t("mobileScan.scanAgain")}
              </button>
            </div>
          )}

          {status === "camera_error" && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-center p-4">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-xs text-red-400 font-medium px-4 mb-4">{error}</p>
              <button type="button" onClick={() => void startScanner()} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white active:scale-95">
                <Camera className="h-4 w-4" />
                {t("mobileScan.enableCameraAgain")}
              </button>
            </div>
          )}
        </div>

        <div className="w-full text-center space-y-3">
          <p className="text-xs text-slate-400">
            {status === "scan_success" ? t("mobileScan.sentToPosHint") : status === "ready" ? t("mobileScan.readyHint") : t("mobileScan.idleHint")}
          </p>


          {status === "ready" && (torchSupported || zoomSupported || cameraDevices.length > 1) ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {cameraDevices.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => void switchCamera()}
                    disabled={isSwitchingCamera}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 font-bold text-slate-100 transition disabled:opacity-60"
                  >
                    {isSwitchingCamera ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <SwitchCamera className="h-3.5 w-3.5" />}
                    {t("mobileScan.switchCamera")}
                  </button>
                ) : null}
                {torchSupported ? (
                  <button
                    type="button"
                    onClick={() => void toggleTorch()}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-bold transition ${torchOn ? "bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-100"}`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {torchOn ? t("mobileScan.torchOn") : t("mobileScan.enableTorch")}
                  </button>
                ) : null}
                {activeCameraId ? (<span className="w-full text-center text-[10px] font-medium text-slate-500">{cameraDevices.find((camera) => camera.id === activeCameraId)?.label || t("mobileScan.activeCamera")}</span>) : null}
              {zoomSupported ? (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2">
                    <ZoomIn className="h-3.5 w-3.5 text-blue-300" />
                    <span className="font-bold text-slate-100">Zoom</span>
                    <span className="font-mono text-blue-300">{zoomValue.toFixed(1)}x</span>
                  </div>
                ) : null}
              </div>
              {activeCameraId ? (<span className="w-full text-center text-[10px] font-medium text-slate-500">{cameraDevices.find((camera) => camera.id === activeCameraId)?.label || t("mobileScan.activeCamera")}</span>) : null}
              {zoomSupported ? (
                <input
                  type="range"
                  min={zoomMin}
                  max={zoomMax}
                  step="0.1"
                  value={zoomValue}
                  onChange={(event) => void applyZoom(Number(event.target.value))}
                  className="w-full accent-blue-500"
                  aria-label={t("mobileScan.adjustZoom")}
                />
              ) : null}
            </div>
          ) : null}
          {lastScanned && (
            <div className="bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-2xl inline-block max-w-xs text-left shadow-lg">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">{t("mobileScan.lastScanned")}</span>
              <span className="font-mono text-sm font-semibold text-emerald-400">{lastScanned}</span>
            </div>
          )}
        </div>

        <div className="w-full border-t border-slate-900 pt-6 mt-2">
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              {t("mobileScan.manualFallback")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder={t("mobileScan.manualPlaceholder")}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
              />
              <button
                type="submit"
                disabled={!manualBarcode.trim() || isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-2xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all shadow-lg active:scale-95"
              >
                {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><span>{t("common.send")}</span><Send className="h-3.5 w-3.5" /></>}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-amber-950/20 border border-amber-500/10 rounded-2xl p-4 text-xs text-amber-300/80 leading-relaxed max-w-sm mt-4 text-center">
          <AlertCircle className="h-4 w-4 inline mr-1 -mt-0.5 text-amber-400" />
          {t("mobileScan.httpsHelp")}
        </div>
      </div>
    </div>
  );
}






































