import { auth } from '../firebase';

// Basic in-memory cache
const cache = new Map<string, any>();

export interface AIResponseOptions {
  fallbackText?: string;
  cacheContext?: {
    questionType?: string;
    readinessScore?: number | string;
    todayWorkoutId?: string;
    recentWorkoutSummary?: string;
  };
}

export class AIServiceError extends Error {
  code?: string;
  upgradeRequired?: boolean;

  constructor(message: string, code?: string, upgradeRequired?: boolean) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.upgradeRequired = upgradeRequired;
  }
}

export async function getCachedAIResponse(
  prompt: string,
  model: string = 'gemini-1.5-flash',
  options: AIResponseOptions = {},
) {
  const cacheKey = `${model}:${prompt}:${JSON.stringify(options.cacheContext || {})}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Sign in before using AI coaching.');
  }

  const apiResponse = await fetch('/api/coach-opinion', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      model,
      fallbackText: options.fallbackText,
      cacheContext: options.cacheContext,
    }),
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) {
    throw new AIServiceError(
      data.error || 'Failed to generate coach opinion',
      data.code,
      Boolean(data.upgradeRequired),
    );
  }

  const response = { text: data.text || '' };
  cache.set(cacheKey, response);
  return response;
}
