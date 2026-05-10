import { auth } from '../firebase';
import {
  COACH_INSIGHT_SCHEMA_VERSION,
  normalizeCoachInsight,
} from './coachInsightService';
import type { CoachInsight } from './coachInsightService';

// Basic in-memory cache
const cache = new Map<string, any>();

export interface AIResponseOptions {
  fallbackText?: string;
  fallbackData?: CoachInsight;
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
  cta?: string;

  constructor(message: string, code?: string, upgradeRequired?: boolean, cta?: string) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.upgradeRequired = upgradeRequired;
    this.cta = cta;
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
      fallbackData: options.fallbackData,
      cacheContext: options.cacheContext,
    }),
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) {
    throw new AIServiceError(
      data.error || 'Failed to generate coach opinion',
      data.code,
      Boolean(data.upgradeRequired),
      typeof data.cta === 'string' ? data.cta : undefined,
    );
  }

  const insight = normalizeCoachInsight(data.data, options.fallbackData);
  const response = {
    text: insight.summary || data.text || '',
    data: insight,
    provider: typeof data.provider === 'string' ? data.provider : 'unknown',
    cached: Boolean(data.cached),
    fallback: Boolean(data.fallback),
    schemaVersion: typeof data.schemaVersion === 'string' ? data.schemaVersion : COACH_INSIGHT_SCHEMA_VERSION,
  };
  cache.set(cacheKey, response);
  return response;
}
