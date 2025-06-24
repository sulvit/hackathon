// components/webrtcEventHandlers.ts
import { toast } from "sonner"; // Import toast
import {
  // Import Redux actions for history
  addEnglishTurn, // Ensure this is imported
  addPendingToolCall,
  addSpanishTurn,
  setActionStatus,
  transcriptionCompleted,
  transcriptionStarted,
  ttsAudioFetchFinished,
} from "../store/sessionSlice"; // Import actions
import { store } from "../store/store"; // Import the store to dispatch
import type {
  // Use 'import type' for types
  ConversationTurn,
  OpenAiEventContext,
  TranslationEffectContext, // Import the new context type
} from "../types/conversation"; // Assuming ConversationWebrtc.tsx is in the same directory or adjust path

// Interface for the payload to POST to /api/messages
interface NewFormattedTurnPayload {
  id: string;
  session_id: string;
  text: string;
  turn_type: string; // e.g., user_direct_en, assistant_spoken_es
  timestamp: string; // ISO string
  language_code: string; // e.g., "en", "es", "und"
  actor: "user" | "assistant" | "system";
  original_item_id?: string | null;
}

const saveTurnToDb = async (
  turnData: NewFormattedTurnPayload,
  addLog?: (message: string) => void,
) => {
  console.log(
    `SAVE_TURN_TO_DB_ENTERED: turn_type=${turnData.turn_type}, id=${turnData.id}`,
  );
  if (!turnData.session_id) {
    if (addLog)
      addLog("DB_SAVE_ERROR: session_id is missing. Cannot save turn.");
    console.error("DB_SAVE_ERROR: session_id is missing", turnData);
    return;
  }
  try {
    if (addLog)
      addLog(`DB_SAVE: Attempting to save turn: ${JSON.stringify(turnData)}`);
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(turnData),
    });
    if (!response.ok) {
      const errorResult = await response.json();
      const errorMessage = `DB_SAVE_ERROR: Failed to save turn. Status: ${response.status}. Message: ${
        errorResult.error || "Unknown error"
      }`;
      if (addLog) addLog(errorMessage);
      console.error(errorMessage, errorResult);
    }
  } catch (error: any) {
    const errorMessage = `DB_SAVE_ERROR: Exception while saving turn: ${error.message}`;
    if (addLog) addLog(errorMessage);
    console.error(errorMessage, error);
  }
};

// Updated mapping based on provided tool configurations
const TOOL_NAME_TO_ACTION_TEXT_MAP: Record<string, string> = {
  send_lab_order: "Order lab tests",
  schedule_followup_appointment: "Schedule a follow-up appointment",
  // Add other mappings here if you have more tools
};

