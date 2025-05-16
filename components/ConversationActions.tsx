"use client";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";
import {
  generateSessionSummaryThunk,
  setSession,
  setWebRtcConnected,
  setWebRtcLoading,
} from "../store/sessionSlice";
import { AppDispatch, RootState } from "../store/store";
import type { SummaryData } from "../types/conversation";

interface ConversationActionsProps {
  sessionId: string | null;
  isLiveSessionActive: boolean;
  onRequestNewSession?: () => void;
  currentSessionSummary: SummaryData | null;
}

export default function ConversationActions({
  sessionId,
  isLiveSessionActive,
  onRequestNewSession,
  currentSessionSummary,
}: ConversationActionsProps) {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { isFetchingSummary } = useSelector(
    (state: RootState) => state.session,
  );

  const handleGenerateSummaryClick = async () => {
    if (!sessionId) {
      const errorMsg = "Cannot summarize: Session ID is missing.";
      toast.error(errorMsg);
      return;
    }

    if (isLiveSessionActive) {
      dispatch(setWebRtcConnected(false));
      dispatch(setWebRtcLoading(false));
      toast.info("Stopping live session for summary generation...");
    }

    try {
      const console_log = (message: string) =>
        console.log(`[ConversationActions]: ${message}`);

      // Dispatch the generate summary thunk
      const resultAction = await dispatch(
        generateSessionSummaryThunk({
          sessionId,
          pageLogger: console_log,
        }),
      );

      if (generateSessionSummaryThunk.fulfilled.match(resultAction)) {
        toast.success("Summary generated successfully!");
      } else if (generateSessionSummaryThunk.rejected.match(resultAction)) {
        const errorMsg =
          (resultAction.payload as string) || "Failed to generate summary";
        toast.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      const errorMsg =
        err.message || "An unknown error occurred during summarization.";
      toast.error(errorMsg);
    }
  };

  const handleRestartClick = () => {
    if (onRequestNewSession) {
      onRequestNewSession();
    } else {
      dispatch(setSession(null));
      router.push("/");
    }
  };

  const isSummarizeDisabled = isFetchingSummary || !sessionId;
  const isRestartDisabled = isFetchingSummary;

  return (
    <div className="w-full flex flex-col md:flex-row items-center md:space-x-4 space-y-3 md:space-y-0">
      <button
        onClick={handleGenerateSummaryClick}
        disabled={isSummarizeDisabled}
        className={`
          w-full md:flex-1 m-4 px-6 py-3 text-white rounded-lg shadow-md 
          focus:outline-none focus:ring-2 focus:ring-opacity-75 transition-all duration-150 ease-in-out
          ${
            isSummarizeDisabled
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-slate-700 hover:bg-slate-800 focus:ring-slate-500 active:bg-slate-900"
          }
        `}
      >
        {isFetchingSummary ? (
          "Generating Summary..."
        ) : currentSessionSummary ? (
          <>
            <FontAwesomeIcon
              color="orange"
              icon={faTriangleExclamation}
              className="mr-2"
            />
            Re-generate Summary
          </>
        ) : (
          "Generate Summary"
        )}
      </button>

      <button
        onClick={handleRestartClick}
        disabled={isRestartDisabled}
        className={`
          w-full md:flex-1 m-5 px-6 py-3 rounded-lg shadow-md 
          focus:outline-none focus:ring-2 focus:ring-opacity-75 transition-all duration-150 ease-in-out
          ${
            isRestartDisabled
              ? "border border-gray-300 text-gray-400 bg-gray-100 cursor-not-allowed"
              : "border border-slate-400 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-500 focus:ring-slate-400 active:bg-slate-100"
          }
        `}
      >
        Restart
      </button>
    </div>
  );
}
