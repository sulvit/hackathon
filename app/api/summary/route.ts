export const runtime = "edge";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { neon, neonConfig } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

neonConfig.poolQueryViaFetch = true;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    console.error("GET /api/summary: DATABASE_URL not configured");
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log(
      `GET /api/summary: Fetching summary for session_id: ${sessionId}`,
    );
    const summaryResult = await sql`
      SELECT session_id, summary_text, detected_actions, created_at
      FROM conversation_summaries
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
      LIMIT 1;
    `;

    if (summaryResult.length === 0) {
      console.log(
        `GET /api/summary: No summary found for session_id: ${sessionId}`,
      );
      return NextResponse.json({ error: "Summary not found" }, { status: 404 });
    }

    const dbSummary = summaryResult[0];
    // Ensure detected_actions is an array, even if null/undefined in DB
    const detectedActionsArray = dbSummary.detected_actions || "[]";

    const summaryData = {
      session_id: dbSummary.session_id,
      summary_text: dbSummary.summary_text,
      detected_actions: detectedActionsArray,
      created_at: dbSummary.created_at,
    };

    console.log(
      `GET /api/summary: Summary found for session_id: ${sessionId}`,
      summaryData,
    );
    return NextResponse.json(summaryData, { status: 200 });
  } catch (error: any) {
    console.error(
      `GET /api/summary: Error fetching summary for session_id: ${sessionId}`,
      error,
    );
    let errorMessage = "Failed to fetch summary";
    if (error.message) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { error: "Failed to fetch summary", details: errorMessage },
      { status: 500 },
    );
  }
}
