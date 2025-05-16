import React, { useEffect, useRef, useState } from "react";

interface AudioWaveformMirroredProps {
  stream: MediaStream | null;
  isActive?: boolean;
  title?: string;
}

const AudioWaveformMirrored: React.FC<AudioWaveformMirroredProps> = ({
  stream,
  isActive = true,
}) => {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // No need for previousData in this component as we are not doing smoothing between frames in the same way.
  const [peakData, setPeakData] = useState<
    { value: number; timestamp: number; fadeStart?: number }[]
  >([]);
  const [lastDrawTime, setLastDrawTime] = useState<number>(0);
  const FRAME_INTERVAL = 50; // Update every 50ms (20fps)

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Initialize audio context
  useEffect(() => {
    const initAudioContext = async (): Promise<void> => {
      try {
        const context = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        setAudioContext(context);

        const analyserNode = context.createAnalyser();
        // Reduced FFT size to focus on voice frequencies
        analyserNode.fftSize = 256; // This means 128 frequency bins
        analyserNode.smoothingTimeConstant = 0.8;
        setAnalyser(analyserNode);

        // Peak data needs to cover the original number of frequency bins (e.g., 32 if we display 32 unique bins)
        // The actual display will be mirrored, but the underlying data analysis remains the same.
        setPeakData(new Array(32).fill({ value: 0, timestamp: 0 }));
      } catch (err) {
        setError(
          `Failed to initialize audio context: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    initAudioContext();

    return () => {
      if (audioContext) {
        audioContext.close();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Handle stream changes
  useEffect(() => {
    if (!audioContext || !analyser || !stream) return;

    const connectStream = async (): Promise<void> => {
      try {
        // Disconnect previous source if it exists
        if (sourceRef.current) {
          sourceRef.current.disconnect();
        }

        // Create and connect new source
        const source = audioContext.createMediaStreamSource(stream);
        analyser.smoothingTimeConstant = 0.9;
        analyser.minDecibels = -70;
        analyser.maxDecibels = -30;
        source.connect(analyser);
        sourceRef.current = source;

        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
      } catch (err) {
        setError(
          `Failed to process audio stream: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    connectStream();
  }, [stream, audioContext, analyser]);

  // Handle recording state changes and canvas resize
  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const handleResize = () => {
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    let animationFrameId: number | null = null;

    const animate = () => {
      drawVUMeter();
      if (isActive) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    if (isActive) {
      animate();
    } else {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isActive, analyser]);

  const drawVUMeter = (): void => {
    if (!analyser || !canvasRef.current) return;

    const currentFrameTime = Date.now();
    if (currentFrameTime - lastDrawTime < FRAME_INTERVAL) {
      animationRef.current = requestAnimationFrame(drawVUMeter);
      return;
    }
    setLastDrawTime(currentFrameTime);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = analyser.frequencyBinCount; // e.g., 128
    const dataArray = new Uint8Array(bufferLength);

    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, width, height);

    const originalBands = 32; // Number of frequency bands from the original visualizer
    const mirroredBands = originalBands * 2; // Total bands to display for mirrored effect
    const ledsPerBand = 24;
    const bandWidth = width / mirroredBands; // Width for each individual band
    const ledHeight = (height * 0.9) / ledsPerBand;
    const ledWidth = bandWidth * 0.8;
    const ledGap = ledHeight * 0.2;
    const ledRadius = Math.min(ledWidth, ledHeight) * 0.15;

    for (let i = 0; i < mirroredBands; i++) {
      let dataArrayIndex;
      let peakDataIndex;

      if (i < originalBands) {
        // First half: original order (low to high frequencies)
        dataArrayIndex = i;
        peakDataIndex = i;
      } else {
        // Second half: mirrored order (high to low frequencies)
        dataArrayIndex = originalBands - 1 - (i - originalBands);
        peakDataIndex = originalBands - 1 - (i - originalBands);
      }

      // Ensure dataArrayIndex is within bounds for dataArray
      // We're only using the first `originalBands` (e.g., 32) items from `dataArray`
      if (dataArrayIndex < 0 || dataArrayIndex >= originalBands) continue;

      const value = dataArray[dataArrayIndex] / 255.0;
      const litLeds = Math.min(Math.floor(value * ledsPerBand), ledsPerBand);

      const currentTime = Date.now();
      let peak = peakData[peakDataIndex] || {
        value: 0,
        timestamp: currentTime,
        fadeStart: undefined,
      };

      if (value > peak.value) {
        peak = { value, timestamp: currentTime, fadeStart: undefined };
      } else {
        if (
          typeof peak.fadeStart === "undefined" &&
          currentTime - peak.timestamp > 300
        ) {
          peak.fadeStart = currentTime;
        }
      }

      let peakOpacity = 1;
      if (typeof peak.fadeStart !== "undefined") {
        const fadeElapsed = currentTime - peak.fadeStart;
        peakOpacity = Math.max(0, 1 - fadeElapsed / 500);
        if (peakOpacity === 0) {
          peak.value = 0;
        }
      }
      peakData[peakDataIndex] = peak;

      const peakLed = Math.min(
        Math.floor(peak.value * ledsPerBand),
        ledsPerBand - 1,
      );
      const x = i * bandWidth + bandWidth * 0.1; // X position based on overall band index

      for (let led = 0; led < ledsPerBand; led++) {
        const isLit = led < litLeds;
        const isPeak = led === peakLed;
        const isTopLit = isLit && led >= ledsPerBand - 3;
        const ledY = height - (led + 1) * (ledHeight + ledGap);

        if (isLit) {
          let color = "rgb(225, 230, 255)";
          if (isTopLit) {
            color = "rgb(135, 206, 250)";
          }
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(x, ledY, ledWidth, ledHeight, ledRadius);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();
        }

        if (isPeak && peak.value > 0 && peakOpacity > 0) {
          const peakColor = "rgb(135, 206, 250)";
          ctx.save();
          ctx.globalAlpha = peakOpacity;
          ctx.beginPath();
          ctx.roundRect(x, ledY, ledWidth, ledHeight, ledRadius);
          ctx.fillStyle = peakColor;
          ctx.fill();
          ctx.restore();
        }
      }
    }
    // Removed the recursive call to requestAnimationFrame here as it's handled by the useEffect
  };

  return (
    <div className="flex flex-col w-full" style={{ height: "180px" }}>
      {error && (
        <div className="mt-4 text-red-400 text-center">Error: {error}</div>
      )}
      <div className="w-full flex-grow mt-3">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ height: "160px", background: "transparent" }}
        />
      </div>
    </div>
  );
};

export default AudioWaveformMirrored;
