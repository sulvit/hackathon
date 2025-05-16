// File: app/api/summaries/route.ts

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { neon, neonConfig } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

neonConfig.poolQueryViaFetch = true;

export async function GET() {
  if (!process.env.DATABASE_URL) {
    console.error("GET /api/summaries: DATABASE_URL not configured");
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Fetch session_id, a snippet of the summary, and summary creation time
    // Order by when the summary was created, newest first.
    const summaries = await sql`
      SELECT 
        session_id, 
        SUBSTRING(summary_text FROM 1 FOR 100) as summary_text_snippet, -- Adjust snippet length as needed
        created_at
      FROM conversation_summaries
      ORDER BY created_at DESC;
    `;

    if (!summaries) {
      // sql query itself might return null/undefined on error before throwing
      return NextResponse.json(
        { error: "Failed to fetch summaries, query returned no result." },
        { status: 500 },
      );
    }

    return NextResponse.json(summaries, { status: 200 });
  } catch (error: any) {
    console.error(
      `GET /api/summaries: Error fetching conversation summaries`,
      error,
    );
    return NextResponse.json(
      {
        error: "Failed to fetch conversation summaries",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
