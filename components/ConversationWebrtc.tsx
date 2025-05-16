"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import type { PendingToolCall } from "../store/sessionSlice";
import {
  clearApiTranslationResult,
  clearPendingTtsRequest,
  fetchSessionSummaryThunk,
  setPendingTtsRequest,
  setWebRtcConnected,
  setWebRtcLoading,
  submitMockToolOutputsThunk,
  ttsAudioFetchStarted,
} from "../store/sessionSlice";
import type { AppDispatch, RootState } from "../store/store";
import type {
  AiStateType,
  OpenAiEventContext,
  TranslationEffectContext as OriginalTranslationEffectContext,
} from "../types/conversation";
import ConversationActions from "./ConversationActions";
import ConversationSummary from "./ConversationSummary";
import ConversationV2 from "./ConversationV2";
import BottomScrollFade from "./eyeCandy/BottomScrollFade";
import TopScrollFade from "./eyeCandy/TopScrollFade";
import {
  handleOpenAiMessage,
  handleTranslationResult,
} from "./webrtcEventHandlers";
import { fetchOpenAiEphemeralKey } from "./webrtcUtils";

// Extend original type to include setPendingTtsRequest for our specific use case here
interface TranslationEffectContext extends OriginalTranslationEffectContext {
  setPendingTtsRequest: typeof setPendingTtsRequest;
}

const OPENAI_WEBRTC_ENDPOINT_MODEL = "gpt-4o-mini-realtime-preview-2024-12-17";

export interface ConversationWebrtcHandles {
  initiateSession: (isNewSession?: boolean) => Promise<void>;
  closeSession: (
    isNewSessionRequest?: boolean,
    closingSessionId?: string | null,
  ) => void;
}

interface ConversationWebrtcProps {
  onConnectionStateChange?: (isConnected: boolean) => void;
  onFinalTranscriptForTranslation?: (
    transcript: string,
    language: string,
    itemId: string,
  ) => void;
  onRequestNewSession?: () => void;
  autoInitiateNewSession?: boolean;
  onNewSessionAutoInitiated?: () => void;
  mainContentAreaRef?: React.RefObject<HTMLDivElement | null>;
}

const ConversationWebrtc = forwardRef<
  ConversationWebrtcHandles,
  ConversationWebrtcProps
