import { useRef, useCallback, useEffect } from "react";

interface MotionDetectionProps {
  onMotionDetected: () => void;
  motionSensitivityThreshold: number;
  motionEventThreshold: number;
  motionWindowMs: number;
  motionCheckIntervalMs: number;
}

export const useMotionDetection = ({
  onMotionDetected,
  motionSensitivityThreshold,
  motionEventThreshold,
  motionWindowMs,
  motionCheckIntervalMs,
}: MotionDetectionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastImageDataRef = useRef<ImageData | null>(null);
  const motionTimestampsRef = useRef<number[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const motionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraInitializedRef = useRef(false);

  // Ref to hold the latest onMotionDetected prop to stabilize callbacks
  const onMotionDetectedRef = useRef(onMotionDetected);
  useEffect(() => {
    onMotionDetectedRef.current = onMotionDetected;
  }, [onMotionDetected]);

  const detectMotion = useCallback(() => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      videoRef.current.readyState < videoRef.current.HAVE_ENOUGH_DATA
    ) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) return;

    const scale = 0.1;
    canvas.width = Math.floor(video.videoWidth * scale);
    canvas.height = Math.floor(video.videoHeight * scale);

    if (canvas.width === 0 || canvas.height === 0) {
      if (
        lastImageDataRef.current &&
        (lastImageDataRef.current.width !== 0 ||
          lastImageDataRef.current.height !== 0)
      ) {
        console.warn(
          "[Motion] Canvas dimensions became zero. Resetting lastImageData.",
        );
        lastImageDataRef.current = null;
      }
      return;
    }

    const regionX = Math.floor(canvas.width / 3);
    const regionY = Math.floor(canvas.height / 3);
    const regionWidth = Math.floor(canvas.width / 3);
    const regionHeight = Math.floor(canvas.height / 3);

    if (regionWidth === 0 || regionHeight === 0) {
      if (
        lastImageDataRef.current &&
        (lastImageDataRef.current.width !== 0 ||
          lastImageDataRef.current.height !== 0)
      ) {
        console.warn(
          "[Motion] Central region dimensions became zero. Resetting lastImageData.",
        );
        lastImageDataRef.current = null;
      }
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentImageData = context.getImageData(
      regionX,
      regionY,
      regionWidth,
      regionHeight,
    );
    let motionAmount = 0;

    if (lastImageDataRef.current) {
      if (
        lastImageDataRef.current.width !== regionWidth ||
        lastImageDataRef.current.height !== regionHeight
      ) {
        console.warn(
          `[Motion] Stale lastImageData dimensions. Last: ${lastImageDataRef.current.width}x${lastImageDataRef.current.height}, NewRegion: ${regionWidth}x${regionHeight}. Resetting.`,
        );
        lastImageDataRef.current = null;
      } else {
        const lastData = lastImageDataRef.current.data;
        const currentData = currentImageData.data;
        for (let i = 0; i < currentData.length; i += 4) {
          const diff = Math.abs(currentData[i] - lastData[i]);
          if (diff > 20) {
            // TODO: Consider making this 'pixel diff threshold' a prop
            motionAmount++;
          }
        }
        const centerArea = regionWidth * regionHeight;
        if (centerArea > 0) {
          motionAmount = (motionAmount / centerArea) * 100;
        } else {
          motionAmount = 0;
        }
      }
    }

    lastImageDataRef.current = currentImageData;
    const now = Date.now();

    if (motionAmount > motionSensitivityThreshold) {
      console.log(`[Motion] Detected frame: ${motionAmount.toFixed(2)}%`);
      motionTimestampsRef.current.push(now);
      const windowStart = now - motionWindowMs;
      motionTimestampsRef.current = motionTimestampsRef.current.filter(
        (timestamp) => timestamp >= windowStart,
      );
      const motionCountInWindow = motionTimestampsRef.current.length;
      console.log(
        `[Motion] Events in last ${motionWindowMs}ms: ${motionCountInWindow} (Threshold: ${motionEventThreshold})`,
      );

      if (motionCountInWindow >= motionEventThreshold) {
        console.log(`[Motion] Threshold met. Triggering handler.`);
        onMotionDetectedRef.current();
        // Stop camera and interval internally within the hook
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (motionCheckIntervalRef.current) {
          clearInterval(motionCheckIntervalRef.current);
          motionCheckIntervalRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        motionTimestampsRef.current = [];
        lastImageDataRef.current = null;
        cameraInitializedRef.current = false; // Mark as not initialized so it can restart if hook is re-enabled
      }
    }
  }, [motionSensitivityThreshold, motionEventThreshold, motionWindowMs]); // onMotionDetectedRef is stable

  const startDetection = useCallback(async () => {
    if (cameraInitializedRef.current) return; // Already initialized or in process

    cameraInitializedRef.current = true;
    console.log(
      "[useMotionDetection] Initializing camera and motion detection...",
    );
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        console.log(
          "[useMotionDetection] getUserMedia is supported, requesting video stream...",
        );
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        console.log("[useMotionDetection] Video stream obtained successfully.");
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.error("[useMotionDetection] Video play failed:", err);
            cameraInitializedRef.current = false; // Allow re-try
          });

          const setupMotionInterval = () => {
            if (motionCheckIntervalRef.current)
              clearInterval(motionCheckIntervalRef.current);
            motionCheckIntervalRef.current = setInterval(
              detectMotion,
              motionCheckIntervalMs,
            );
            console.log(
              "[useMotionDetection] Motion check interval started/restarted.",
            );
          };

          videoRef.current.onloadedmetadata = setupMotionInterval;
          videoRef.current.oncanplay = setupMotionInterval;
        }
      } else {
        console.warn(
          "[useMotionDetection] getUserMedia not supported by this browser.",
        );
        cameraInitializedRef.current = false;
      }
    } catch (err) {
      console.error("[useMotionDetection] Error accessing webcam:", err);
      cameraInitializedRef.current = false;
    }
  }, [detectMotion, motionCheckIntervalMs]);

  const stopDetection = useCallback(() => {
    console.log(
      "[useMotionDetection] Stopping detection and cleaning up camera.",
    );
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (motionCheckIntervalRef.current) {
      clearInterval(motionCheckIntervalRef.current);
      motionCheckIntervalRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    cameraInitializedRef.current = false;
    // Reset motion tracking state as well
    motionTimestampsRef.current = [];
    lastImageDataRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  return {
    videoRef,
    canvasRef,
    startDetection,
    stopDetection,
    isCameraInitialized: cameraInitializedRef.current,
  };
};
