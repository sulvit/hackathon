export const runtime = "edge";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { neon, neonConfig } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

neonConfig.poolQueryViaFetch = true;

// Interface for the expected payload for a new message/turn
interface NewFormattedTurn {
  id: string;
  session_id: string;
  text: string;
  turn_type: string;
  timestamp?: string; // Optional: client can send ISO string, or DB will use DEFAULT current_timestamp
  language_code: string;
  actor: string; // "user" | "assistant" | "system"
  original_item_id?: string | null;
}

export async function POST(request: Request) {
  const turnData = (await request.json()) as NewFormattedTurn;

  if (
    !turnData ||
    !turnData.id ||
    !turnData.session_id ||
    !turnData.text ||
    !turnData.turn_type ||
    !turnData.language_code ||
    !turnData.actor
  ) {
    return NextResponse.json(
      { error: "Missing required fields for formatted turn" },
      { status: 400 },
    );
  }
  if (!process.env.DATABASE_URL) {
    console.error("POST /api/messages: DATABASE_URL not configured");
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Use the provided timestamp if available, otherwise rely on DB default
    const timestampToInsert = turnData.timestamp
      ? new Date(turnData.timestamp).toISOString()
      : undefined;

    await sql`
      INSERT INTO formatted_conversation_turns (
        id, session_id, text, turn_type, timestamp, language_code, actor, original_item_id
      )
      VALUES (
        ${turnData.id}, 
        ${turnData.session_id}, 
        ${turnData.text}, 
        ${turnData.turn_type}, 
        ${timestampToInsert || sql`current_timestamp`}, 
        ${turnData.language_code}, 
        ${turnData.actor}, 
        ${turnData.original_item_id || null}
      )
      ON CONFLICT (id) DO NOTHING;
    `;
    console.log(
      `POST /api/messages: Successfully inserted turn ID: ${turnData.id} for session: ${turnData.session_id}, type: ${turnData.turn_type}`,
    );
    return NextResponse.json(
      { success: true, id: turnData.id },
      { status: 201 },
    );
  } catch (error: any) {
    console.error(
      `POST /api/messages: Error inserting turn for session_id: ${turnData.session_id}`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to save message", details: error.message },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id query parameter" },
      { status: 400 },
    );
  }
  if (!process.env.DATABASE_URL) {
    console.error("GET /api/messages: DATABASE_URL not configured");
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    const rows = await sql`
      SELECT id, session_id, text, turn_type, timestamp, language_code, actor, original_item_id
      FROM formatted_conversation_turns
      WHERE session_id = ${sessionId}
      ORDER BY timestamp ASC;
    `;
    return NextResponse.json(rows, { status: 200 });
  } catch (error: any) {
    console.error(
      `GET /api/messages: Error fetching turns for session_id: ${sessionId}`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch messages", details: error.message },
      { status: 500 },
    );
  }
}
