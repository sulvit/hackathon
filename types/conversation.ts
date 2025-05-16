// File: types/conversation.ts

import type { AppDispatch } from "../store/store";
import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";

export type AiStateType =
  | "idle"
  | "listening"
  | "processing_transcript"
  | "transcribed"
  | "speaking_tts";

export interface ConversationTurn {
  id: string;
  text: string;
  type:
    | "user_direct_en"
    | "user_translation_to_en"
    | "user_direct_es"
    | "user_translation_to_es"
    | "assistant_spoken_en"
    | "assistant_spoken_es"
    | "user_direct_und" // For turns where language is initially unknown
    // Consider if "assistant_direct_und" is also possible/needed
    | "error_message";
  timestamp: number;
  original_item_id?: string | null;
}

export interface SummaryData {
  session_id: string;
  summary_text: string;
  detected_actions: string[];
  created_at: string;
}

// Context types that were in ConversationWebrtc.tsx can also move here if they are shared more broadly
// For now, keeping them in ConversationWebrtc.tsx as they are specific to its internal workings with event handlers.
// However, if other components start needing these exact context shapes, this is a good place for them.

// Example of a more specific type that might be useful for the database interaction part in page.tsx
// when mapping from formatted_conversation_turns table rows.
export interface FormattedTurnFromDB {
  id: string;
  session_id: string;
  text: string;
  turn_type: string; // This is the string from the DB, which we map to ConversationTurn["type"]
  timestamp: string; // ISO string from DB
  language_code: string;
  actor: "user" | "assistant" | "system";
  original_item_id?: string | null;
}

// Forward declare ConversationWebrtcProps to avoid circular dependency if it were complex
// For now, we know translationResult is simple enough or we can use a more generic type for it here.
interface MinimalConversationWebrtcProps {
  translationResult?: {
    original_transcript: string;
    translated_text: string;
    source_language: string;
    target_language: string;
    is_repeat_request?: boolean;
    error?: string;
    original_item_id?: string;
  } | null;
}

export interface OpenAiEventContext {
  addLog: (message: string) => void;
  setCurrentAiState: (state: AiStateType) => void;
  setDirectTranscript: (transcript: string) => void;
  directTranscript: string;
  currentTranscriptionItemIdRef: React.MutableRefObject<string | null>;
  onFinalTranscriptForTranslation?: (
    transcript: string,
    language: string,
    itemId: string,
  ) => void;
  setIsApiReadyForResponse: (isReady: boolean) => void;
  currentAiState: AiStateType;
  sessionId: string | null;
  dispatch: AppDispatch;
  lastSuccessfullySpokenLangRef: React.MutableRefObject<string | null>;
  currentEnglishHistory: ConversationTurn[];
  currentSpanishHistory: ConversationTurn[];
}

export interface TranslationEffectContext {
  addLog: (message: string) => void;
  initiateTtsForText?: (
    textToSpeak: string,
    language: string,
    relatedUserItemId?: string,
  ) => void;
  lastSuccessfullySpokenText: string | null;
  lastSuccessfullySpokenLang: string | null;
  ttsInitiatedForItem: string | null;
  setTtsInitiatedForItem: React.Dispatch<React.SetStateAction<string | null>>;
  isApiReadyForResponse: boolean;
  setIsApiReadyForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  currentAiState: AiStateType;
  setCurrentAiState: React.Dispatch<React.SetStateAction<AiStateType>>;
  processedRepeatRequestsRef: React.MutableRefObject<Record<string, boolean>>;
  processedErrorItemsRef: React.MutableRefObject<Record<string, boolean>>;
  translationResult: MinimalConversationWebrtcProps["translationResult"];
  isConnected: boolean;
  sessionId: string | null;
  dispatch: AppDispatch;
  isEnglishTtsEnabled: boolean;
  isSpanishTtsEnabled: boolean;
  setPendingTtsRequest: ActionCreatorWithPayload<{
    text: string;
    language: string;
    itemId: string;
  } | null>;
}