export const handleOpenAiMessage = (
  eventData: string,
  context: OpenAiEventContext,
): void => {
  const {
    addLog,
    setCurrentAiState,
    setIsApiReadyForResponse,
    currentAiState, // This is the value of currentAiState when the handler for *this specific message* was invoked
    dispatch,
    // Destructure other needed setters/refs from context as used
    setDirectTranscript,
    currentTranscriptionItemIdRef,
    onFinalTranscriptForTranslation,
    sessionId,
    lastSuccessfullySpokenLangRef, // Destructure the new ref
    currentEnglishHistory,
    currentSpanishHistory,
    directTranscript, // Destructure the current transcript value
  } = context;

  const message = eventData;
  const logSnippet =
    message.length > 150 ? message.substring(0, 150) + "..." : message;
  addLog(`EVENT FROM OPENAI: ${logSnippet}`);

  try {
    const parsedEvent = JSON.parse(message);

    if (
      (parsedEvent.object === "thread.run" ||
        parsedEvent.object === "thread.run.step") && // run steps can also indicate tool calls
      parsedEvent.status === "requires_action" &&
      parsedEvent.required_action?.type === "submit_tool_outputs" &&
      parsedEvent.required_action?.submit_tool_outputs?.tool_calls
    ) {
      addLog(
        `ASSISTANT_EVENT: Run requires action (tool calls pending). Event ID: ${parsedEvent.id}, Object: ${parsedEvent.object}`,
      );
      const toolCalls =
        parsedEvent.required_action.submit_tool_outputs.tool_calls;

      const runIdForSubmission =
        parsedEvent.object === "thread.run"
          ? parsedEvent.id
          : parsedEvent.run_id;
      const threadIdForSubmission = parsedEvent.thread_id;

      if (!runIdForSubmission || !threadIdForSubmission) {
        addLog(
          "ERROR: Cannot process tool calls. Missing run_id or thread_id in the event data.",
        );
        // Optionally dispatch a general error or specific errors for previously 'invoked' actions if possible
        return;
      }

      if (Array.isArray(toolCalls)) {
        for (const call of toolCalls) {
          if (call.type === "function" && call.function?.name) {
            const toolName = call.function.name;
            const toolCallId = call.id;
            const toolArguments = call.function.arguments; // This is a JSON string
            const actionText = TOOL_NAME_TO_ACTION_TEXT_MAP[toolName];

            if (actionText) {
              addLog(
                `LLM TOOL CALL DETECTED: Tool: '${toolName}', ID: ${toolCallId}, Action: '${actionText}', Args: ${toolArguments}`,
              );
              // Dispatch that the tool was invoked by the LLM
              dispatch(setActionStatus({ actionText, status: "invoked" }));

              // Dispatch action to add this to pending tool calls for later submission
              dispatch(
                addPendingToolCall({
                  toolCallId,
                  toolName,
                  actionText,
                  toolArguments, // Pass the arguments string
                  runId: runIdForSubmission,
                  threadId: threadIdForSubmission,
                }),
              );
              addLog(
                `Added to pending tool calls: ${toolName} (ID: ${toolCallId})`,
              );
            } else {
              addLog(
                `LLM TOOL CALL: Tool: '${toolName}', ID: ${toolCallId}, but no mapping to actionText. Args: ${toolArguments}.`,
              );
              // Decide if you still want to add unmapped tools to pendingToolCalls for generic submission
              // For now, we only add mapped ones.
            }
          } else {
            addLog(
              `LLM TOOL CALL item type mismatch or missing function name: ${JSON.stringify(call)}.`,
            );
          }
        }
      }
      // The actual submission of tool outputs will be handled by an effect in ConversationWebrtc.tsx
      // listening to state.session.pendingToolCalls
    } else if (parsedEvent.type === "input_audio_buffer.speech_started") {
      dispatch(transcriptionStarted());
      setCurrentAiState("listening");
      setDirectTranscript("Listening...");
      currentTranscriptionItemIdRef.current = parsedEvent.item_id;
    } else if (
      parsedEvent.type === "conversation.item.input_audio_transcription.delta"
    ) {
      const deltaText = parsedEvent.delta;
      if (deltaText && currentAiState === "listening") {
        const newTranscript =
          directTranscript === "Listening..." || directTranscript === ""
            ? deltaText
            : directTranscript + deltaText;
        setDirectTranscript(newTranscript);
      }
    } else if (
      parsedEvent.type ===
      "conversation.item.input_audio_transcription.completed"
    ) {
      dispatch(transcriptionCompleted());
      const finalTranscript = parsedEvent.transcript;
      const lang =
        parsedEvent.item?.content?.[0]?.language_code ||
        parsedEvent.language_code ||
        parsedEvent.language;
      const itemId = parsedEvent.item_id;
      if (finalTranscript && itemId === currentTranscriptionItemIdRef.current) {
        addLog(
          `FINAL USER Transcript (${lang || "unknown"}) for item ${itemId}: ${finalTranscript}`,
        );
        setDirectTranscript(finalTranscript);
        const finalLang = lang || "und";
        setCurrentAiState("transcribed");
        const now = Date.now();
        const turnId = `user_input_${itemId}_${now}_${Math.random()}`;

        // Determine base turn type from finalLang, but don't assign to specific language yet if 'und'
        const baseTurnType = finalLang.startsWith("en")
          ? "user_direct_en"
          : finalLang.startsWith("es")
            ? "user_direct_es"
            : "user_direct_und"; // Keep as 'und' for now

        const actor = "user";
        const newTurn: ConversationTurn = {
          id: turnId,
          text: finalTranscript,
          type: baseTurnType as ConversationTurn["type"],
          timestamp: now,
          original_item_id: itemId,
        };

        // Save the original detected language to DB, even if 'und'
        if (sessionId) {
          saveTurnToDb(
            {
              id: newTurn.id, // Use newTurn.id which is unique
              session_id: sessionId,
              text: newTurn.text,
              turn_type: newTurn.type, // This will be user_direct_und if finalLang is "und"
              timestamp: new Date(newTurn.timestamp).toISOString(),
              language_code: finalLang, // Save the originally detected language
              actor: actor,
              original_item_id: newTurn.original_item_id,
            },
            addLog,
          );
        }

        // If 'und', we wait for translation result to determine final language and add it then.
        if (finalLang.startsWith("en")) {
          const lastTurn =
            currentEnglishHistory[currentEnglishHistory.length - 1];
          if (
            lastTurn &&
            lastTurn.text === newTurn.text &&
            newTurn.timestamp - lastTurn.timestamp < 1500
          ) {
            addLog(
              `[DEDUPLICATION] Suppressed duplicate live English transcript for item ${itemId}: "${newTurn.text.substring(
                0,
                30,
              )}..."`,
            );
            // If suppressed, do not send for translation either, as it implies a pure duplicate utterance
          } else {
            dispatch(addEnglishTurn(newTurn));
            if (onFinalTranscriptForTranslation)
              onFinalTranscriptForTranslation(
                finalTranscript,
                finalLang,
                itemId,
              );
          }
        } else if (finalLang.startsWith("es")) {
          const lastTurn =
            currentSpanishHistory[currentSpanishHistory.length - 1];
          if (
            lastTurn &&
            lastTurn.text === newTurn.text &&
            newTurn.timestamp - lastTurn.timestamp < 1500
          ) {
            addLog(
              `[DEDUPLICATION] Suppressed duplicate live Spanish transcript for item ${itemId}: "${newTurn.text.substring(
                0,
                30,
              )}..."`,
            );
            // If suppressed, do not send for translation either
          } else {
            dispatch(addSpanishTurn(newTurn));
            if (onFinalTranscriptForTranslation)
              onFinalTranscriptForTranslation(
                finalTranscript,
                finalLang,
                itemId,
              );
          }
        } else if (finalLang === "und") {
          addLog(
            `Transcript language is 'und'. Sending for translation to determine final language. Item: ${itemId}`,
          );
          // ALWAYS send 'und' for translation, as the translation service might determine its actual language.
          if (onFinalTranscriptForTranslation)
            onFinalTranscriptForTranslation(finalTranscript, finalLang, itemId);
        }
      }
    } else if (
      parsedEvent.type === "conversation.item.input_audio_transcription.failed"
    ) {
      dispatch(transcriptionCompleted());
      const errorReason = parsedEvent.reason || "Unknown reason";
      const errorText = `Audio transcription failed: ${errorReason}`;
      addLog(
        `TRANSCRIPTION_FAILED: ${errorText} (Item ID: ${parsedEvent.item_id})`,
      );
      toast.error(errorText);
      setCurrentAiState("listening");
      setDirectTranscript(""); // Clear any partial/stale transcript
    } else if (parsedEvent.type === "response.created") {
      addLog(
        `Response created for item ${parsedEvent.response?.item_id || "unknown"}, current AI state: ${currentAiState}`,
      );
      // If currentAiState indicates we were initiating TTS, this confirms the API is busy.
      // ttsAudioFetchStarted was already dispatched when the request was made.
      if (currentAiState === "speaking_tts") setIsApiReadyForResponse(false);
    } else if (parsedEvent.type === "response.audio_transcript.done") {
      addLog(`AI speech transcript (for TTS): ${parsedEvent.transcript}`);
      // Potentially save this transcript if it's guaranteed to be the final one and distinct from response.text.done
      // For now, we prioritize response.text.done as it often directly reflects TTS input instructions.
    } else if (parsedEvent.type === "response.text.done") {
      const aiText = parsedEvent.response?.output?.[0]?.text;
      addLog(`AI text part of response (for TTS): ${aiText}`);
      if (aiText && sessionId && lastSuccessfullySpokenLangRef?.current) {
        const lang = lastSuccessfullySpokenLangRef.current;
        const now = Date.now();
        const itemId =
          parsedEvent.response?.item_id ||
          parsedEvent.response?.id ||
          `ai_resp_${now}`;
        const turnId = `asst_spoken_${itemId}_${now}_${Math.random()}`;
        const turnType = lang.startsWith("en")
          ? "assistant_spoken_en"
          : lang.startsWith("es")
            ? "assistant_spoken_es"
            : `assistant_spoken_${lang}`;
        const newAiTurn: ConversationTurn = {
          id: turnId,
          text: aiText,
          type: turnType as ConversationTurn["type"],
          timestamp: now,
          original_item_id: itemId, // Or relate it to the user's turn if possible/needed
        };
        saveTurnToDb(
          {
            id: newAiTurn.id,
            session_id: sessionId,
            text: newAiTurn.text,
            turn_type: newAiTurn.type,
            timestamp: new Date(newAiTurn.timestamp).toISOString(),
            language_code: lang,
            actor: "assistant",
            original_item_id: newAiTurn.original_item_id,
          },
          addLog,
        );
        if (lang.startsWith("en")) {
          dispatch(addEnglishTurn(newAiTurn));
        } else if (lang.startsWith("es")) {
          dispatch(addSpanishTurn(newAiTurn));
        } else {
          dispatch(addEnglishTurn(newAiTurn)); // Fallback for other AI languages
        }
      }
    } else if (parsedEvent.type === "response.done") {
      addLog(
        `Response cycle for ${parsedEvent.response?.id} (item: ${
          parsedEvent.response?.item_id || "N/A"
        }) fully done (status: ${parsedEvent.response?.status}).`,
      );
      setIsApiReadyForResponse(true);
      const liveIsFetchingTtsAudio =
        store.getState().session.isFetchingTtsAudio;
      if (liveIsFetchingTtsAudio) {
        dispatch(ttsAudioFetchFinished());
        addLog(
          "Dispatched ttsAudioFetchFinished due to response.done (Redux.isFetchingTtsAudio was true).",
        );
      }
      if (parsedEvent.response?.status === "failed") {
        addLog(
          `Response failed: ${JSON.stringify(parsedEvent.response?.status_details)}`,
        );
        // Ensure state transitions correctly even on failure
        if (currentAiState !== "idle") setCurrentAiState("listening");
      } else {
        if (
          currentAiState === "speaking_tts" ||
          currentAiState === "transcribed"
        ) {
          setCurrentAiState("listening");
        }
      }
    } else if (parsedEvent.type === "output_audio_buffer.stopped") {
      addLog(
        `TTS Audio finished (output_audio_buffer.stopped for response: ${parsedEvent.response_id})`,
      );
      const liveIsFetchingTtsAudio =
        store.getState().session.isFetchingTtsAudio;
      if (liveIsFetchingTtsAudio) {
        dispatch(ttsAudioFetchFinished());
        setCurrentAiState("listening");
        addLog(
          "Dispatched ttsAudioFetchFinished and set AI state to listening (from output_audio_buffer.stopped).",
        );
      } else {
        // If Redux state says we are not fetching, but currentAiState (stale) might be speaking_tts
        if (currentAiState === "speaking_tts") {
          setCurrentAiState("listening");
          addLog(
            "Set AI state to listening (was speaking_tts) from output_audio_buffer.stopped, though Redux.isFetchingTtsAudio was false.",
          );
        }
        addLog(
          "output_audio_buffer.stopped received, but Redux.isFetchingTtsAudio was already false. No dispatch of ttsAudioFetchFinished.",
        );
      }
    } else if (parsedEvent.type === "error") {
      dispatch(transcriptionCompleted());
      if (currentAiState === "speaking_tts") {
        dispatch(ttsAudioFetchFinished());
        addLog(
          "TTS_DEBUG: Dispatched ttsAudioFetchFinished from OpenAI error event. Current isFetchingTtsAudio: " +
            store.getState().session.isFetchingTtsAudio,
        );
      }
      const errorText = `OpenAI API Error: ${parsedEvent.error?.message || parsedEvent.error?.code || "Unknown error"}`;
      addLog(
        `OpenAI Error Event: Type: ${parsedEvent.error?.type}, Code: ${parsedEvent.error?.code}, Message: ${parsedEvent.error?.message}`,
      );
      toast.error(errorText); // Display as toast

      setCurrentAiState("listening");
      setIsApiReadyForResponse(true);
    } else if (
      parsedEvent.type &&
      !parsedEvent.type.startsWith("input_audio_buffer") &&
      !parsedEvent.type.startsWith(
        "conversation.item.input_audio_transcription",
      ) &&
      !parsedEvent.type.startsWith("response.") &&
      parsedEvent.type !== "session.created" &&
      parsedEvent.type !== "session.updated" &&
      parsedEvent.type !== "rate_limits.updated" &&
      parsedEvent.type !== "conversation.item.created"
    ) {
      addLog(`LOGGED UNEXPECTED Event Type: ${parsedEvent.type}`);
    }
  } catch (e: any) {
    dispatch(transcriptionCompleted());
    if (context.currentAiState === "speaking_tts") {
      // Access via context as currentAiState might be stale in catch
      context.dispatch(ttsAudioFetchFinished());
      context.addLog(
        "TTS_DEBUG: Dispatched ttsAudioFetchFinished from OpenAI event parsing error. Current isFetchingTtsAudio: " +
          store.getState().session.isFetchingTtsAudio,
      );
    }
    const parseErrorMsg = "Error parsing OpenAI event: " + (e.message || e);
    addLog(parseErrorMsg);
    toast.error(parseErrorMsg); // Display parsing error as toast
  }
};

