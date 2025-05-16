import { NextResponse } from "next/server";

export async function POST() {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 },
    );
  }

  const sessionHostModel = "gpt-4o-mini-realtime-preview-2024-12-17";
  const taskTranscriptionModel = "gpt-4o-mini-transcribe";

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: sessionHostModel,
          input_audio_transcription: {
            model: taskTranscriptionModel,
          },
          instructions:
            "Your ONLY task is to accurately transcribe the audio to text. Output ONLY the transcribed text. DO NOT generate conversational responses, commentary, interpretations, or any audio output. Focus strictly on transcription.",
          modalities: ["text"],
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 2000,
            create_response: false,
            interrupt_response: true,
          },
          include: ["item.input_audio_transcription.logprobs"],
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error(
        "OpenAI Session API error (transcription session attempt):",
        errorData,
      );
      return NextResponse.json(
        {
          error: "Failed to create OpenAI transcription session",
          details: errorData,
        },
        { status: response.status },
      );
    }

    const data = await response.json();

    if (data.client_secret && data.client_secret.value) {
      console.log("Transcription Session created by OpenAI:", data);
      return NextResponse.json({
        ephemeralKey: data.client_secret.value,
        sessionId: data.id,
        sessionDetails: data,
      });
    } else {
      console.error(
        "Ephemeral key not found in OpenAI response (transcription session attempt):",
        data,
      );
      return NextResponse.json(
        { error: "Ephemeral key not found in response" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error(
      "Error fetching ephemeral key for transcription session:",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
