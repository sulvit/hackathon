// File: app/api/summarize/route.ts

export const runtime = "edge"; // or 'nodejs' if you need Node.js specific APIs for LLM client
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { neon, neonConfig } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import OpenAI from "openai";

neonConfig.poolQueryViaFetch = true;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Turn {
  id: string;
  session_id: string;
  text: string;
  turn_type: string;
  timestamp: string;
  language_code: string;
  actor: "user" | "assistant" | "system";
  original_item_id?: string | null;
}

// Define a more flexible type for JSON schema properties
interface JSONSchemaProperty {
  type: string;
  description: string;
  items?: { type: string; enum?: string[] }; // For array types
  enum?: string[]; // For string types with specific allowed values
  properties?: Record<string, JSONSchemaProperty>; // For nested object types
  required?: string[]; // For nested object types
}

// Define the structure for OpenAI tools
interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, JSONSchemaProperty>; // Use the more flexible property type
      required?: string[];
    };
  };
}

export async function POST(request: Request) {
  console.log("POST /api/summarize: Handler invoked");
  const { sessionId } = await request.json();

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) {
    console.error("POST /api/summarize: DATABASE_URL not configured");
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("POST /api/summarize: OPENAI_API_KEY not configured");
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 },
    );
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // 1. Fetch conversation turns from the database
    const dbResult = await sql`
      SELECT id, session_id, text, turn_type, timestamp, language_code, actor, original_item_id
      FROM formatted_conversation_turns
      WHERE session_id = ${sessionId}
      ORDER BY timestamp ASC;
    `;
    const turns: Turn[] = dbResult as unknown as Turn[]; // Corrected type assertion

    if (!turns || turns.length === 0) {
      return NextResponse.json(
        { summary: "No conversation history found to summarize.", actions: [] },
        { status: 200 },
      );
    }

    // 2. Prepare messages and tools for the LLM
    const systemInstruction = `You are a healthcare conversation analyzer. Your primary task is to identify specific intents and ALWAYS trigger corresponding tools.

    Given a conversation between a healthcare provider and a patient:
    
    1. ALWAYS select ONE of these tools to call, even if you need to make a best guess:
       * "send_lab_order" - Use when ANY lab test is mentioned or implied
       * "schedule_followup_appointment" - Use when ANY follow-up visit is mentioned or implied
    
    2. Extract any relevant details for your selected tool, using defaults or placeholders when specifics are not mentioned:
       * For lab orders: Use ["general lab work"] for test names if specific tests aren't mentioned
       * For appointments: Use "unspecified" for any missing details
    
    3. CALL ONE OF THESE TOOLS, even if the intent seems ambiguous or minimal.`;

    const openAiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [{ role: "system", content: systemInstruction }];

    const conversationTurns = turns.filter(
      (turn) => turn.actor === "user" || turn.actor === "assistant",
    );
    if (conversationTurns.length === 0) {
      return NextResponse.json(
        {
          summary: "No user or assistant messages found to summarize.",
          actions: [],
        },
        { status: 200 },
      );
    }

    openAiMessages.push({
      role: "user",
      content:
        "Let's analyze this conversation and extract any appointment scheduling or lab order intents.",
    });

    conversationTurns.forEach((turn) => {
      openAiMessages.push({
        role: turn.actor as "user" | "assistant",
        content: turn.text,
      });
    });

    const availableTools: OpenAITool[] = [
      {
        type: "function",
        function: {
          name: "send_lab_order",
          description:
            "Call this function when a 'send lab order' intent (either explicit or implicit) is detected. Extract relevant details like test names, patient instructions, fasting requirements, and urgency.",
          parameters: {
            type: "object",
            properties: {
              tests: {
                type: "array",
                items: { type: "string" },
                description:
                  "List of specific tests to be ordered (e.g., 'blood pressure', 'blood sugar levels', 'thyroid function').",
              },
              instructions: {
                type: "string",
                description:
                  "Any specific patient instructions for the lab tests (e.g., 'fast for 8 hours').",
              },
              fasting_required: {
                type: "boolean",
                description: "Whether fasting is required for the tests.",
              },
              urgency: {
                type: "string",
                description:
                  "The urgency of the lab order (e.g., 'routine', 'stat', 'urgent').",
              },
            },
            required: ["tests"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "schedule_followup_appointment",
          description:
            "Call this function when a 'schedule followup appointment' intent (either explicit or implicit) is detected. Extract relevant details like date, time, provider, reason, and duration.",
          parameters: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description:
                  "The date for the followup appointment in YYYY-MM-DD format, or 'unspecified'.",
              },
              time: {
                type: "string",
                description:
                  "The time for the followup appointment in HH:MM format, or 'unspecified'.",
              },
              provider: {
                type: "string",
                description:
                  "The name or specialty of the healthcare provider for the followup.",
              },
              reason: {
                type: "string",
                description: "The reason for the followup visit.",
              },
              duration: {
                type: "string",
                description:
                  "The expected duration of the appointment in minutes, or 'unspecified'.",
              },
            },
            required: [],
          },
        },
      },
    ];

    // 3. Call OpenAI API for summarization and action detection
    console.log(
      `POST /api/summarize: Calling OpenAI for session_id: ${sessionId}`,
    );
    let completion = await openai.chat.completions.create({
      model: "gpt-4o", // Updated model
      messages: openAiMessages,
      tools: availableTools as OpenAI.Chat.Completions.ChatCompletionTool[], // Cast for OpenAI library
      tool_choice: "auto",
      temperature: 0.3,
    });

    // After your OpenAI API call
    console.log(JSON.stringify(completion, null, 2));
    // Look specifically for any "finish_reason" values
    console.log("Finish reason:", completion.choices[0]?.finish_reason);

    let responseMessage = completion.choices[0]?.message;
    let llmResponseContent: string | null = null;

    // 3a. Handle potential tool calls
    if (responseMessage?.tool_calls) {
      console.log(
        `POST /api/summarize: LLM responded with tool_calls for session_id: ${sessionId}`,
        responseMessage.tool_calls,
      );
      openAiMessages.push(responseMessage); // Add assistant's message with tool call to history

      for (const toolCall of responseMessage.tool_calls) {
        const webhookUrl =
          "https://webhook.site/10cd3de3-dccd-4733-950c-13e62b3b3b9e";
        let toolResponseText = "";
        let parsedArgs: any = { details: "No details parsed." }; // Initialize with a default
        let actionName = "";
        let callingToolName = "";

        try {
          if (toolCall.function.arguments) {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          }
        } catch (e: any) {
          console.error(
            `POST /api/summarize: Failed to parse tool arguments for '${toolCall.function.name}', session_id: ${sessionId}`,
            e,
            "Arguments:",
            toolCall.function.arguments,
          );
          // parsedArgs will retain its default error/indicator value
        }

        if (toolCall.function.name === "send_lab_order") {
          actionName = "send_lab_order";
          callingToolName = "send_lab_order_tool";
          console.log(
            `POST /api/summarize: Executing '${actionName}' tool for session_id: ${sessionId} with arguments:`,
            parsedArgs,
          );
        } else if (toolCall.function.name === "schedule_followup_appointment") {
          actionName = "schedule_followup_appointment";
          callingToolName = "schedule_followup_appointment_tool";
          console.log(
            `POST /api/summarize: Executing '${actionName}' tool for session_id: ${sessionId} with arguments:`,
            parsedArgs,
          );
        } else {
          console.warn(
            `POST /api/summarize: Unknown tool call requested: ${toolCall.function.name} for session_id: ${sessionId}`,
          );
          toolResponseText = `Unknown tool requested: ${toolCall.function.name}.`;
          openAiMessages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            content: toolResponseText,
          });
          continue; // Skip to next tool call if any
        }

        // Common webhook call logic
        try {
          const webhookResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              action: actionName,
              callingTool: callingToolName,
              details: parsedArgs, // Send the entire parsed arguments object
            }),
          });
          const responseBodyText = await webhookResponse.text();
          if (webhookResponse.ok) {
            toolResponseText = `Webhook for '${actionName}' called successfully. Status: ${
              webhookResponse.status
            }.`;
            console.log(
              `POST /api/summarize: Webhook for '${actionName}' success, session_id: ${sessionId}`,
              toolResponseText,
            );
          } else {
            toolResponseText = `Webhook for '${actionName}' failed with status: ${webhookResponse.status}. Response: ${responseBodyText}`;
            console.error(
              `POST /api/summarize: Webhook for '${actionName}' failed, session_id: ${sessionId}`,
              toolResponseText,
            );
          }
        } catch (e: any) {
          toolResponseText = `Error calling webhook for ${actionName}: ${e.message}`;
          console.error(
            `POST /api/summarize: Error calling webhook for '${actionName}', session_id: ${sessionId}`,
            e,
          );
        }

        openAiMessages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: toolResponseText,
        });
      }

      // Prepare messages for the second call by adding a new user instruction for JSON output
      const messagesForSecondCall: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [
          ...openAiMessages,
          {
            role: "user",
            content:
              "Thank you for performing the tool actions. Now, please provide the final conversation summary and the list of all actions taken (including tool invocations and their results) in the specified JSON format as outlined in the initial system instructions. Ensure the entire response is a single, valid JSON object.",
          },
        ];

      // Make a second call to LLM to get the final summary after tool execution
      console.log(
        `POST /api/summarize: Calling OpenAI again after tool execution for session_id: ${sessionId}`,
      );
      const secondCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messagesForSecondCall, // Use the updated messages array
        temperature: 0.3,
        response_format: { type: "json_object" }, // Expect JSON now
      });
      llmResponseContent = secondCompletion.choices[0]?.message?.content;
    } else {
      // No tool calls, LLM should have responded with the summary directly.
      // The system prompt instructs it to use JSON if no tools were called on the first pass.
      // However, if tool_choice was "required" and no tool call happened, this path is less likely.
      // If it does happen, we need to ensure the first call was prompted for JSON if this mode is active.
      // For now, assuming the initial system prompt covers non-tool-call JSON for the first response.
      console.log(
        `POST /api/summarize: LLM responded directly (no tool_calls) for session_id: ${sessionId}`,
      );
      llmResponseContent = responseMessage?.content;

      // If the first call was 'required' but didn't result in tool_calls,
      // and we still want to force a JSON response from that first call,
      // we would have needed to ensure 'json' was in its prompt.
      // This part of the logic might need review if 'tool_choice: "required"' frequently leads here.
    }

    if (!llmResponseContent) {
      console.error(
        `POST /api/summarize: LLM returned empty content for session_id: ${sessionId}`,
      );
      throw new Error("LLM returned empty content.");
    }
    console.log(
      `POST /api/summarize-session: Raw LLM content for session_id: ${sessionId}: ${llmResponseContent}`,
    );

    // 4. Parse LLM response (expected to be JSON)
    let summaryData = {
      summary: "Failed to parse summary from LLM.",
      actions: [] as any[],
    }; // Changed actions to any[] for flexibility
    try {
      const parsedLlmResponse = JSON.parse(llmResponseContent);
      // Adapt to the actual keys returned by the LLM in the second call
      summaryData.summary =
        parsedLlmResponse.conversation_summary ||
        parsedLlmResponse.summary ||
        "Summary not provided by LLM.";
      summaryData.actions =
        parsedLlmResponse.actions_taken || parsedLlmResponse.actions || [];

      if (!Array.isArray(summaryData.actions)) {
        summaryData.actions = [];
      }
    } catch (parseError) {
      console.error(
        `POST /api/summarize-session: Failed to parse JSON from LLM response for session_id: ${sessionId}`,
        parseError,
        "Raw content:",
        llmResponseContent,
      );
      // Keep the default error summary, actions will be an empty array
    }

    // 5. Save summary and actions to the database
    try {
      await sql`
        INSERT INTO conversation_summaries (session_id, summary_text, detected_actions, created_at)
        VALUES (${sessionId}, ${summaryData.summary}, ${JSON.stringify(summaryData.actions)}, current_timestamp)
        ON CONFLICT (session_id) DO UPDATE SET
          summary_text = EXCLUDED.summary_text,
          detected_actions = EXCLUDED.detected_actions,
          created_at = current_timestamp;
      `;
      console.log(
        `POST /api/summarize: Successfully saved summary for session_id: ${sessionId}`,
      );
    } catch (dbError) {
      console.error(
        `POST /api/summarize: Failed to save summary to DB for session_id: ${sessionId}`,
        dbError,
      );
      // Do not throw here, still return the summary to the client if LLM part was successful
    }

    return NextResponse.json(summaryData, { status: 200 });
  } catch (error: any) {
    console.error(
      `POST /api/summarize: Error during summarization for session_id: ${sessionId}`,
      error,
    );
    let errorMessage = "Failed to generate summary";
    if (error instanceof OpenAI.APIError) {
      // More specific error handling for OpenAI
      errorMessage = `OpenAI API Error: ${error.status} ${error.name} - ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { error: "Failed to generate summary", details: errorMessage },
      { status: 500 },
    );
  }
}
