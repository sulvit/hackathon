import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import type { SummaryData, ConversationTurn } from "../types/conversation"; // Adjust path if necessary

// Define the shape of the translation result from the API
export interface ApiTranslationResponse {
  original_transcript: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  is_repeat_request?: boolean;
  error?: string;
  original_item_id?: string;
}

// Type for action statuses
export type ActionStatus =
  | "idle"
  | "pending"
  | "invoked"
  | "completed"
  | "error";

// NEW: Payload type for pending tool calls
export interface PendingToolCall {
  toolCallId: string;
  toolName: string; // e.g., "send_lab_order"
  actionText: string; // e.g., "Order lab tests"
  toolArguments: string; // JSON string of arguments from LLM
  runId: string;
  threadId: string;
}

// Interface for formatted turn data coming from database
export interface FormattedTurnFromDB {
  id: string;
  text: string;
  timestamp: string;
  turn_type: string;
  actor: string;
  language_code?: string;
  original_item_id?: string;
}

// Type for logging function
export type PageLoggerFunction = (message: string) => void;

interface SessionState {
  currentSessionId: string | null;
  isWelcomeScreenVisible: boolean;
  isTranscribing: boolean;
  isProcessingTranslation: boolean;
  isFetchingTtsAudio: boolean;
  isEnglishTtsEnabled: boolean;
  isSpanishTtsEnabled: boolean;
  // New WebRTC and session status states
  webRtcIsLoading: boolean;
  webRtcIsConnected: boolean;
  currentSessionSummary: SummaryData | null;
  areWebRtcHandlesAvailable: boolean; // New state for WebRTC handles
  englishHistory: ConversationTurn[]; // NEW
  spanishHistory: ConversationTurn[]; // NEW
  apiTranslationResult: ApiTranslationResponse | null; // New state for API translation result
  actionInvocationStatus: Record<string, ActionStatus>; // NEW: Status for invoked actions
  actionErrorMessages: Record<string, string | null>; // NEW: Error messages for actions
  pendingToolCalls: PendingToolCall[]; // NEW: List of tool calls awaiting output submission
  toolSubmissionStatus: "idle" | "loading" | "succeeded" | "failed";
  // New state for session data fetching
  isFetchingSessionData: boolean;
  fetchSessionDataError: string | null;
  autoInitiateNewSession: boolean;
  // Add states for summary fetching
  isFetchingSummary: boolean;
  fetchSummaryError: string | null;
  pendingTtsRequest: { text: string; language: string; itemId: string } | null; // NEW: For queuing TTS requests
}

const initialState: SessionState = {
  currentSessionId: null,
  isWelcomeScreenVisible: true, // Default to showing WelcomeScreen
  isTranscribing: false,
  isProcessingTranslation: false,
  isFetchingTtsAudio: false,
  isEnglishTtsEnabled: true,
  isSpanishTtsEnabled: true,
  // Initial values for new states
  webRtcIsLoading: false,
  webRtcIsConnected: false,
  currentSessionSummary: null,
  areWebRtcHandlesAvailable: false,
  englishHistory: [], // NEW
  spanishHistory: [], // NEW
  apiTranslationResult: null, // Initialize as null
  actionInvocationStatus: {}, // NEW
  actionErrorMessages: {}, // NEW
  pendingToolCalls: [], // NEW
  toolSubmissionStatus: "idle", // Initialize thunk status
  // Initialize new session data fetching state
  isFetchingSessionData: false,
  fetchSessionDataError: null,
  autoInitiateNewSession: true,
  // Initialize summary fetching states
  isFetchingSummary: false,
  fetchSummaryError: null,
  pendingTtsRequest: null, // NEW: Initialize pendingTtsRequest
};

