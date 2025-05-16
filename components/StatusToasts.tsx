"use client";

import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import type { RootState } from "../store/store";

export default function StatusIndicators() {
  const { isTranscribing, isProcessingTranslation, isFetchingTtsAudio } =
    useSelector((state: RootState) => state.session);

  const transcribingToastIdRef = useRef<string | number | null>(null);
  const translationToastIdRef = useRef<string | number | null>(null);
  const ttsToastIdRef = useRef<string | number | null>(null);

  // Effect for Transcribing Status Toasts
  useEffect(() => {
    if (isTranscribing) {
      if (!transcribingToastIdRef.current) {
        const id = toast.loading("Listening...");
        transcribingToastIdRef.current = id;
      }
    } else {
      if (transcribingToastIdRef.current) {
        toast.dismiss(transcribingToastIdRef.current);
        transcribingToastIdRef.current = null;
      }
    }
    return () => {
      if (transcribingToastIdRef.current) {
        toast.dismiss(transcribingToastIdRef.current);
        transcribingToastIdRef.current = null;
      }
    };
  }, [isTranscribing]);

  // Effect for Translation Status Toasts
  useEffect(() => {
    if (isProcessingTranslation) {
      if (!translationToastIdRef.current) {
        // Only show toast if not already active for this status
        const id = toast.loading("Translating transcript...");
        translationToastIdRef.current = id;
      }
    } else {
      if (translationToastIdRef.current) {
        toast.dismiss(translationToastIdRef.current);
        translationToastIdRef.current = null;
        // Note: Success/error for translation will be handled where the process finishes (e.g., page.tsx)
        // For example, after successful translation, page.tsx could call toast.success("Translation complete!")
      }
    }
    // Cleanup on unmount if a toast is still active
    return () => {
      if (translationToastIdRef.current) {
        toast.dismiss(translationToastIdRef.current);
        translationToastIdRef.current = null;
      }
    };
  }, [isProcessingTranslation]);

  // Effect for TTS Audio Fetch Status Toasts
  useEffect(() => {
    if (isFetchingTtsAudio) {
      if (!ttsToastIdRef.current) {
        const id = toast.loading("Generating audio...");
        ttsToastIdRef.current = id;
      }
    } else {
      if (ttsToastIdRef.current) {
        toast.dismiss(ttsToastIdRef.current);
        ttsToastIdRef.current = null;
        // Note: Success/error for TTS will be handled where the process finishes (e.g., ConversationWebrtc or webrtcEventHandlers)
      }
    }
    // Cleanup on unmount
    return () => {
      if (ttsToastIdRef.current) {
        toast.dismiss(ttsToastIdRef.current);
        ttsToastIdRef.current = null;
      }
    };
  }, [isFetchingTtsAudio]);

  return null;
}
