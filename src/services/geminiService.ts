import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Basic in-memory cache
const cache = new Map<string, any>();

export async function getCachedAIResponse(prompt: string, model: string = 'gemini-1.5-flash') {
  const cacheKey = `${model}:${prompt}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const response = await ai.models.generateContent({ model, contents: prompt });
  cache.set(cacheKey, response);
  return response;
}