// Define the async thunk for fetching session data
const fetchSessionDataThunk = createAsyncThunk(
  "session/fetchSessionData",
  async (
    {
      sessionId,
      pageLogger = console.log,
    }: { sessionId: string; pageLogger?: PageLoggerFunction },
    { dispatch, rejectWithValue },
  ) => {
    pageLogger(`FETCH_THUNK: Fetching data for session ID: ${sessionId}`);

    let noTurns = true;
    let noSummary = true;

    try {
      // Fetch messages
      const messagesResponse = await fetch(
        `/api/messages?session_id=${sessionId}`,
      );
      if (messagesResponse.ok) {
        const dbTurns: FormattedTurnFromDB[] = await messagesResponse.json();
        pageLogger(
          `FETCH_THUNK: Raw dbTurns received for session ${sessionId}: ${JSON.stringify(dbTurns)}`,
        );

        if (dbTurns && dbTurns.length > 0) {
          noTurns = false;
          const englishHistory: ConversationTurn[] = [];
          const spanishHistory: ConversationTurn[] = [];

          dbTurns.forEach((turn) => {
            const currentTurnType = turn.turn_type as ConversationTurn["type"];
            const originalLangCode = turn.language_code; // Use the stored language_code

            pageLogger(
              `FETCH_THUNK: Processing turn: ID=${turn.id}, DBType=${
                turn.turn_type
              }, OriginalLang=${originalLangCode}, Text=${turn.text.substring(0, 20)}`,
            );

            const formattedTurnForState: ConversationTurn = {
              id: turn.id,
              text: turn.text,
              timestamp: new Date(turn.timestamp).getTime(),
              type: currentTurnType, // Will be adjusted below if it was user_direct_und
              original_item_id: turn.original_item_id,
            };

            if (
              currentTurnType === "user_direct_und" &&
              turn.actor === "user"
            ) {
              if (originalLangCode && originalLangCode.startsWith("es")) {
                spanishHistory.push({
                  ...formattedTurnForState,
                  type: "user_direct_es",
                });
              } else {
                englishHistory.push({
                  ...formattedTurnForState,
                  type: "user_direct_en",
                });
              }
            } else if (
              currentTurnType === "user_direct_en" ||
              currentTurnType === "user_translation_to_en" ||
              currentTurnType === "assistant_spoken_en"
            ) {
              englishHistory.push(formattedTurnForState);
            } else if (
              currentTurnType === "user_direct_es" ||
              currentTurnType === "user_translation_to_es" ||
              currentTurnType === "assistant_spoken_es"
            ) {
              spanishHistory.push(formattedTurnForState);
            } else if (currentTurnType === "error_message") {
              if (
                !englishHistory.find((t) => t.id === formattedTurnForState.id)
              )
                englishHistory.push(formattedTurnForState);
              if (
                !spanishHistory.find((t) => t.id === formattedTurnForState.id)
              )
                spanishHistory.push(formattedTurnForState);
            }
          });

          pageLogger(
            `FETCH_THUNK: Temp englishHistory before dispatch: ${JSON.stringify(englishHistory)}`,
          );
          pageLogger(
            `FETCH_THUNK: Temp spanishHistory before dispatch: ${JSON.stringify(spanishHistory)}`,
          );

          dispatch(
            setHistories({
              english: englishHistory.filter(
                (t, i, s) => i === s.findIndex((e) => e.id === t.id),
              ),
              spanish: spanishHistory.filter(
                (t, i, s) => i === s.findIndex((e) => e.id === t.id),
              ),
            }),
          );
        } else {
          dispatch(setHistories({ english: [], spanish: [] }));
        }
      } else {
        dispatch(setHistories({ english: [], spanish: [] }));
      }

      // Fetch summary
      const summaryResponse = await fetch(
        `/api/summary?session_id=${sessionId}`,
      );
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        dispatch(setCurrentSessionSummary(summaryData));
        noSummary = false;
      } else {
        dispatch(setCurrentSessionSummary(null));
      }

      // Determine UI state based on what we found
      if (noTurns && noSummary) {
        pageLogger(
          `FETCH_THUNK: Session ${sessionId} is new/empty. Dispatching showWelcome.`,
        );
        dispatch(showWelcome());
        return { autoInitiateNewSession: true };
      } else {
        pageLogger(
          `FETCH_THUNK: Data found for session ${sessionId}. Dispatching dismissWelcomeAndShowContent.`,
        );
        dispatch(dismissWelcomeAndShowContent());
        return { autoInitiateNewSession: false };
      }
    } catch (error: any) {
      console.error("Error fetching session data:", error);

      // Reset state to defaults
      dispatch(setHistories({ english: [], spanish: [] }));
      dispatch(setCurrentSessionSummary(null));
      dispatch(showWelcome());

      return rejectWithValue(error.message || "Failed to fetch session data");
    }
  },
);

