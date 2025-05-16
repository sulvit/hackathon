import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure your API key is correctly set in environment variables
});

async function detectLanguage(text: string): Promise<string | null> {
  try {
    // Using a more capable model for language detection.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a language detection assistant. Respond with only the ISO 639-1 code for the detected language of the user's text (e.g., 'en', 'es', 'fr'). If unsure or if the text is too short/ambiguous, respond with 'und'.",
        },
        {
          role: "user",
          content: `Detect the language of the following text: "${text}"`,
        },
      ],
      temperature: 0,
      max_tokens: 10, // Expecting a very short response like "en" or "es"
    });
    const detectedLang = completion.choices[0]?.message?.content
      ?.trim()
      .toLowerCase();

    // Validate if the response is a 2-letter ISO 639-1 code or 'und'
    if (
      detectedLang &&
      (/^[a-z]{2}$/.test(detectedLang) || detectedLang === "und")
    ) {
      console.log(
        `TRANSLATE_TEXT_API (LangDetect): Detected language '${detectedLang}' for text: "${text.substring(0, 50)}..."`,
      );
      return detectedLang;
    }
    console.warn(
      `TRANSLATE_TEXT_API (LangDetect): Could not reliably detect language or invalid code '${detectedLang}' for text: "${text.substring(
        0,
        50,
      )}...". Defaulting to 'und'.`,
    );
    return "und"; // Fallback if detection is not confident or format is wrong
  } catch (error) {
    console.error(
      "TRANSLATE_TEXT_API (LangDetect): Error during language detection:",
      error,
    );
    return null; // Indicate critical failure to detect
  }
}

async function classifyRepeatIntent(
  text: string,
  originalLanguage: string,
): Promise<boolean> {
  try {
    const systemPrompt =
      "You are an intent classification assistant. Analyze the user's message. " +
      "If the message clearly indicates the user wants the previous statement to be repeated " +
      "(e.g., they misunderstood, didn't hear well, or explicitly asked for a repeat like 'what did you say?', " +
      "'say that again', '¿puedes repetirlo?', 'no entendí', 'qué', 'what?'), respond with only the word YES. " +
      "Otherwise, respond with only the word NO.";

    const userPrompt = `User message in ${originalLanguage}: "${text}"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using a capable model for intent classification
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1, // Low temperature for more deterministic classification
      max_tokens: 5, // Expecting YES or NO
    });
    const intentResponse = completion.choices[0]?.message?.content
      ?.trim()
      .toUpperCase();
    console.log(
      `TRANSLATE_TEXT_API (RepeatIntent): For text "${text}", classification response: "${intentResponse}"`,
    );
    return intentResponse === "YES";
  } catch (error) {
    console.error(
      "TRANSLATE_TEXT_API (RepeatIntent): Error during intent classification:",
      error,
    );
    return false; // Default to not a repeat request on error
  }
}

export async function POST(request: Request) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 },
    );
  }

  try {
    let { transcript, source_language } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "Missing transcript" },
        { status: 400 },
      );
    }

    // If source_language is not provided or is 'und', try to detect it.
    if (!source_language || source_language.toLowerCase() === "und") {
      console.warn(
        `TRANSLATE_TEXT_API: Source language is '${
          source_language || "not provided"
        }'. Attempting auto-detection for: "${transcript.substring(0, 50)}..."`,
      );
      const detected = await detectLanguage(transcript);
      if (detected && detected !== "und") {
        source_language = detected;
        console.log(
          `TRANSLATE_TEXT_API: Auto-detected and using language: ${source_language}`,
        );
      } else {
        console.error(
          `TRANSLATE_TEXT_API: Failed to auto-detect language for transcript: "${transcript}" (detection returned: ${detected})`,
        );
        return NextResponse.json(
          {
            error: `Failed to auto-detect language for translation. Original text: "${transcript}"`,
          },
          { status: 400 },
        );
      }
    }

    // Now that we have a determined source_language, classify for repeat intent
    const is_repeat_request = await classifyRepeatIntent(
      transcript,
      source_language,
    );
    console.log(
      `TRANSLATE_TEXT_API: Final repeat intent for "${transcript}": ${is_repeat_request}`,
    );

    // If it's a repeat request, we might not need to translate further depending on client logic.
    // For now, we'll proceed with translation if not a repeat, or return minimal info if it is.
    // The client will ultimately decide whether to use the new translation or replay old audio.

    let target_language: string | null = null;
    let system_prompt_translation: string | null = null;
    let translatedText: string | null = transcript; // Default to original if not translated (e.g. repeat)

    if (!is_repeat_request) {
      if (source_language.toLowerCase().startsWith("en")) {
        target_language = "es";
        system_prompt_translation = `Translate the following English text to Spanish. Output only the translation.`;
      } else if (source_language.toLowerCase().startsWith("es")) {
        target_language = "en";
        system_prompt_translation = `Translate the following Spanish text to English. Output only the translation.`;
      } else {
        // This case should ideally not be hit if detection above is robust or throws error
        console.error(
          `TRANSLATE_TEXT_API: Unsupported source language for translation: ${source_language}`,
        );
        // Return the original transcript and repeat flag if language is unsupported for translation but was detected
        return NextResponse.json({
          original_transcript: transcript,
          translated_text: transcript, // No translation possible
          source_language: source_language,
          target_language: source_language, // Target is same as source
          is_repeat_request: is_repeat_request,
          error: `Unsupported source language for translation: ${source_language}`,
        });
      }

      console.log(
        `TRANSLATE_TEXT_API: Translating from ${source_language} to ${target_language}: "${transcript}"`,
      );
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system_prompt_translation },
          { role: "user", content: transcript },
        ],
        temperature: 0.3,
      });
      translatedText =
        completion.choices[0]?.message?.content?.trim() || transcript; // Fallback to original if translation empty
      if (
        translatedText === transcript &&
        source_language !== target_language
      ) {
        console.warn(
          "TRANSLATE_TEXT_API: Translation resulted in the same text as input or was empty.",
        );
      }
      console.log(
        `TRANSLATE_TEXT_API: Translation successful: "${translatedText}"`,
      );
    } else {
      // It is a repeat request. Set target_language based on source for client consistency, if needed.
      // Or the client will know what to do based on its cached last_spoken_lang.
      target_language = source_language; // Or this could be determined by client's last spoken language
      console.log(
        `TRANSLATE_TEXT_API: Repeat request. Original: "${transcript}". No new translation performed.`,
      );
    }

    return NextResponse.json({
      original_transcript: transcript,
      translated_text: translatedText, // This will be the original if it was a repeat and no new translation done
      source_language: source_language,
      target_language: target_language, // Will be same as source if it was a repeat
      is_repeat_request: is_repeat_request,
    });
  } catch (error: any) {
    console.error("Error in /api/translate-text:", error);
    return NextResponse.json(
      {
        error: "Internal server error during processing",
        details: error.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
