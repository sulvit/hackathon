// components/webrtcUtils.ts

interface EphemeralKeyResponse {
  ephemeralKey: string;
  sessionId?: string; // Optional: if you want to return and log the session ID too
  sessionDetails?: any; // Optional: for logging
}

/**
 * Fetches an ephemeral key for initiating a WebRTC session with OpenAI.
 * @param addLog A callback function to log messages.
 * @returns A promise that resolves to an EphemeralKeyResponse object or null if an error occurs.
 */
export const fetchOpenAiEphemeralKey = async (
  addLog: (message: string) => void,
): Promise<EphemeralKeyResponse | null> => {
  addLog("Attempting to fetch ephemeral key for transcription session...");
  try {
    const response = await fetch("/api/openai-session", { method: "POST" });
    if (!response.ok) {
      let errorDetails = "Unknown error";
      try {
        const errorData = await response.json();
        errorDetails = `${errorData.error || "Unknown error"} - Details: ${JSON.stringify(errorData.details)}`;
      } catch {
        // If parsing errorData fails, use response text
        errorDetails = await response.text();
      }
      addLog(
        `Error fetching ephemeral key: ${response.status} - ${errorDetails}`,
      );
      return null;
    }
    const data = await response.json();
    addLog(
      `Ephemeral key received. Session ID: ${data.sessionId}. Session Details: ${JSON.stringify(
        data.sessionDetails,
      ).substring(0, 100)}...`,
    );
    return {
      ephemeralKey: data.ephemeralKey,
      sessionId: data.sessionId,
      sessionDetails: data.sessionDetails,
    };
  } catch (error: any) {
    addLog(`Network error fetching ephemeral key: ${error.message || error}`);
    return null;
  }
};