export const handleTranslationResult = (
  context: TranslationEffectContext,
): void => {
  const {
    addLog,
    setCurrentAiState,
    lastSuccessfullySpokenText,
    lastSuccessfullySpokenLang,
    ttsInitiatedForItem,
    setTtsInitiatedForItem,
    isApiReadyForResponse,
    currentAiState,
    processedRepeatRequestsRef,
    translationResult,
    isConnected,
    sessionId,
    isEnglishTtsEnabled,
    isSpanishTtsEnabled,
    dispatch,
    setPendingTtsRequest,
  } = context;

  if (!translationResult) {
    // Should not happen if called from the useEffect correctly, but good for type safety
    addLog("TR_EFFECT_HANDLER: translationResult is null, exiting.");
    return;
  }

  // Guard against processing stale repeat requests when not connected
  if (!isConnected && translationResult.is_repeat_request) {
    addLog(
      `TR_EFFECT_HANDLER: Stale repeat request for item ${translationResult.original_item_id} received while not connected. Skipping.`,
    );
    // Potentially add an error message to UI if needed, but for now, just preventing the "Nothing to repeat" error.
    return;
  }

  addLog(
    `TR_EFFECT_HANDLER: translationResult received: ${JSON.stringify(translationResult)}`,
  );

  let ttsText: string | null = null;
  let ttsLang: string | null = null;
  let localIsRepeatRequest = false;
  const originalUserUtteranceItemId = translationResult.original_item_id;

  if (translationResult.error) {
    // Errors from translationResult.error are now expected to be toasted by page.tsx
    // So, here we just log it and ensure state transitions, but don't add to history/DB or re-toast.
    addLog(
      `TR_EFFECT_HANDLER: Received error from translation prop: ${translationResult.error} (Toast expected from page.tsx)`,
    );
    const isAutoDetectError = translationResult.error.includes(
      "Failed to auto-detect language",
    );
    if (isAutoDetectError) {
      addLog(
        `TR_EFFECT_HANDLER: Auto-detect language error for '${originalUserUtteranceItemId}', not saving to DB. Error: ${translationResult.error}`,
      );
    }

    if (currentAiState !== "idle") setCurrentAiState("listening");
    return;
  }

  if (
    translationResult.source_language &&
    translationResult.original_transcript &&
    translationResult.translated_text &&
    translationResult.target_language
  ) {
    const {
      original_transcript,
      translated_text,
      source_language,
      target_language,
      is_repeat_request,
    } = translationResult;
    localIsRepeatRequest = is_repeat_request || false;

    addLog(
      `TR_EFFECT_HANDLER: Success. Source: ${source_language}, Target: ${target_language}, Repeat: ${localIsRepeatRequest}, Item: ${originalUserUtteranceItemId}`,
    );

    if (localIsRepeatRequest) {
      if (lastSuccessfullySpokenText && lastSuccessfullySpokenLang) {
        addLog(
          `TR_EFFECT_HANDLER: Repeat. Will speak: "${lastSuccessfullySpokenText}" (${lastSuccessfullySpokenLang})`,
        );
        ttsText = lastSuccessfullySpokenText;
        ttsLang = lastSuccessfullySpokenLang;
      } else {
        const errorMsg = "[System: Nothing to repeat]";
        addLog(
          "TR_EFFECT_HANDLER: Repeat requested, but no last spoken text cached.",
        );
        toast.error(errorMsg); // Display as toast
      }
    } else {
      // Not a repeat request - this is where we save the translated user input
      let translatedTurnForDb: NewFormattedTurnPayload | null = null;
      const now = Date.now();
      let newTurnForReduxState: ConversationTurn | null = null;

      if (source_language.startsWith("en")) {
        addLog(
          `TR_EFFECT_HANDLER: Processing translation from EN. Original item ID: ${originalUserUtteranceItemId}`,
        );
        const spanishTurnId = `es_trans_h_${originalUserUtteranceItemId}_${now}_${Math.random()}`;

        const localNewTurn: ConversationTurn = {
          id: spanishTurnId,
          text: translated_text,
          type: "user_translation_to_es",
          timestamp: now,
          original_item_id: originalUserUtteranceItemId,
        };
        newTurnForReduxState = localNewTurn;

        addLog(
          `TR_EFFECT_HANDLER: Constructed newTurn (EN->ES): ${JSON.stringify(localNewTurn)}`,
        );
        translatedTurnForDb = {
          id: localNewTurn.id,
          session_id: sessionId!,
          text: localNewTurn.text,
          turn_type: localNewTurn.type,
          timestamp: new Date(localNewTurn.timestamp).toISOString(),
          language_code: target_language,
          actor: "user",
          original_item_id: localNewTurn.original_item_id,
        };
        addLog(
          `TR_EFFECT_HANDLER: For translation (EN->ES), using sessionId: ${sessionId} to create translatedTurnForDb`,
        );
        addLog(
          `TR_EFFECT_HANDLER: Assigned translatedTurnForDb (EN->ES): ${JSON.stringify(translatedTurnForDb)}`,
        );

        if (newTurnForReduxState) {
          addLog(
            `TR_EFFECT_HANDLER: Dispatching addSpanishTurn with: ${JSON.stringify(newTurnForReduxState)}`,
          );
          dispatch(addSpanishTurn(newTurnForReduxState));
          addLog(`TR_EFFECT_HANDLER: Dispatched addSpanishTurn.`);
        }

        ttsText = translated_text;
        ttsLang = "es";
      } else if (source_language.startsWith("es")) {
        addLog(
          `TR_EFFECT_HANDLER: Processing translation from ES. Original item ID: ${originalUserUtteranceItemId}`,
        );
        const englishTurnId = `en_trans_h_${originalUserUtteranceItemId}_${now}_${Math.random()}`;

        const localNewTurn: ConversationTurn = {
          id: englishTurnId,
          text: translated_text,
          type: "user_translation_to_en",
          timestamp: now,
          original_item_id: originalUserUtteranceItemId,
        };
        newTurnForReduxState = localNewTurn;

        addLog(
          `TR_EFFECT_HANDLER: Constructed newTurn (ES->EN): ${JSON.stringify(localNewTurn)}`,
        );
        translatedTurnForDb = {
          id: localNewTurn.id,
          session_id: sessionId!,
          text: localNewTurn.text,
          turn_type: localNewTurn.type,
          timestamp: new Date(localNewTurn.timestamp).toISOString(),
          language_code: target_language,
          actor: "user",
          original_item_id: localNewTurn.original_item_id,
        };
        addLog(
          `TR_EFFECT_HANDLER: For translation (ES->EN), using sessionId: ${sessionId} to create translatedTurnForDb`,
        );
        addLog(
          `TR_EFFECT_HANDLER: Assigned translatedTurnForDb (ES->EN): ${JSON.stringify(translatedTurnForDb)}`,
        );

        if (newTurnForReduxState) {
          addLog(
            `TR_EFFECT_HANDLER: Dispatching addEnglishTurn with: ${JSON.stringify(newTurnForReduxState)}`,
          );
          dispatch(addEnglishTurn(newTurnForReduxState));
          addLog(`TR_EFFECT_HANDLER: Dispatched addEnglishTurn.`);
        }

        ttsText = translated_text;
        ttsLang = "en";
      } else {
        const unhandledMsg = `[System: Unhandled language pair in translation result (${
          source_language || "unknown"
        } -> ${target_language})]`;
        addLog(unhandledMsg + `: ${original_transcript} -> ${translated_text}`);
        toast.message(unhandledMsg);
      }

      addLog(
        `TR_EFFECT_HANDLER: Before save check. translatedTurnForDb: ${JSON.stringify(
          translatedTurnForDb,
        )}, sessionId: ${sessionId}`,
      );
      if (translatedTurnForDb && sessionId) {
        saveTurnToDb(translatedTurnForDb, addLog);
      }

      // If the original_transcript was processed (not a repeat request)
      // and its actual source language from the translation API is known,
      // ensure the original utterance is in its correct native language history if it was initially 'und'.
      if (
        !localIsRepeatRequest &&
        originalUserUtteranceItemId &&
        translationResult.original_transcript
      ) {
        const originalTurnId = `user_direct_${originalUserUtteranceItemId}_${now}_orig_${Math.random()}`;

        if (source_language.startsWith("es")) {
          // The original was Spanish. We've already added its English translation to englishHistory.
          // Now, ensure the original Spanish is in spanishHistory.
          const spanishOriginalTurn: ConversationTurn = {
            id: originalTurnId,
            text: translationResult.original_transcript, // The original Spanish text
            type: "user_direct_es",
            timestamp: now, // Or try to use a timestamp closer to the original speech event if possible
            original_item_id: originalUserUtteranceItemId,
          };
          addLog(
            `TR_EFFECT_HANDLER: Adding original Spanish utterance (detected from 'und') to spanishHistory: ${JSON.stringify(
              spanishOriginalTurn,
            )}`,
          );
          dispatch(addSpanishTurn(spanishOriginalTurn));
          // No need to save this to DB again, as the 'user_direct_und' record with original text already exists.
          // The FETCH_EFFECT on reload will correctly place that 'und' record into spanishHistory if its language_code was 'es'.
        } else if (source_language.startsWith("en")) {
          // The original was English. We've already added its Spanish translation to spanishHistory.
          // we need to ensure it's in englishHistory here.
          const englishOriginalTurn: ConversationTurn = {
            id: originalTurnId,
            text: translationResult.original_transcript, // The original English text
            type: "user_direct_en",
            timestamp: now,
            original_item_id: originalUserUtteranceItemId,
          };
          addLog(
            `TR_EFFECT_HANDLER: Adding original English utterance (detected from 'und') to englishHistory: ${JSON.stringify(
              englishOriginalTurn,
            )}`,
          );
          dispatch(addEnglishTurn(englishOriginalTurn));
        }
      }
    }
  } else {
    // Malformed translation data (but not an error string in translationResult.error)
    const malformedMsg = "[System: Malformed translation data received]";
    addLog(`TR_EFFECT_HANDLER: ${malformedMsg}`);
    toast.error(malformedMsg); // Display as toast
  }

  // TTS Initiation Logic - Refactored from original useEffect
  if (ttsText && ttsLang) {
    let ttsAllowedForThisLanguage = false;
    if (ttsLang.startsWith("en")) {
      ttsAllowedForThisLanguage = isEnglishTtsEnabled;
    } else if (ttsLang.startsWith("es")) {
      ttsAllowedForThisLanguage = isSpanishTtsEnabled;
    } else {
      // Default behavior for other languages if any - assuming enabled if not explicitly en/es
      // Or, you might want to default to false if only en/es are supported for this toggle feature
      addLog(
        `TR_EFFECT_HANDLER: TTS toggle check for unhandled lang ${ttsLang}. Defaulting to enabled.`,
      );
      ttsAllowedForThisLanguage = true;
    }

    if (!ttsAllowedForThisLanguage) {
      addLog(
        `TR_EFFECT_HANDLER: TTS for lang ${ttsLang} is disabled by toggle. Skipping speech for: "${ttsText}"`,
      );
      if (store.getState().session.isFetchingTtsAudio) {
        dispatch(ttsAudioFetchFinished());
        addLog(
          "TR_EFFECT_HANDLER: Dispatched ttsAudioFetchFinished as TTS was skipped due to toggle (isFetchingTtsAudio was true).",
        );
      }
      if (
        currentAiState !== "idle" &&
        currentAiState !== "listening" &&
        isApiReadyForResponse
      ) {
        setCurrentAiState("listening");
      }
      return;
    }

    // If TTS is allowed, proceed with existing logic
    if (localIsRepeatRequest) {
      if (
        originalUserUtteranceItemId &&
        processedRepeatRequestsRef.current[originalUserUtteranceItemId]
      ) {
        addLog(
          `TR_EFFECT_HANDLER: Repeat for user item ${originalUserUtteranceItemId} already actioned, skipping.`,
        );
        // No explicit state change to listening needed here as TTS_QUEUE_PROCESSOR will handle it after its attempt, or if it doesn't run.
      } else {
        addLog(
          `TR_EFFECT_HANDLER: Queueing REPEAT TTS for "${ttsText}" (user item: ${originalUserUtteranceItemId})`,
        );
        dispatch(
          setPendingTtsRequest({
            text: ttsText,
            language: ttsLang,
            itemId: originalUserUtteranceItemId || "repeat",
          }),
        );
        if (originalUserUtteranceItemId) {
          processedRepeatRequestsRef.current[originalUserUtteranceItemId] =
            true;
        }
      }
    } else {
      // NON-REPEAT REQUEST (AI responding to original user input)
      if (ttsInitiatedForItem !== originalUserUtteranceItemId) {
        addLog(
          `TR_EFFECT_HANDLER: Queueing ORIGINAL TTS for "${ttsText}" (related to user item: ${originalUserUtteranceItemId})`,
        );
        dispatch(
          setPendingTtsRequest({
            text: ttsText,
            language: ttsLang,
            itemId: originalUserUtteranceItemId || "original",
          }),
        );
        // Mark as initiated to prevent re-queueing from this handler if it runs again for the same translationResult
        setTtsInitiatedForItem(originalUserUtteranceItemId || null);
      } else {
        addLog(
          `TR_EFFECT_HANDLER: TTS (ORIGINAL) already marked as initiated for user item ${originalUserUtteranceItemId}, not re-queueing.`,
        );
        // No explicit state change to listening needed here as TTS_QUEUE_PROCESSOR will handle it after its attempt.
      }
    }
  } else {
    // No ttsText or ttsLang, ensure we are in a sensible state if no TTS was queued/possible
    if (
      currentAiState !== "idle" &&
      !localIsRepeatRequest && // Only adjust state if it wasn't a repeat that failed due to no prior TTS
      isApiReadyForResponse && // And API is generally ready for next interaction
      currentAiState !== "speaking_tts" // And we are not already speaking
    ) {
      // If we intended to speak but couldn't (e.g. TTS toggle off, or no ttsText/Lang derived)
      // and we are not in speaking_tts (meaning TTS queue didn't pick it up yet or it was skipped before queue),
      // then transition to listening.
      // The TTS_QUEUE_PROCESSOR or response.done/output_audio_buffer.stopped will handle transitions
      // if a TTS request *was* successfully made and processed by the queue.
      addLog(
        `TR_EFFECT_HANDLER: No TTS to play for item ${originalUserUtteranceItemId}. Ensuring AI is listening if appropriate.`,
      );
      setCurrentAiState("listening");
    }
  }
};
