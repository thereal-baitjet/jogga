import { auth } from '../firebase';

// Basic in-memory cache
const cache = new Map<string, any>();

export async function getCachedAIResponse(prompt: string, model: string = 'gemini-1.5-flash') {
  const cacheKey = `${model}:${prompt}`;
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
    body: JSON.stringify({ prompt, model }),
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) {
    throw new Error(data.error || 'Failed to generate coach opinion');
  }

  const response = { text: data.text || '' };
  cache.set(cacheKey, response);
  return response;
}
