import React, { useCallback, useEffect, useState } from "react";
import { useMotionDetection } from "../hooks/useMotionDetection";
import {
  LANGUAGES,
  MOTION_CHECK_INTERVAL_MS,
  MOTION_EVENT_THRESHOLD,
  MOTION_SENSITIVITY_THRESHOLD,
  MOTION_WINDOW_MS,
  TEXT_CHANGE_INTERVAL_MS,
} from "./constants";

interface WelcomeScreenProps {
  handleUserArrived: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ handleUserArrived }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  const onMotionDetectedCallback = useCallback(() => {
    console.log(
      "[WelcomeScreen] Motion detected by hook. Setting isVisible to false.",
    );
    setIsVisible(false);
    handleUserArrived();
  }, [handleUserArrived]);

  const { videoRef, canvasRef, startDetection, stopDetection } =
    useMotionDetection({
      onMotionDetected: onMotionDetectedCallback,
      motionSensitivityThreshold: MOTION_SENSITIVITY_THRESHOLD,
      motionEventThreshold: MOTION_EVENT_THRESHOLD,
      motionWindowMs: MOTION_WINDOW_MS,
      motionCheckIntervalMs: MOTION_CHECK_INTERVAL_MS,
    });

  useEffect(() => {
    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentTextIndex(
          (prevIndex: number) => (prevIndex + 1) % LANGUAGES.length,
        );
        setIsFading(false);
      }, 500);
    }, TEXT_CHANGE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isVisible) {
      startDetection();
    } else {
      stopDetection();
    }
    return () => {
      if (isVisible) {
        stopDetection();
      }
    };
  }, [isVisible, startDetection, stopDetection]);

  const handleDirectInteraction = useCallback(() => {
    if (!isVisible) return;
    setIsVisible(false);
    handleUserArrived();
  }, [isVisible, handleUserArrived]);

  useEffect(() => {
    if (!isVisible) return;
    window.addEventListener("mousedown", handleDirectInteraction);
    window.addEventListener("touchstart", handleDirectInteraction);
    return () => {
      window.removeEventListener("mousedown", handleDirectInteraction);
      window.removeEventListener("touchstart", handleDirectInteraction);
    };
  }, [isVisible, handleDirectInteraction]);

  if (!isVisible) {
    return null;
  }

  const welcomeTextClassName = `
    text-8xl 
    font-extralight 
    transition-opacity duration-500 ease-in-out 
    font-['Helvetica_Neue',_-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_Roboto,_sans-serif]
    ${isFading ? "opacity-0" : "opacity-100"}
  `;

  return (
    <div className="fixed top-0 left-0 w-screen h-screen flex flex-col justify-center items-center bg-gray-100 z-[9999] text-gray-400">
      <div className="w-[140px] h-[140px] rounded-full mb-10 shadow-lg flex items-center justify-center bg-white">
        <img
          src="/labkit-v1-crop.png"
          alt="Labkit Logo"
          className="w-[120px] h-[120px] rounded-full object-cover"
        />
      </div>
      <div className={welcomeTextClassName}>{LANGUAGES[currentTextIndex]}</div>
      <video
        ref={videoRef}
        className="absolute top-[-9999px] left-[-9999px] opacity-0 w-[640px] h-[480px]"
        playsInline
        muted
      ></video>
      <canvas
        ref={canvasRef}
        className="absolute top-[-9999px] left-[-9999px] opacity-0"
      ></canvas>
    </div>
  );
};

export default WelcomeScreen;