// Define the async thunk for fetching session summary
const fetchSessionSummaryThunk = createAsyncThunk(
  "session/fetchSessionSummary",
  async (
    {
      sessionId,
      pageLogger = console.log,
    }: { sessionId: string; pageLogger?: PageLoggerFunction },
    { dispatch, rejectWithValue },
  ) => {
    pageLogger(
      `FETCH_SUMMARY_THUNK: Fetching summary for session ID: ${sessionId}`,
    );

    if (!sessionId) {
      dispatch(clearCurrentSessionSummary());
      return null;
    }

    try {
      const response = await fetch(`/api/summary?session_id=${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        dispatch(setCurrentSessionSummary(data));
        pageLogger(
          `FETCH_SUMMARY_THUNK: Summary fetched for session ${sessionId}`,
        );
        return data;
      } else if (response.status === 404) {
        dispatch(clearCurrentSessionSummary());
        pageLogger(
          `FETCH_SUMMARY_THUNK: No summary found for session ${sessionId}. Setting cache flag.`,
        );
        // Return a specific value to indicate a 404 was handled successfully
        return { notFound: true, sessionId };
      } else {
        const errData = await response.json();
        throw new Error(
          errData.error || `Failed to fetch summary: ${response.status}`,
        );
      }
    } catch (error: any) {
      console.error("Error fetching summary:", error);
      dispatch(clearCurrentSessionSummary());
      return rejectWithValue(
        error.message || "Failed to fetch session summary",
      );
    }
  },
);

// Define the async thunk for submitting tool outputs
const submitMockToolOutputsThunk = createAsyncThunk(
  "session/submitMockToolOutputs",
  async (pendingCall: PendingToolCall, { dispatch, rejectWithValue }) => {
    dispatch(
      setActionStatus({
        actionText: pendingCall.actionText,
        status: "pending",
      }),
    ); // Indicate submission is in progress
    try {
      const mockOutput = JSON.stringify({
        success: true,
        message: `Mock ${pendingCall.toolName} executed.`,
      });
      const toolOutputsToSubmit = [
        { tool_call_id: pendingCall.toolCallId, output: mockOutput },
      ];

      const response = await fetch("/api/submit-tool-outputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: pendingCall.threadId,
          runId: pendingCall.runId,
          toolOutputs: toolOutputsToSubmit,
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        const errorMsg =
          responseData.details ||
          responseData.error ||
          "Failed to submit tool outputs via API";
        dispatch(
          setActionError({
            actionText: pendingCall.actionText,
            error: errorMsg,
          }),
        );
        return rejectWithValue(errorMsg);
      }

      // If API call is successful, mark action as completed
      dispatch(
        setActionStatus({
          actionText: pendingCall.actionText,
          status: "completed",
        }),
      );
      return {
        toolCallId: pendingCall.toolCallId,
        actionText: pendingCall.actionText,
      }; // Return data for the fulfilled action
    } catch (error: any) {
      const errorMsg =
        error.message || "Unknown error during tool output submission";
      dispatch(
        setActionError({ actionText: pendingCall.actionText, error: errorMsg }),
      );
      return rejectWithValue(errorMsg);
    } finally {
      // Always remove the call from pending list after attempt, regardless of outcome handled by fulfilled/rejected
    }
  },
);

// Define the async thunk for generating session summary
const generateSessionSummaryThunk = createAsyncThunk(
  "session/generateSessionSummary",
  async (
    {
      sessionId,
      pageLogger = console.log,
    }: { sessionId: string; pageLogger?: PageLoggerFunction },
    { dispatch, rejectWithValue },
  ) => {
    pageLogger(
      `GENERATE_SUMMARY_THUNK: Generating summary for session ID: ${sessionId}`,
    );

    if (!sessionId) {
      return rejectWithValue("Cannot summarize: Session ID is missing.");
    }

    try {
      // 1. Call the API to generate the summary
      const response = await fetch("/api/summarize-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg =
          errorData.error || `Summarization API failed: ${response.status}`;
        throw new Error(errorMsg);
      }

      const resultData = await response.json();
      pageLogger(
        `GENERATE_SUMMARY_THUNK: Summary generation successful for session ${sessionId}`,
      );

      // 2. After successful generation, fetch the new summary from the database
      pageLogger(
        `GENERATE_SUMMARY_THUNK: Fetching newly generated summary for session ${sessionId}`,
      );
      const fetchSummaryResponse = await fetch(
        `/api/summary?session_id=${sessionId}`,
      );

      if (!fetchSummaryResponse.ok) {
        if (fetchSummaryResponse.status === 404) {
          pageLogger(
            `GENERATE_SUMMARY_THUNK: Warning - Generated summary not found in database for session ${sessionId}`,
          );
          // Still return the result from the generate API as a backup
          const summaryData = {
            session_id: sessionId,
            summary_text:
              resultData.summary ||
              resultData.conversation_summary ||
              "Summary generated.",
            detected_actions:
              resultData.actions || resultData.actions_taken || [],
            created_at: new Date().toISOString(),
          };
          dispatch(setCurrentSessionSummary(summaryData));
          return summaryData;
        } else {
          const errData = await fetchSummaryResponse.json();
          throw new Error(
            errData.error ||
              `Failed to fetch generated summary: ${fetchSummaryResponse.status}`,
          );
        }
      }

      // 3. Update the Redux store with the new summary
      const summaryData = await fetchSummaryResponse.json();
      dispatch(setCurrentSessionSummary(summaryData));
      pageLogger(
        `GENERATE_SUMMARY_THUNK: Redux store updated with new summary for session ${sessionId}`,
      );

      return summaryData;
    } catch (error: any) {
      console.error("Error generating/fetching summary:", error);
      return rejectWithValue(
        error.message || "Failed to generate session summary",
      );
    }
  },
);

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<string | null>) => {
      const newSessionId = action.payload;
      if (state.currentSessionId !== newSessionId) {
        state.currentSessionId = newSessionId;
        state.isWelcomeScreenVisible = newSessionId === null;
        state.isTranscribing = false;
        state.isProcessingTranslation = false;
        state.isFetchingTtsAudio = false;
        state.webRtcIsLoading = false;
        state.webRtcIsConnected = false;
        state.currentSessionSummary = null;
        state.englishHistory = [];
        state.spanishHistory = [];
        state.apiTranslationResult = null;
        state.actionInvocationStatus = {};
        state.actionErrorMessages = {};
        state.pendingToolCalls = [];
        state.pendingTtsRequest = null;
      } else if (newSessionId === null && state.currentSessionId === null) {
        state.isWelcomeScreenVisible = true;
        state.englishHistory = [];
        state.spanishHistory = [];
        state.apiTranslationResult = null;
        state.actionInvocationStatus = {};
        state.actionErrorMessages = {};
        state.pendingToolCalls = [];
        state.pendingTtsRequest = null;
      }
    },
    showWelcome: (state) => {
      state.isWelcomeScreenVisible = true;
      state.isTranscribing = false;
      state.isProcessingTranslation = false;
      state.isFetchingTtsAudio = false;
      state.webRtcIsLoading = false;
      state.webRtcIsConnected = false;
      state.currentSessionSummary = null;
      state.englishHistory = [];
      state.spanishHistory = [];
      state.apiTranslationResult = null;
      state.actionInvocationStatus = {};
      state.actionErrorMessages = {};
      state.pendingToolCalls = [];
      state.pendingTtsRequest = null;
    },
    dismissWelcomeAndShowContent: (state) => {
      state.isWelcomeScreenVisible = false;
    },
    transcriptionStarted: (state) => {
      state.isTranscribing = true;
    },
    transcriptionCompleted: (state) => {
      state.isTranscribing = false;
    },
    translationProcessingStarted: (state) => {
      state.isProcessingTranslation = true;
    },
    translationProcessingFinished: (state) => {
      state.isProcessingTranslation = false;
    },
    ttsAudioFetchStarted: (state) => {
      state.isFetchingTtsAudio = true;
    },
    ttsAudioFetchFinished: (state) => {
      state.isFetchingTtsAudio = false;
    },
    toggleEnglishTts: (state) => {
      state.isEnglishTtsEnabled = !state.isEnglishTtsEnabled;
    },
    toggleSpanishTts: (state) => {
      state.isSpanishTtsEnabled = !state.isSpanishTtsEnabled;
    },
    setWebRtcLoading: (state, action: PayloadAction<boolean>) => {
      state.webRtcIsLoading = action.payload;
    },
    setWebRtcConnected: (state, action: PayloadAction<boolean>) => {
      state.webRtcIsConnected = action.payload;
      if (action.payload) {
        state.webRtcIsLoading = false;
      } else {
        state.webRtcIsLoading = false;
      }
    },
    setCurrentSessionSummary: (
      state,
      action: PayloadAction<SummaryData | null>,
    ) => {
      state.currentSessionSummary = action.payload;
      const newStatuses: Record<string, ActionStatus> = {};
      const newErrorMessages: Record<string, string | null> = {};
      if (action.payload && action.payload.detected_actions) {
        action.payload.detected_actions.forEach((act) => {
          newStatuses[act] = state.actionInvocationStatus[act] || "idle";
          if (
            state.actionInvocationStatus[act] === "error" &&
            state.actionErrorMessages[act]
          ) {
            newErrorMessages[act] = state.actionErrorMessages[act];
          }
        });
      }
      state.actionInvocationStatus = newStatuses;
      state.actionErrorMessages = newErrorMessages;
    },
    clearCurrentSessionSummary: (state) => {
      state.currentSessionSummary = null;
      state.actionInvocationStatus = {};
      state.actionErrorMessages = {};
    },
    setAreWebRtcHandlesAvailable: (state, action: PayloadAction<boolean>) => {
      state.areWebRtcHandlesAvailable = action.payload;
    },
    setHistories: (
      state,
      action: PayloadAction<{
        english: ConversationTurn[];
        spanish: ConversationTurn[];
      }>,
    ) => {
      state.englishHistory = action.payload.english;
      state.spanishHistory = action.payload.spanish;
    },
    addEnglishTurn: (state, action: PayloadAction<ConversationTurn>) => {
      state.englishHistory.push(action.payload);
    },
    addSpanishTurn: (state, action: PayloadAction<ConversationTurn>) => {
      state.spanishHistory.push(action.payload);
    },
    clearHistories: (state) => {
      state.englishHistory = [];
      state.spanishHistory = [];
    },
    setApiTranslationResult: (
      state,
      action: PayloadAction<ApiTranslationResponse | null>,
    ) => {
      state.apiTranslationResult = action.payload;
    },
    clearApiTranslationResult: (state) => {
      state.apiTranslationResult = null;
    },
    setActionStatus: (
      state,
      action: PayloadAction<{ actionText: string; status: ActionStatus }>,
    ) => {
      state.actionInvocationStatus[action.payload.actionText] =
        action.payload.status;
      if (action.payload.status !== "error") {
        state.actionErrorMessages[action.payload.actionText] = null;
      }
    },
    setActionError: (
      state,
      action: PayloadAction<{ actionText: string; error: string }>,
    ) => {
      state.actionInvocationStatus[action.payload.actionText] = "error";
      state.actionErrorMessages[action.payload.actionText] =
        action.payload.error;
    },
    resetActionStatus: (
      state,
      action: PayloadAction<{ actionText: string }>,
    ) => {
      state.actionInvocationStatus[action.payload.actionText] = "idle";
      state.actionErrorMessages[action.payload.actionText] = null;
    },
    addPendingToolCall: (state, action: PayloadAction<PendingToolCall>) => {
      if (
        !state.pendingToolCalls.find(
          (call) => call.toolCallId === action.payload.toolCallId,
        )
      ) {
        state.pendingToolCalls.push(action.payload);
      }
    },
    removePendingToolCall: (
      state,
      action: PayloadAction<{ toolCallId: string }>,
    ) => {
      state.pendingToolCalls = state.pendingToolCalls.filter(
        (call) => call.toolCallId !== action.payload.toolCallId,
      );
    },
    clearPendingToolCalls: (state) => {
      state.pendingToolCalls = [];
    },
    setAutoInitiateNewSession: (state, action: PayloadAction<boolean>) => {
      state.autoInitiateNewSession = action.payload;
    },
    setPendingTtsRequest: (
      state,
      action: PayloadAction<{
        text: string;
        language: string;
        itemId: string;
      } | null>,
    ) => {
      state.pendingTtsRequest = action.payload;
    },
    clearPendingTtsRequest: (state) => {
      state.pendingTtsRequest = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitMockToolOutputsThunk.pending, (state) => {
        state.toolSubmissionStatus = "loading";
      })
      .addCase(submitMockToolOutputsThunk.fulfilled, (state, action) => {
        state.toolSubmissionStatus = "succeeded";
        state.pendingToolCalls = state.pendingToolCalls.filter(
          (call) => call.toolCallId !== action.payload.toolCallId,
        );
      })
      .addCase(submitMockToolOutputsThunk.rejected, (state, action) => {
        state.toolSubmissionStatus = "failed";
        if (action.meta?.arg?.toolCallId) {
          state.pendingToolCalls = state.pendingToolCalls.filter(
            (call) => call.toolCallId !== action.meta.arg.toolCallId,
          );
        }
      })
      .addCase(fetchSessionDataThunk.pending, (state) => {
        state.isFetchingSessionData = true;
        state.fetchSessionDataError = null;
      })
      .addCase(fetchSessionDataThunk.fulfilled, (state, action) => {
        state.isFetchingSessionData = false;
        state.fetchSessionDataError = null;
        state.autoInitiateNewSession = action.payload.autoInitiateNewSession;
      })
      .addCase(fetchSessionDataThunk.rejected, (state, action) => {
        state.isFetchingSessionData = false;
        state.fetchSessionDataError =
          (action.payload as string) || "Failed to fetch session data";
        state.autoInitiateNewSession = true;
      })
      .addCase(fetchSessionSummaryThunk.pending, (state) => {
        state.isFetchingSummary = true;
        state.fetchSummaryError = null;
      })
      .addCase(fetchSessionSummaryThunk.fulfilled, (state, action) => {
        state.isFetchingSummary = false;
        state.fetchSummaryError = null;
        if (action.payload && "notFound" in action.payload) {
          state.fetchSummaryError = `No summary found for session ${action.payload.sessionId}`;
        }
      })
      .addCase(fetchSessionSummaryThunk.rejected, (state, action) => {
        state.isFetchingSummary = false;
        state.fetchSummaryError =
          (action.payload as string) || "Failed to fetch session summary";
      })
      .addCase(generateSessionSummaryThunk.pending, (state) => {
        state.isFetchingSummary = true;
        state.fetchSummaryError = null;
      })
      .addCase(generateSessionSummaryThunk.fulfilled, (state, action) => {
        state.isFetchingSummary = false;
        state.fetchSummaryError = null;
        state.currentSessionSummary = action.payload;
      })
      .addCase(generateSessionSummaryThunk.rejected, (state, action) => {
        state.isFetchingSummary = false;
        state.fetchSummaryError =
          (action.payload as string) || "Failed to generate session summary";
      });
  },
});

export const {
  setSession,
  showWelcome,
  dismissWelcomeAndShowContent,
  transcriptionStarted,
  transcriptionCompleted,
  translationProcessingStarted,
  translationProcessingFinished,
  ttsAudioFetchStarted,
  ttsAudioFetchFinished,
  toggleEnglishTts,
  toggleSpanishTts,
  setWebRtcLoading,
  setWebRtcConnected,
  setCurrentSessionSummary,
  clearCurrentSessionSummary,
  setAreWebRtcHandlesAvailable,
  setHistories,
  addEnglishTurn,
  addSpanishTurn,
  clearHistories,
  setApiTranslationResult,
  clearApiTranslationResult,
  setActionStatus,
  setActionError,
  resetActionStatus,
  addPendingToolCall,
  removePendingToolCall,
  clearPendingToolCalls,
  setAutoInitiateNewSession,
  setPendingTtsRequest,
  clearPendingTtsRequest,
} = sessionSlice.actions;

export {
  fetchSessionDataThunk,
  fetchSessionSummaryThunk,
  submitMockToolOutputsThunk,
  generateSessionSummaryThunk,
};

export default sessionSlice.reducer;
