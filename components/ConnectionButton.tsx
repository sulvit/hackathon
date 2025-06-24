"use client";
import {
  faCircle,
  faPause,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";

interface ConnectionButtonProps {
  hasActiveSessionId: boolean;
  onInitiateSession: () => void;
  onDisconnect: () => void;
  onExitToNewSessionFromSummaryView: () => void;
}

export default function ConnectionButton({
  hasActiveSessionId,
  onInitiateSession,
  onDisconnect,
  onExitToNewSessionFromSummaryView,
}: ConnectionButtonProps) {
  const {
    webRtcIsLoading: isLoading,
    webRtcIsConnected: isConnected,
    currentSessionSummary,
  } = useSelector((state: RootState) => state.session);

  const [isHovering, setIsHovering] = useState(false);

  const hasSummaryDataForCurrentSession = !!currentSessionSummary;

  let buttonText: string;
  let actionHandler: () => void;
  let statusText: string;
  let iconToDisplay: any = null;
  let iconColorClass = "";
  let imageBorderClass = "border-transparent";
  let showLoadingPulse = false;
  let showConnectedPulse = false;

  if (isLoading && !isConnected) {
    buttonText = "Connecting";
    actionHandler = () => {};
    statusText = "STARTING UP...";
    iconToDisplay = faSpinner;
    iconColorClass = "text-gray-300 opacity-90";
    imageBorderClass = "border-gray-300";
    showLoadingPulse = true;
  } else if (!isLoading && isConnected) {
    buttonText = "Disconnect";
    actionHandler = onDisconnect;
    statusText = "TRANSCRIBING";
    iconToDisplay = isHovering ? faPause : faCircle;
    iconColorClass = "text-red-400 opacity-90";
    imageBorderClass = "border-red-400";
    showConnectedPulse = true;
  } else if (!isLoading && !isConnected) {
    statusText = "PAUSED";
    if (hasActiveSessionId && hasSummaryDataForCurrentSession) {
      buttonText = "Exit";
      actionHandler = onExitToNewSessionFromSummaryView;
    } else {
      buttonText = "Connect";
      actionHandler = onInitiateSession;
    }
    iconToDisplay = isHovering ? faCircle : faPause;
    iconColorClass = "text-gray-300 opacity-90";
    imageBorderClass = "border-gray-300";
  } else {
    buttonText = "Error";
    actionHandler = () => {};
    statusText = "UNKNOWN STATE";
    imageBorderClass = "border-yellow-300";
  }

  return (
    <div className="flex flex-col items-center">
      <div
        role="button"
        onClick={actionHandler}
        className="relative mb-2 cursor-pointer"
        aria-label={buttonText}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <motion.div
          animate={{
            scale: isConnected ? [1, 1.1, 1] : 1,
          }}
          transition={{
            duration: 1.5,
            repeat: isConnected ? Infinity : 0,
            ease: "easeInOut",
          }}
          className="relative"
        >
          <div
            className={`relative w-[120px] h-[120px] rounded-full flex items-center justify-center overflow-hidden bg-white border-4 ${imageBorderClass} shadow-lg`}
          >
            <img
              src="/labkit-v1-crop.png"
              alt="labkit Logo"
              width={100}
              height={100}
              className="rounded-full transition-shadow duration-300 hover:scale-110 hover:transition-all"
            />
          </div>

          {iconToDisplay && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <FontAwesomeIcon
                icon={iconToDisplay}
                className={`${iconColorClass} text-5xl`}
                spin={iconToDisplay === faSpinner}
              />
            </div>
          )}

          {showLoadingPulse && (
            <motion.div
              animate={{ opacity: [0, 0.3, 0], scale: [1, 1.15, 1] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {showConnectedPulse && (
            <motion.div
              animate={{ opacity: [0, 0.3, 0], scale: [1, 1.15, 1] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}
        </motion.div>
      </div>
      <div
        className="text-gray-500 text-xs font-medium text-center"
        style={{
          textShadow:
            "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, -2px 0 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, 0 2px 0 #fff", // White outline effect
        }}
      >
        {statusText}
      </div>
    </div>
  );
}
