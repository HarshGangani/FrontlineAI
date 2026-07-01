import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { TriageSchema, type TriageResult } from "@/lib/schema";

const FALLBACK: TriageResult = {
  category: "other",
  priority: "P3",
  summary: "Unable to determine customer intent.",
  suggested_action: "Manual review recommended.",
  needs_human: true,
  confidence: 0.1,
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (message.length < 3) {
      return Response.json(
        { error: "Message must be at least 3 characters long." },
        { status: 400 }
      );
    }

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: message,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });

    const result = parseTriage(response.text);
    return Response.json(result);
  } catch {
    return Response.json(FALLBACK);
  }
}

function parseTriage(raw: string | undefined): TriageResult {
  if (!raw) return FALLBACK;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return FALLBACK;
  }

  const parsed = TriageSchema.safeParse(data);
  return parsed.success ? parsed.data : FALLBACK;
}
