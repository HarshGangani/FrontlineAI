import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is not set. Add it to your environment (e.g. .env.local) before starting the app."
  );
}

export const GEMINI_MODEL = "gemini-2.5-flash";

export const gemini = new GoogleGenAI({ apiKey });
