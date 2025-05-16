"use client";

import React from "react";

interface ConversationSummaryProps {
  summary?: string | null;
  detectedActions?: any;
  isLoading?: boolean;
  error?: string | null;
}

const ConversationSummary = React.memo(function ConversationSummary({
  summary = "No summary available yet.",
  detectedActions = [],
  isLoading = false,
  error = null,
}: ConversationSummaryProps) {
  const displaySummaryText = isLoading
    ? "Loading summary..."
    : error
      ? `Error: ${error}`
      : summary || "No summary available.";

  const isSummaryPlaceholder =
    isLoading ||
    !!error ||
    !summary ||
    summary === "No summary available yet." ||
    summary === "Summary will appear here..." ||
    summary === "No summary available.";

  const summaryTextClasses = isSummaryPlaceholder
    ? "text-sm text-gray-500 italic"
    : "text-base text-gray-700 leading-relaxed";

  return (
    <div className="w-full rounded-xl bg-transparent p-8 shadow-lg flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-8">
        <h3 className="text-2xl font-medium text-gray-700">
          Conversation Summary
        </h3>
      </div>

      <div className="mb-8 min-h-[80px] bg-white p-6 rounded-lg shadow-md">
        <p className={summaryTextClasses}>
          {JSON.stringify(displaySummaryText)}
        </p>
      </div>

      <div className="flex-1 flex flex-col">
        <h4 className="text-xl font-medium text-gray-600 mb-4">
          Detected Actions:
        </h4>
        <div className="flex-1 bg-white p-6 rounded-lg shadow-md min-h-[70px]">
          {isLoading && !error && (
            <p className="text-sm text-blue-500 italic">Loading actions...</p>
          )}
          {!isLoading && error && (
            <p className="text-sm text-red-500 italic">
              Could not load summary actions: {error}
            </p>
          )}
          {!isLoading && !error && detectedActions.length > 0 && (
            <ul className="space-y-2.5 text-sm text-gray-700">
              {detectedActions.map(
                (
                  { tool, result }: { tool: string; result: string },
                  index: number,
                ) => (
                  <li
                    key={index}
                    className="p-2 rounded-md flex justify-between items-center"
                    title={tool}
                  >
                    <span>{tool}</span>
                    <small>{result}</small>
                  </li>
                ),
              )}
            </ul>
          )}
          {!isLoading && !error && detectedActions.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No actions detected yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default ConversationSummary;
