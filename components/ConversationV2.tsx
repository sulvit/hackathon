"use client";
import { faVolumeHigh, faVolumeXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toggleEnglishTts, toggleSpanishTts } from "../store/sessionSlice";
import type { AppDispatch, RootState } from "../store/store";
import type { ConversationTurn } from "../types/conversation";

interface ConversationV2Props {
  conversationHistory: Array<ConversationTurn>;
  displayLanguage: "EN" | "ES";
}

const ConversationV2 = React.memo(function ConversationV2({
  conversationHistory,
  displayLanguage,
}: ConversationV2Props) {
  console.log(
    `ConversationV2 ${displayLanguage} RENDER, history length: ${conversationHistory?.length}`,
  );
  const dispatch = useDispatch<AppDispatch>();
  const { isEnglishTtsEnabled, isSpanishTtsEnabled } = useSelector(
    (state: RootState) => state.session,
  );
  const scrollableContainerRef = useRef<HTMLDivElement>(null);

  const currentTtsEnabled =
    displayLanguage === "EN" ? isEnglishTtsEnabled : isSpanishTtsEnabled;
  const handleToggleTts = () => {
    if (displayLanguage === "EN") {
      dispatch(toggleEnglishTts());
    } else {
      dispatch(toggleSpanishTts());
    }
  };

  const icon = currentTtsEnabled ? faVolumeHigh : faVolumeXmark;
  const iconColor = currentTtsEnabled ? "text-blue-500" : "text-gray-500";
  const buttonBgColor = currentTtsEnabled
    ? "bg-blue-100 hover:bg-blue-200"
    : "bg-gray-200 hover:bg-gray-300";

  useEffect(() => {
    const lastMessageId = `last-message-${displayLanguage}-v2`; // Ensure unique ID for V2
    const lastMessageElement = document.getElementById(lastMessageId);
    if (lastMessageElement) {
      lastMessageElement.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [conversationHistory, displayLanguage]);

  if (!conversationHistory || conversationHistory.length === 0) {
    return (
      <div className="w-full rounded-lg bg-white p-6 shadow-md min-h-[400px] relative">
        <button
          onClick={handleToggleTts}
          className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center ${buttonBgColor} shadow-md z-10 transition-colors duration-150`}
          aria-label={`Toggle ${displayLanguage} TTS`}
          title={
            currentTtsEnabled
              ? `Disable ${displayLanguage} TTS`
              : `Enable ${displayLanguage} TTS`
          }
        >
          <FontAwesomeIcon icon={icon} className={`${iconColor} w-5 h-5`} />
        </button>
        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-lg font-semibold uppercase">
            {displayLanguage}
          </span>
          <span className="text-slate-700 text-sm font-medium">TRANSCRIPT</span>
          <span className="text-gray-400 text-sm font-medium">/</span>
          <span
            className={`${displayLanguage === "EN" ? "text-sky-600" : "text-teal-600"} text-sm font-medium`}
          >
            TRANSLATION
          </span>
        </div>
        <p className="text-gray-500 text-sm" aria-live="polite">
          {" "}
          {/* Removed font-mono, adjusted color */}
          No transcript available...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg bg-white p-6 shadow-md min-h-[400px] relative">
      <button
        onClick={handleToggleTts}
        className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center ${buttonBgColor} shadow-md z-10 transition-colors duration-150`}
        aria-label={`Toggle ${displayLanguage} TTS`}
        title={
          currentTtsEnabled
            ? `Disable ${displayLanguage} TTS`
            : `Enable ${displayLanguage} TTS`
        }
      >
        <FontAwesomeIcon icon={icon} className={`${iconColor} w-5 h-5`} />
      </button>
      {/* Updated header styles and spacing */}
      <div className="flex items-baseline gap-2 mb-6">
        {" "}
        {/* Increased mb-6, items-baseline for better alignment */}
        <span className="text-lg font-semibold uppercase">
          {displayLanguage}
        </span>
        <span className="text-slate-700 text-sm font-medium">TRANSCRIPT</span>
        <span className="text-gray-400 text-sm font-medium">/</span>
        <span
          className={`${displayLanguage === "EN" ? "text-sky-600" : "text-teal-600"} text-sm font-medium`}
        >
          TRANSLATION
        </span>
      </div>
      <div
        ref={scrollableContainerRef}
        className="flex flex-col gap-4" // Styles for gap remain
      >
        {conversationHistory.map((turn, index) => {
          let itemsAlignClass = "items-start"; // Default alignment
          let bgColor = "bg-gray-200"; // Default background
          let textColor = "text-slate-500"; // Default text color

          // Revised styling logic based on suggestions
          if (displayLanguage === "EN") {
            if (turn.type === "user_direct_en") {
              itemsAlignClass = "items-end";
            } else if (turn.type === "user_translation_to_en") {
              itemsAlignClass = "items-start";
              bgColor = "bg-sky-50";
              textColor = "text-sky-700 font-semibold";
            } else if (turn.type === "assistant_spoken_en") {
              itemsAlignClass = "items-start";
              bgColor = "bg-gray-100";
              textColor = "text-purple-500";
            }
          } else if (displayLanguage === "ES") {
            if (turn.type === "user_direct_es") {
              itemsAlignClass = "items-end";
            } else if (turn.type === "user_translation_to_es") {
              itemsAlignClass = "items-start";
              bgColor = "bg-teal-50";
              textColor = "text-teal-700 font-semibold";
            } else if (turn.type === "assistant_spoken_es") {
              itemsAlignClass = "items-start";
              bgColor = "bg-gray-100";
              textColor = "text-emerald-500";
            }
          }

          if (turn.type === "error_message") {
            itemsAlignClass = "items-center"; // Center error messages
            bgColor = "bg-red-100";
            textColor = "text-red-700";
          }

          const formattedTime = new Date(turn.timestamp).toLocaleTimeString(
            [],
            { hour: "2-digit", minute: "2-digit" },
          );
          const isLastMessage = index === conversationHistory.length - 1;

          return (
            <div
              key={`${displayLanguage}-${turn.id}-${turn.type}-${turn.timestamp}-v2`} // Ensure unique key for V2
              id={
                isLastMessage ? `last-message-${displayLanguage}-v2` : undefined
              }
              className={`flex flex-col w-full ${itemsAlignClass}`}
            >
              {/* Updated bubble styles: p-3, rounded-xl, shadow-md */}
              <div
                className={`max-w-[85%] p-3 rounded-xl shadow-md ${bgColor}`}
              >
                {/* Removed font-mono, text-sm is Tailwind default for this size */}
                <p
                  className={`text-sm whitespace-pre-wrap ${textColor}`}
                  style={{
                    fontStyle:
                      turn.type === "error_message" ? "italic" : "normal",
                  }}
                >
                  {turn.text}
                </p>
              </div>
              <span
                className={`text-xs text-gray-400 mt-1 px-1 ${
                  itemsAlignClass === "items-end"
                    ? "self-end"
                    : itemsAlignClass === "items-start"
                      ? "self-start"
                      : "self-center" // For centered error messages
                }`}
              >
                {formattedTime}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default ConversationV2;
