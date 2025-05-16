"use client";

import ConnectionButton from "@/components/ConnectionButton";
import ConversationWebrtc, {
  type ConversationWebrtcHandles,
} from "@/components/ConversationWebrtc";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import StatusIndicators from "../../../components/StatusToasts";
import WelcomeScreen from "../../../components/WelcomeScreen";

// Redux imports
import AudioWaveformMirrored from "@/components/eyeCandy/AudioWaveformMirrored";
import { AnimatePresence, motion } from "framer-motion";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import {
  clearHistories,
  dismissWelcomeAndShowContent,
  fetchSessionDataThunk,
  setApiTranslationResult,
  setAreWebRtcHandlesAvailable,
  setAutoInitiateNewSession,
  setCurrentSessionSummary,
  setHistories,
  setSession,
  showWelcome,
  translationProcessingFinished,
  translationProcessingStarted,
} from "../../../store/sessionSlice";
import type { AppDispatch, RootState } from "../../../store/store";

const FADE_DURATION = 400; // ms

// Note: The 'params' prop here is for RSC. Client-side slug is obtained via useParams().
export default function ConversationPage({
  params: rscParams,
}: {
  params: Promise<{ slug: string }>;
}) {
  const clientParams = useParams();
  const slugFromUrl =
    typeof clientParams?.slug === "string" ? clientParams.slug : null;
  console.log(
    "PAGE_INIT: RSC params:",
    rscParams,
    "Client params:",
    clientParams,
    "Resolved slug:",
    slugFromUrl,
  );

  const dispatch = useDispatch<AppDispatch>();
  const {
    currentSessionId: sessionIdFromStore,
    isWelcomeScreenVisible,
    areWebRtcHandlesAvailable,
    isFetchingSessionData,
    autoInitiateNewSession,
  } = useSelector((state: RootState) => state.session);

  // Local states primarily for data passing and WebRTC control
  const [stream, setStream] = useState<MediaStream | null>(null);

  const router = useRouter();

  // New ref setup for reliable ConnectionButton rendering
  const internalWebRtcRef = useRef<ConversationWebrtcHandles | null>(null);
  const mainContentAreaRef = useRef<HTMLDivElement | null>(null); // NEW REF FOR SCROLLABLE AREA

  const webrtcRefCallback = useCallback(
    (handles: ConversationWebrtcHandles | null) => {
      internalWebRtcRef.current = handles;
      const newAvailability = !!handles;
      if (areWebRtcHandlesAvailable !== newAvailability) {
        dispatch(setAreWebRtcHandlesAvailable(newAvailability));
      }
    },
    [dispatch, areWebRtcHandlesAvailable],
  );

  const pageLogger = useCallback((message: string) => {
    console.log(`PAGE_LOG: ${message}`);
  }, []);

  // Effect 1: Sync URL slug with Redux session state.
  useEffect(() => {
    pageLogger(
      `SYNC_EFFECT: slugFromUrl is '${slugFromUrl}'. Current store sessionId is '${sessionIdFromStore}'.`,
    );
    if (slugFromUrl !== sessionIdFromStore) {
      pageLogger(`SYNC_EFFECT: Dispatching setSession with '${slugFromUrl}'.`);
      dispatch(setSession(slugFromUrl));
    } else if (
      slugFromUrl === null &&
      sessionIdFromStore === null &&
      !isWelcomeScreenVisible
    ) {
      pageLogger("SYNC_EFFECT: No slug, ensuring WelcomeScreen is visible.");
      dispatch(showWelcome());
    }
  }, [
    slugFromUrl,
    sessionIdFromStore,
    dispatch,
    pageLogger,
    isWelcomeScreenVisible,
  ]);

  // Effect 2: Fetch initial data when sessionIdFromStore changes and is not null.
  // This effect will fetch session data using our new Redux thunk
  useEffect(() => {
    if (sessionIdFromStore) {
      pageLogger(
        `FETCH_EFFECT: Dispatching fetchSessionDataThunk for session ID: ${sessionIdFromStore}`,
      );
      dispatch(
        fetchSessionDataThunk({ sessionId: sessionIdFromStore, pageLogger }),
      );
    } else {
      pageLogger(
        "FETCH_EFFECT: No session ID, showing welcome screen and initializing empty state",
      );
      dispatch(setHistories({ english: [], spanish: [] }));
      dispatch(setCurrentSessionSummary(null));
      dispatch(showWelcome());
      dispatch(setAutoInitiateNewSession(true));
    }
  }, [sessionIdFromStore, dispatch, pageLogger]);

  const generateNewSessionId = () => {
    return uuidv4();
  };

  const handleRequestNewSession = useCallback(() => {
    pageLogger("PAGE_LOG: handleRequestNewSession - User wants a new session.");

    if (internalWebRtcRef.current) {
      pageLogger(
        "PAGE_LOG: Calling closeSession on current WebRTC instance before creating new session.",
      );
      internalWebRtcRef.current.closeSession(true);
    }

    const newSessionId = generateNewSessionId();
    dispatch(setAutoInitiateNewSession(true));
    dispatch(clearHistories());
    dispatch(setSession(newSessionId));

    router.push(`/c/${newSessionId}`);
  }, [dispatch, router, pageLogger]);

  const handleWelcomeScreenClose = useCallback(() => {
    pageLogger(
      "PAGE_LOG: WelcomeScreen closing. Dispatching dismissWelcomeAndShowContent.",
    );
    dispatch(dismissWelcomeAndShowContent());
  }, [dispatch, pageLogger]);

  const handleWebRtcConnectionChange = useCallback(
    (connected: boolean) => {
      if (connected) {
        pageLogger(
          "PAGE_LOG: WebRTC connected. Dismissing WelcomeScreen if visible.",
        );
        if (isWelcomeScreenVisible) {
          dispatch(dismissWelcomeAndShowContent());
        }
      } else {
        pageLogger(
          "PAGE_LOG: WebRTC disconnected. Potentially starting inactivity timer if content was visible.",
        );
      }
    },
    [dispatch, pageLogger, isWelcomeScreenVisible],
  );

  const handleFinalTranscriptForTranslation = useCallback(
    async (transcript: string, language: string, itemId: string) => {
      if (!sessionIdFromStore) {
        pageLogger(
          "TRANSLATE_ERROR: No session ID available for translation request.",
        );
        return;
      }
      pageLogger(
        `Received final transcript for translation: "${transcript}" (lang: ${language}, itemId: ${itemId}) for session ${sessionIdFromStore}`,
      );

      dispatch(translationProcessingStarted());

      try {
        const response = await fetch("/api/translate-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: transcript,
            source_language: language,
            session_id: sessionIdFromStore,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMsg = `Translation failed: ${errorData.error || response.statusText || response.status}`;
          pageLogger(
            `Translation API error: ${response.status} - ${errorData.error || "Unknown error"}`,
          );
          toast.error(errorMsg);
          dispatch(
            setApiTranslationResult({
              error: errorMsg,
              original_item_id: itemId,
              original_transcript: transcript,
              translated_text: "",
              source_language: language,
              target_language: "",
            }),
          );
          return;
        }

        const translationData = await response.json();
        pageLogger(
          `Translation successful: ${JSON.stringify(translationData)}`,
        );
        toast.success("Translation complete!");
        dispatch(
          setApiTranslationResult({
            ...translationData,
            original_item_id: itemId,
          }),
        );
      } catch (error: any) {
        const errorMsg = `Translation fetch error: ${error.message}`;
        pageLogger(`Error calling translation API: ${error.message}`);
        toast.error(errorMsg);
        dispatch(
          setApiTranslationResult({
            error: errorMsg,
            original_item_id: itemId,
            original_transcript: transcript,
            translated_text: "",
            source_language: language,
            target_language: "",
          }),
        );
      } finally {
        dispatch(translationProcessingFinished());
      }
    },
    [dispatch, pageLogger, sessionIdFromStore],
  );

  // Initialize and manage audio stream for AudioWaveform
  useEffect(() => {
    let micStreamForWaveform: MediaStream | null = null;

    const initializeStream = async () => {
      try {
        pageLogger(
          "PAGE_STREAM: Attempting to initialize microphone stream for AudioWaveform...",
        );
        const currentMicStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        micStreamForWaveform = currentMicStream;
        setStream(currentMicStream);
        pageLogger(
          "PAGE_STREAM: Microphone stream for AudioWaveform initialized successfully.",
        );
      } catch (error) {
        console.error(
          "PAGE_STREAM: Error accessing microphone for AudioWaveform:",
          error,
        );
        toast.error("Error accessing microphone. Please check permissions.");
        pageLogger(
          "PAGE_STREAM: Error initializing microphone stream for AudioWaveform.",
        );
      }
    };

    initializeStream();

    return () => {
      pageLogger(
        "PAGE_STREAM: Cleaning up microphone stream for AudioWaveform.",
      );
      if (micStreamForWaveform) {
        micStreamForWaveform.getTracks().forEach((track) => track.stop());
        pageLogger("PAGE_STREAM: Tracks stopped for AudioWaveform stream.");
      }
      setStream(null);
    };
  }, [pageLogger]);

  const welcomeScreenVariants = {
    hidden: { opacity: 0, transition: { duration: FADE_DURATION / 1000 } },
    visible: { opacity: 1, transition: { duration: FADE_DURATION / 1000 } },
  };

  const mainContentVariants = {
    hidden: {
      opacity: 0,
      transition: {
        duration: FADE_DURATION / 1000,
        delay: (FADE_DURATION / 1000) * 0.5,
      },
    },
    visible: {
      opacity: 1,
      transition: {
        duration: FADE_DURATION / 1000,
        delay: (FADE_DURATION / 1000) * 0.5,
      },
    },
  };

  if (isFetchingSessionData && !isWelcomeScreenVisible && slugFromUrl) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-100"></div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="shrink-0 bg-gray-100 p-8 shadow-md mt-8">
        <div className="relative mx-auto grid place-items-center">
          <div className="w-full pointer-events-auto col-start-1 row-start-1">
            <AudioWaveformMirrored stream={stream} />
          </div>
          {areWebRtcHandlesAvailable && (
            <div className="col-start-1 row-start-1 pointer-events-auto z-10">
              <ConnectionButton
                hasActiveSessionId={!!sessionIdFromStore}
                onInitiateSession={() => {
                  pageLogger("PAGE_LOG: ConnectionButton -> onInitiateSession");
                  internalWebRtcRef.current?.initiateSession(true);
                }}
                onDisconnect={() => {
                  pageLogger("PAGE_LOG: ConnectionButton -> onDisconnect");
                  internalWebRtcRef.current?.closeSession(false);
                }}
                onExitToNewSessionFromSummaryView={() => {
                  pageLogger(
                    "PAGE_LOG: ConnectionButton -> onExitToNewSession (from summary or general exit)",
                  );
                  internalWebRtcRef.current?.closeSession(true);
                  handleRequestNewSession();
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        ref={mainContentAreaRef}
        className="flex-grow overflow-hidden relative"
      >
        <AnimatePresence mode="wait">
          {isWelcomeScreenVisible && (
            <motion.div
              key="welcome"
              className="absolute inset-0 w-full h-full"
              variants={welcomeScreenVariants}
              initial="visible"
              exit="hidden"
            >
              <WelcomeScreen handleUserArrived={handleWelcomeScreenClose} />
            </motion.div>
          )}
          {!isWelcomeScreenVisible && sessionIdFromStore && (
            <motion.div
              key="conversation"
              className="absolute inset-0 w-full h-full"
              variants={mainContentVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <ConversationWebrtc
                ref={webrtcRefCallback}
                onConnectionStateChange={handleWebRtcConnectionChange}
                onFinalTranscriptForTranslation={
                  handleFinalTranscriptForTranslation
                }
                onRequestNewSession={handleRequestNewSession}
                autoInitiateNewSession={autoInitiateNewSession}
                onNewSessionAutoInitiated={() =>
                  dispatch(setAutoInitiateNewSession(false))
                }
                mainContentAreaRef={mainContentAreaRef}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <StatusIndicators />
    </div>
  );
}
