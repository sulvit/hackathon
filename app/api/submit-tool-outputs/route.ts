import { NextResponse } from "next/server";
import OpenAI from "openai";

// Ensure your OpenAI API key is set in environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  console.log("POST /api/submit-tool-outputs: Handler invoked");
  try {
    const { threadId, runId, toolOutputs } = await request.json();

    if (!threadId || !runId || !toolOutputs) {
      return NextResponse.json(
        { error: "Missing threadId, runId, or toolOutputs" },
        { status: 400 },
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "POST /api/submit-tool-outputs: OPENAI_API_KEY not configured",
      );
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 },
      );
    }

    console.log(
      `POST /api/submit-tool-outputs: Submitting to OpenAI for threadId: ${threadId}, runId: ${runId}`,
    );
    console.log(
      `POST /api/submit-tool-outputs: Tool outputs: ${JSON.stringify(toolOutputs)}`,
    );

    // Actual call to OpenAI SDK to submit tool outputs
    // IMPORTANT: Ensure your OpenAI client is initialized correctly with your API key
    const run = await openai.beta.threads.runs.submitToolOutputs(
      threadId,
      runId,
      {
        tool_outputs: toolOutputs,
      },
    );

    console.log(
      `POST /api/submit-tool-outputs: Successfully submitted tool outputs. Run status: ${run.status}`,
    );

    // You might want to return the run object or just a success status
    // The client-side will then wait for subsequent WebSocket events to see the run continue.
    return NextResponse.json(
      { success: true, runStatus: run.status },
      { status: 200 },
    );
  } catch (error: any) {
    console.error(
      `POST /api/submit-tool-outputs: Error submitting tool outputs to OpenAI`,
      error,
    );
    let errorMessage = "Failed to submit tool outputs";
    if (error instanceof OpenAI.APIError) {
      errorMessage = `OpenAI API Error: ${error.status} ${error.name} - ${error.message}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { error: "Failed to submit tool outputs", details: errorMessage },
      { status: 500 },
    );
  }
}