>(
  (
    {
      onConnectionStateChange,
      onFinalTranscriptForTranslation,
      onRequestNewSession,
      autoInitiateNewSession,
      onNewSessionAutoInitiated,
      mainContentAreaRef,
    },
    ref,
  ) => {
    const dispatch = useDispatch<AppDispatch>();
    const {
      englishHistory,
      spanishHistory,
      currentSessionId: activeSessionId,
      webRtcIsLoading: isLoading,
      webRtcIsConnected: isConnected,
      isEnglishTtsEnabled,
      isSpanishTtsEnabled,
      currentSessionSummary,
      apiTranslationResult,
      pendingToolCalls,
      isFetchingSummary,
      fetchSummaryError,
      pendingTtsRequest,
    } = useSelector((state: RootState) => state.session);

    const [currentAiState, setCurrentAiState] = useState<AiStateType>("idle");
    const [directTranscript, setDirectTranscript] = useState<string>("");

    const [lastSuccessfullySpokenText, setLastSuccessfullySpokenText] =
      useState<string | null>(null);
    const [lastSuccessfullySpokenLang, setLastSuccessfullySpokenLang] =
      useState<string | null>(null);
    const lastSuccessfullySpokenLangRef = useRef<string | null>(null);
    const [ttsInitiatedForItem, setTtsInitiatedForItem] = useState<
      string | null
    >(null);
    const [isApiReadyForResponse, setIsApiReadyForResponse] =
      useState<boolean>(true);

    const currentTranscriptionItemIdRef = useRef<string | null>(null);
    const processedRepeatRequestsRef = useRef<Record<string, boolean>>({});
    const processedErrorItemsRef = useRef<Record<string, boolean>>({});
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const autoInitiatedForSessionRef = useRef<string | null>(null);
    const lastProcessedItemIdRef = useRef<string | null>(null);
    const inFlightSummaryRequestRef = useRef<string | null>(null);

    const summaryContainerRef = useRef<HTMLDivElement | null>(null);
    const internalScrollContainerRef = useRef<HTMLDivElement | null>(null);

    const addLog = useCallback(
      (message: string) => {
        console.log(`[CW_LOG:${activeSessionId?.substring(0, 6)}]: ${message}`);
      },
      [activeSessionId],
    );

    useEffect(() => {
      lastSuccessfullySpokenLangRef.current = lastSuccessfullySpokenLang;
    }, [lastSuccessfullySpokenLang]);

    const onTrackLogic = useCallback(
      (event: RTCTrackEvent) => {
        addLog(
          `Remote audio track received. Stream ID: ${event.streams[0]?.id}`,
        );
        if (remoteAudioPlayerRef.current) {
          if (!remoteAudioPlayerRef.current.srcObject)
            remoteAudioPlayerRef.current.srcObject = new MediaStream();
          (remoteAudioPlayerRef.current.srcObject as MediaStream).addTrack(
            event.track,
          );
          addLog("Remote audio track added. Attempting play.");
          setCurrentAiState("speaking_tts");
          remoteAudioPlayerRef.current.play().catch((e) => {
            addLog(`TTS Audio play error: ${e}`);
            setCurrentAiState("listening");
          });
        }
      },
      [addLog, setCurrentAiState],
    );

    const closeSession = useCallback(
      (
        isNewSessionRequest: boolean = false,
        closingSessionId?: string | null,
      ) => {
        const sIdForLog = closingSessionId || activeSessionId;
        addLog(
          `****** CLOSE_SESSION_CALLED ******. For session: ${sIdForLog?.substring(
            0,
            6,
          )}. isNewReq: ${isNewSessionRequest}, isConnected(Redux): ${isConnected}, isLoading(Redux): ${isLoading}`,
        );
        addLog(
          `CLOSE_SESSION: Refs before nullify for ${sIdForLog?.substring(0, 6)}: peerConnection: ${
            peerConnectionRef.current ? "exists" : "null"
          }, dataChannel: ${dataChannelRef.current ? "exists" : "null"}, localStream: ${
            localStreamRef.current ? "exists" : "null"
          }`,
        );

        dispatch(setWebRtcLoading(false));
        setCurrentAiState("idle");
        setDirectTranscript("");
        setLastSuccessfullySpokenText(null);
        setLastSuccessfullySpokenLang(null);
        setTtsInitiatedForItem(null);
        setIsApiReadyForResponse(true);
        currentTranscriptionItemIdRef.current = null;
        processedRepeatRequestsRef.current = {};
        processedErrorItemsRef.current = {};

        if (dataChannelRef.current) {
          addLog(
            `CLOSE_SESSION: Closing dataChannel for session ${sIdForLog?.substring(0, 6)}`,
          );
          dataChannelRef.current.close();
          dataChannelRef.current = null;
          addLog(
            `CLOSE_SESSION: dataChannel for session ${sIdForLog?.substring(0, 6)} nulled.`,
          );
        }
        if (peerConnectionRef.current) {
          addLog(
            `CLOSE_SESSION: Closing peerConnection for session ${sIdForLog?.substring(0, 6)}`,
          );
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
          addLog(
            `CLOSE_SESSION: peerConnection for session ${sIdForLog?.substring(0, 6)} nulled.`,
          );
        }
        if (localStreamRef.current) {
          addLog(
            `CLOSE_SESSION: Stopping localStream tracks for session ${sIdForLog?.substring(0, 6)}`,
          );
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
          addLog(
            `CLOSE_SESSION: localStream for session ${sIdForLog?.substring(0, 6)} nulled.`,
          );
        }
        if (remoteAudioPlayerRef.current?.srcObject) {
          const stream = remoteAudioPlayerRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
          remoteAudioPlayerRef.current.srcObject = null;
        }
        dispatch(setWebRtcConnected(false));
        addLog("Session closed & resources reset.");
      },
      [
        addLog,
        activeSessionId,
        dispatch,
        isConnected,
        isLoading,
        setCurrentAiState,
      ],
    );

    const initiateSession = useCallback(
      async (isNewSessionUserAction: boolean = false) => {
        addLog(
          `INIT_SESSION: UserAction: ${isNewSessionUserAction}, Redux connected: ${isConnected}, Redux loading: ${isLoading}, SessionId: ${activeSessionId}`,
        );
        if (!activeSessionId) {
          addLog("INIT_SESSION: Aborted. No activeSessionId.");
          return;
        }
        const sessionIdAtInitiation = activeSessionId;
        addLog(
          `INIT_SESSION: Proceeding with session ID at initiation: ${sessionIdAtInitiation}`,
        );

        if (!isNewSessionUserAction && (isConnected || isLoading)) {
          addLog(
            "INIT_SESSION: Bypassed (already connected/loading or not user action).",
          );
          return;
        }
        if (isNewSessionUserAction && isConnected) {
          addLog("INIT_SESSION: User action while connected. Closing current.");
          closeSession(true);
          return;
        }

        dispatch(setWebRtcLoading(true));
        setCurrentAiState("idle");
        setDirectTranscript("");
        setTtsInitiatedForItem(null);
        setIsApiReadyForResponse(true);
        currentTranscriptionItemIdRef.current = null;
        processedRepeatRequestsRef.current = {};
        processedErrorItemsRef.current = {};

        addLog("Initiating OpenAI WebRTC session...");
        const keyData = await fetchOpenAiEphemeralKey(addLog);
        if (!keyData?.ephemeralKey) {
          dispatch(setWebRtcLoading(false));
          addLog("INIT_SESSION: Failed, no ephemeral key.");
          return;
        }

        try {
          const pc = new RTCPeerConnection();
          peerConnectionRef.current = pc;
          addLog(
            `INIT_SESSION: peerConnectionRef SET for ${sessionIdAtInitiation}`,
          );
          pc.onicecandidate = (event) => {
            if (event.candidate)
              addLog(`ICE: ${event.candidate.candidate.substring(0, 30)}...`);
            else addLog("ICE Complete.");
          };
          pc.onconnectionstatechange = () => {
            addLog(
              `Peer state for ${sessionIdAtInitiation?.substring(0, 6)}: ${pc.connectionState}`,
            );
            if (pc.connectionState === "connected") {
              dispatch(setWebRtcConnected(true));
              setCurrentAiState("listening");
              setIsApiReadyForResponse(true);
              addLog(
                `WebRTC Connected for ${sessionIdAtInitiation?.substring(0, 6)}!`,
              );
            } else if (
              ["failed", "disconnected", "closed"].includes(pc.connectionState)
            ) {
              if (isConnected) closeSession(false, sessionIdAtInitiation);
              else if (isLoading) {
                dispatch(setWebRtcLoading(false));
                setCurrentAiState("idle");
              }
            }
          };
          pc.ontrack = onTrackLogic;
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          localStreamRef.current = stream;
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          const dc = pc.createDataChannel("oai-events");
          dataChannelRef.current = dc;
          addLog(
            `INIT_SESSION: dataChannelRef SET for ${sessionIdAtInitiation}`,
          );
          dc.onopen = () => {
            addLog(
              `INIT_SESSION: Data channel OPENED for ${sessionIdAtInitiation}`,
            );
          };
          dc.onmessage = (event) => {
            if (activeSessionId !== sessionIdAtInitiation) {
              addLog(
                `[SessionMismatch] Ignoring event for ${sessionIdAtInitiation?.substring(
                  0,
                  6,
                )} via DC. Current session is ${activeSessionId?.substring(0, 6)}`,
              );
              return;
            }
            const eventContext: OpenAiEventContext = {
              addLog,
              setCurrentAiState,
              setDirectTranscript,
              directTranscript,
              currentTranscriptionItemIdRef,
              onFinalTranscriptForTranslation,
              setIsApiReadyForResponse,
              currentAiState,
              sessionId: activeSessionId,
              dispatch,
              lastSuccessfullySpokenLangRef,
              currentEnglishHistory: englishHistory,
              currentSpanishHistory: spanishHistory,
            };
            handleOpenAiMessage(
              typeof event.data === "string"
                ? event.data
                : event.data.toString(),
              eventContext,
            );
          };
          dc.onclose = () => {
            addLog("Data channel closed.");
            setCurrentAiState("idle");
          };
          dc.onerror = (error) => {
            addLog(`Data channel error: ${JSON.stringify(error)}`);
            setCurrentAiState("idle");
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const sdpResponse = await fetch(
            `https://api.openai.com/v1/realtime?model=${OPENAI_WEBRTC_ENDPOINT_MODEL}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${keyData.ephemeralKey}`,
                "Content-Type": "application/sdp",
              },
              body: offer.sdp,
            },
          );
          if (!sdpResponse.ok) {
            const errorText = await sdpResponse.text();
            addLog(`SDP exchange failed: ${sdpResponse.status} - ${errorText}`);
            closeSession(false);
            return;
          }
          await pc.setRemoteDescription({
            type: "answer",
            sdp: await sdpResponse.text(),
          });
        } catch (error: any) {
          addLog(`INIT_SESSION Error: ${error.message || error}`);
          setCurrentAiState("idle");
          closeSession(false);
        }
      },
      [
        addLog,
        activeSessionId,
        isConnected,
        isLoading,
        closeSession,
        onFinalTranscriptForTranslation,
        dispatch,
        setCurrentAiState,
        setDirectTranscript,
        setIsApiReadyForResponse,
        onTrackLogic,
        englishHistory,
        spanishHistory,
      ],
    );

    useImperativeHandle(ref, () => ({ initiateSession, closeSession }), [
      initiateSession,
      closeSession,
    ]);

    useEffect(() => {
      onConnectionStateChange?.(isConnected);
    }, [isConnected, onConnectionStateChange]);

    useEffect(() => {
      const sessionToClean = activeSessionId;
      const currentPeerConnection = peerConnectionRef.current;
      return () => {
        if (currentPeerConnection) {
          addLog(
            `Unmount/cleanup effect for session: ${sessionToClean?.substring(0, 6)}. Calling closeSession.`,
          );
          closeSession(false, sessionToClean);
        }
      };
    }, [closeSession, activeSessionId]);

    useEffect(() => {
      if (remoteAudioPlayerRef.current) {
        remoteAudioPlayerRef.current.onended = () => {
          addLog("TTS Audio finished.");
          setCurrentAiState("listening");
        };
      }
    }, [remoteAudioPlayerRef, setCurrentAiState, addLog]);

    useEffect(() => {
      addLog(
        `CONV_WEBRTC_EFFECT[apiTranslationResult]: Fired. Value from Redux: ${JSON.stringify(apiTranslationResult)}`,
      );
      if (
        apiTranslationResult &&
        apiTranslationResult.original_item_id &&
        apiTranslationResult.original_item_id !== lastProcessedItemIdRef.current
      ) {
        if (!apiTranslationResult.error) {
          addLog(
            `CONV_WEBRTC_EFFECT[apiTranslationResult]: Value is TRUTHY and NEW. Processing for item ${apiTranslationResult.original_item_id}.`,
          );
          const context: TranslationEffectContext = {
            addLog,
            lastSuccessfullySpokenText,
            lastSuccessfullySpokenLang,
            ttsInitiatedForItem,
            setTtsInitiatedForItem,
            isApiReadyForResponse,
            setIsApiReadyForResponse,
            currentAiState,
            setCurrentAiState,
            processedRepeatRequestsRef,
            processedErrorItemsRef,
            translationResult: apiTranslationResult,
            isConnected,
            sessionId: activeSessionId,
            dispatch,
            isEnglishTtsEnabled,
            isSpanishTtsEnabled,
            setPendingTtsRequest,
          };
          handleTranslationResult(context);
          lastProcessedItemIdRef.current =
            apiTranslationResult.original_item_id;
        } else {
          addLog(
            `CONV_WEBRTC_EFFECT[apiTranslationResult]: Value for ${apiTranslationResult.original_item_id} has error. Not processing for TTS.`,
          );
          lastProcessedItemIdRef.current =
            apiTranslationResult.original_item_id;
        }
        addLog(
          `CONV_WEBRTC_EFFECT[apiTranslationResult]: Dispatching clearApiTranslationResult for item ${apiTranslationResult.original_item_id}.`,
        );
        setTimeout(() => dispatch(clearApiTranslationResult()), 50);
      } else if (
        apiTranslationResult &&
        apiTranslationResult.original_item_id &&
        apiTranslationResult.original_item_id === lastProcessedItemIdRef.current
      ) {
        addLog(
          `CONV_WEBRTC_EFFECT[apiTranslationResult]: Value for item ${apiTranslationResult.original_item_id} already processed/seen, skipping. Dispatching clearApiTranslationResult.`,
        );
        setTimeout(() => dispatch(clearApiTranslationResult()), 50);
      } else if (!apiTranslationResult) {
        addLog(
          `CONV_WEBRTC_EFFECT[apiTranslationResult]: Value from Redux is NULL.`,
        );
        lastProcessedItemIdRef.current = null;
      }
    }, [
      apiTranslationResult,
      dispatch,
      addLog,
      activeSessionId,
      lastSuccessfullySpokenText,
      lastSuccessfullySpokenLang,
      ttsInitiatedForItem,
      setTtsInitiatedForItem,
      isApiReadyForResponse,
      setIsApiReadyForResponse,
      currentAiState,
      setCurrentAiState,
      processedRepeatRequestsRef,
      processedErrorItemsRef,
      isConnected,
      isEnglishTtsEnabled,
      isSpanishTtsEnabled,
      setPendingTtsRequest,
    ]);

    useEffect(() => {
      if (
        pendingTtsRequest &&
        isApiReadyForResponse &&
        isConnected &&
        dataChannelRef.current &&
        dataChannelRef.current.readyState === "open"
      ) {
        addLog(
          `TTS_QUEUE_PROCESSOR: Conditions met. Processing TTS for: "${pendingTtsRequest.text.substring(
            0,
            20,
          )}..." (item: ${pendingTtsRequest.itemId})`,
        );

        dispatch(ttsAudioFetchStarted());
        setCurrentAiState("speaking_tts");
        setIsApiReadyForResponse(false);
        setLastSuccessfullySpokenText(pendingTtsRequest.text);
        setLastSuccessfullySpokenLang(pendingTtsRequest.language);

        const payload = {
          type: "response.create",
          response: {
            input: [],
            instructions: `Say exactly the following:\n${pendingTtsRequest.text}`,
            modalities: ["audio", "text"],
            voice: "alloy",
          },
        };
        dataChannelRef.current.send(JSON.stringify(payload));
        addLog(
          `TTS_QUEUE_PROCESSOR: Sent response.create for TTS: "${pendingTtsRequest.text}".`,
        );

        dispatch(clearPendingTtsRequest());
      } else if (pendingTtsRequest) {
        let reason = "";
        if (!isApiReadyForResponse) reason += "API not ready; ";
        if (!isConnected) reason += "WebRTC general flag not connected; ";
        if (!dataChannelRef.current) reason += "Data channel ref not set; ";
        else if (dataChannelRef.current.readyState !== "open")
          reason += `Data channel not open (State: ${dataChannelRef.current.readyState}); `;

        if (reason) {
          addLog(
            `TTS_QUEUE_PROCESSOR: TTS request for "${pendingTtsRequest.text.substring(
              0,
              20,
            )}..." is PENDING. Reason: ${reason.slice(0, -2)}`,
          );
        }
      }
    }, [
      pendingTtsRequest,
      isApiReadyForResponse,
      isConnected,
      dataChannelRef.current?.readyState,
      addLog,
      dispatch,
      setCurrentAiState,
      setIsApiReadyForResponse,
      setLastSuccessfullySpokenText,
      setLastSuccessfullySpokenLang,
    ]);

    useEffect(() => {
      if (
        activeSessionId &&
        !currentSessionSummary &&
        !isFetchingSummary &&
        !fetchSummaryError &&
        inFlightSummaryRequestRef.current !== activeSessionId
      ) {
        addLog(
          `Dispatching fetchSessionSummaryThunk for session ${activeSessionId}`,
        );
        inFlightSummaryRequestRef.current = activeSessionId;
        dispatch(
          fetchSessionSummaryThunk({
            sessionId: activeSessionId,
            pageLogger: addLog,
          }),
        );
      }
    }, [
      activeSessionId,
      currentSessionSummary,
      isFetchingSummary,
      fetchSummaryError,
      dispatch,
      addLog,
    ]);

    useEffect(() => {
      if (!isFetchingSummary && inFlightSummaryRequestRef.current) {
        addLog(
          `Summary fetch completed for session ${inFlightSummaryRequestRef.current}. Clearing in-flight request.`,
        );
        inFlightSummaryRequestRef.current = null;
      }
    }, [isFetchingSummary, addLog]);

    useEffect(() => {
      addLog(
        `CONV_WEBRTC_AUTO_INIT_EFFECT: Running. Values: { autoInitiateNewSession: ${autoInitiateNewSession}, activeSessionId: ${activeSessionId}, isConnected: ${isConnected}, isLoading: ${isLoading} }`,
      );
      if (
        autoInitiateNewSession &&
        activeSessionId &&
        !isConnected &&
        !isLoading &&
        autoInitiatedForSessionRef.current !== activeSessionId
      ) {
        addLog(
          "CONV_WEBRTC_AUTO_INIT: Conditions met! Auto-initiating session for new sessionId: " +
            activeSessionId,
        );
        initiateSession(true);
        autoInitiatedForSessionRef.current = activeSessionId;
        if (onNewSessionAutoInitiated) {
          onNewSessionAutoInitiated();
        }
      } else if (
        !autoInitiateNewSession &&
        autoInitiatedForSessionRef.current
      ) {
        autoInitiatedForSessionRef.current = null;
      }
    }, [
      autoInitiateNewSession,
      activeSessionId,
      isConnected,
      isLoading,
      initiateSession,
      onNewSessionAutoInitiated,
      addLog,
    ]);

    const handleSummaryAnimationComplete = useCallback(() => {
      addLog("CONV_WEBRTC_EFFECT[summaryScroll]: Summary animation COMPLETE.");

      if (summaryContainerRef.current && internalScrollContainerRef.current) {
        const summaryRect = summaryContainerRef.current.getBoundingClientRect();
        const scrollableAreaRect =
          internalScrollContainerRef.current.getBoundingClientRect();
        const scrollTop =
          summaryRect.top -
          scrollableAreaRect.top +
          internalScrollContainerRef.current.scrollTop;
        addLog(
          `CONV_WEBRTC_EFFECT[summaryScroll][AnimEnd][Internal]: Scrolling internalScrollContainerRef. summaryRect.top: ${summaryRect.top}, scrollableAreaRect.top: ${scrollableAreaRect.top}, internalScrollContainerRef.scrollTop: ${internalScrollContainerRef.current.scrollTop}, targetScrollTop: ${scrollTop}`,
        );
        internalScrollContainerRef.current.scrollTo({
          top: scrollTop,
          behavior: "smooth",
        });
      } else if (
        summaryContainerRef.current &&
        mainContentAreaRef &&
        mainContentAreaRef.current
      ) {
        const summaryRect = summaryContainerRef.current.getBoundingClientRect();
        const mainAreaRect = mainContentAreaRef.current.getBoundingClientRect();
        const scrollTop =
          summaryRect.top -
          mainAreaRect.top +
          mainContentAreaRef.current.scrollTop;
        addLog(
          `CONV_WEBRTC_EFFECT[summaryScroll][AnimEnd][Prop]: Scrolling mainContentAreaRef. summaryRect.top: ${summaryRect.top}, mainAreaRect.top: ${mainAreaRect.top}, mainAreaScrollTop: ${mainContentAreaRef.current.scrollTop}, targetScrollTop: ${scrollTop}`,
        );
        mainContentAreaRef.current.scrollTo({
          top: scrollTop,
          behavior: "smooth",
        });
      } else if (summaryContainerRef.current) {
        const summaryRect = summaryContainerRef.current.getBoundingClientRect();
        const absoluteSummaryTop = summaryRect.top + window.scrollY;
        addLog(
          `CONV_WEBRTC_EFFECT[summaryScroll][AnimEnd][Window]: Scrolling window. summaryRect.top: ${summaryRect.top}, window.scrollY: ${window.scrollY}, targetScrollTop: ${absoluteSummaryTop}`,
        );
        window.scrollTo({
          top: absoluteSummaryTop,
          behavior: "smooth",
        });
      }
    }, [addLog, mainContentAreaRef]);

    console.log(
      "CONV_WEBRTC_RENDER_DEBUG: englishConversationHistory (from Redux) state (at render):",
      JSON.stringify(englishHistory, null, 2),
    );
    console.log(
      "CONV_WEBRTC_RENDER_DEBUG: spanishConversationHistory (from Redux) state (at render):",
      JSON.stringify(spanishHistory, null, 2),
    );

    useEffect(() => {
      if (pendingToolCalls && pendingToolCalls.length > 0) {
        addLog(
          `CONV_WEBRTC_EFFECT[pendingToolCalls]: Found ${pendingToolCalls.length} pending tool call(s) to process.`,
        );
        pendingToolCalls.forEach((pendingCall: PendingToolCall) => {
          addLog(
            `CONV_WEBRTC_EFFECT[pendingToolCalls]: Dispatching submitMockToolOutputsThunk for toolCallId: ${pendingCall.toolCallId} (Action: ${pendingCall.actionText})`,
          );
          dispatch(submitMockToolOutputsThunk(pendingCall));
        });
      }
    }, [pendingToolCalls, dispatch, addLog]);

    console.log(currentSessionSummary);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <audio ref={remoteAudioPlayerRef} style={{ display: "none" }} />
          <div
            ref={internalScrollContainerRef}
            style={{ flexGrow: 1, overflowY: "auto", minHeight: "100px" }}
            className="relative bg-gray-100 p-6 space-y-6"
          >
            <TopScrollFade gradientFromColor="from-gray-100" />
            <AnimatePresence>
              <div
                key="conversation-histories"
                className="flex flex-col md:flex-row gap-6 md:gap-10 -mt-8"
              >
                <motion.div className="w-full">
                  <ConversationV2
                    conversationHistory={englishHistory}
                    displayLanguage="EN"
                  />
                </motion.div>
                <motion.div className="w-full">
                  <ConversationV2
                    conversationHistory={spanishHistory}
                    displayLanguage="ES"
                  />
                </motion.div>
              </div>
              {currentSessionSummary && (
                <motion.div
                  key="summary-in-scroll"
                  ref={summaryContainerRef}
                  initial={{ opacity: 0, y: 20, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 20, height: 0 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  style={{ overflow: "hidden" }}
                  onAnimationComplete={handleSummaryAnimationComplete}
                >
                  <ConversationSummary
                    summary={currentSessionSummary.summary_text}
                    detectedActions={currentSessionSummary.detected_actions}
                    isLoading={isFetchingSummary}
                    error={fetchSummaryError}
                  />
                </motion.div>
              )}
              {!currentSessionSummary &&
                fetchSummaryError &&
                !isFetchingSummary && (
                  <div
                    key="no-summary-message"
                    className="text-center py-4 text-gray-600 italic"
                  >
                    {fetchSummaryError.includes("No summary found")
                      ? "No conversation summary available yet."
                      : "Error loading conversation summary."}
                  </div>
                )}
            </AnimatePresence>
            <BottomScrollFade gradientFromColor="from-gray-100" />
          </div>
          <div className="flex shrink-0 flex-col items-center gap-4 px-4 pb-4 pt-5 md:flex-row md:gap-10 md:px-0 md:pb-0">
            {activeSessionId && (
              <ConversationActions
                sessionId={activeSessionId}
                isLiveSessionActive={isConnected}
                onRequestNewSession={onRequestNewSession}
                currentSessionSummary={currentSessionSummary}
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default ConversationWebrtc;
