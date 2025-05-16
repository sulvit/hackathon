// File: schema.tsx

import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const setupDatabase = async () => {
  if (!process.env.DATABASE_URL) throw new Error(`DATABASE_URL environment variable not found.`);
  const sql = neon(process.env.DATABASE_URL);

  console.log("Starting database schema setup...");

  try {
    // Existing messages table (primarily for raw OpenAI events)
    await sql`CREATE TABLE IF NOT EXISTS messages (
      created_at SERIAL, 
      id TEXT PRIMARY KEY, 
      session_id TEXT, 
      content_type TEXT, 
      content_transcript TEXT, 
      object TEXT, 
      role TEXT, 
      status TEXT, 
      type TEXT
    );`;
    await sql`CREATE INDEX IF NOT EXISTS idx_session_created_at ON messages (session_id, created_at);`;
    console.log("Table 'messages' ensured and indexed.");

    // New table for formatted conversation turns (for UI display, history, and summarization)
    await sql`CREATE TABLE IF NOT EXISTS formatted_conversation_turns (
      id TEXT PRIMARY KEY,            -- Frontend generated unique ID for the turn
      session_id TEXT NOT NULL,       -- Conversation slug / ID
      text TEXT NOT NULL,             -- The text content of the turn
      turn_type TEXT NOT NULL,        -- e.g., user_direct_en, assistant_spoken_es, error_message
      timestamp TIMESTAMPTZ NOT NULL DEFAULT current_timestamp, -- Actual timestamp of creation
      language_code VARCHAR(10) NOT NULL, -- e.g., "en", "es", "und"
      actor VARCHAR(15) NOT NULL,       -- "user" or "assistant" or "system" (for errors)
      original_item_id TEXT           -- Optional: links to OpenAI item ID if applicable
    );`;
    await sql`CREATE INDEX IF NOT EXISTS idx_formatted_turns_session_timestamp ON formatted_conversation_turns (session_id, timestamp);`;
    console.log("Table 'formatted_conversation_turns' created and indexed.");

    // New table for conversation summaries
    await sql`CREATE TABLE IF NOT EXISTS conversation_summaries (
      session_id TEXT PRIMARY KEY,                      -- Links to the conversation session
      summary_text TEXT NOT NULL,                     -- The generated summary
      detected_actions JSONB,                         -- Array of detected action strings (e.g., ["schedule followup", "send lab order"])
      created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp -- When the summary was created
    );`;
    console.log("Table 'conversation_summaries' created.");

    console.log("Database schema setup successful.");
  } catch (error) {
    console.error("Failed to set up database schema:", error);
  }
};

setupDatabase();
