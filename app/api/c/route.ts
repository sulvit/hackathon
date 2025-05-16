// File: app/api/c/route.ts

export const runtime = "edge";

export const dynamic = "force-dynamic";

export const fetchCache = "force-no-store";

import { neon, neonConfig } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

neonConfig.poolQueryViaFetch = true;

export async function POST(request: Request) {
  const { id, item } = await request.json();
  if (!id || !item || !process.env.DATABASE_URL)
    return NextResponse.json({}, { status: 400 });
  const sql = neon(process.env.DATABASE_URL);
  const rows =
    await sql`SELECT COUNT(*) from messages WHERE session_id = ${id}`;
  await sql`INSERT INTO messages (created_at, id, session_id, content_type, content_transcript, object, role, status, type) VALUES (${rows[0].count}, ${item.id}, ${id}, ${item.content[0].type}, ${item.content[0].transcript}, ${item.object}, ${item.role}, ${item.status}, ${item.type}) ON CONFLICT DO NOTHING`;
  return NextResponse.json({});
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !process.env.DATABASE_URL) return NextResponse.json([]);
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`SELECT * from messages WHERE session_id = ${id}`;
  return NextResponse.json(rows);
}

// Add a DELETE handler
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !process.env.DATABASE_URL) {
    console.error("DELETE /api/c: Missing id or DATABASE_URL");
    return NextResponse.json(
      { error: "Missing conversation ID" },
      { status: 400 },
    );
  }

  console.log(
    `DELETE /api/c: Attempting to delete messages for session_id: ${id}`,
  );

  try {
    const sql = neon(process.env.DATABASE_URL);
    // Execute the delete query
    await sql`DELETE from messages WHERE session_id = ${id}`;
    console.log(
      `DELETE /api/c: Successfully deleted messages for session_id: ${id}`,
    );
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      `DELETE /api/c: Error deleting messages for session_id: ${id}`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to delete messages" },
      { status: 500 },
    );
  }
}
