import { auth } from '../firebase';

let audioQueue: string[] = [];
let isPlaying = false;

export async function playAudioCue(text: string, voice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' = 'Kore') {
  audioQueue.push(text);
  if (!isPlaying) {
    processQueue(voice);
  }
}

async function processQueue(voice: string) {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const text = audioQueue.shift()!;

  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('Sign in before using AI audio cues.');
    }

    const response = await fetch('/api/audio-cue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voice }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate audio cue');
    }

    const base64Audio = data.audio;
    if (base64Audio) {
      const audioData = atob(base64Audio);
      const length = audioData.length;
      const arrayBuffer = new ArrayBuffer(length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < length; i++) {
        view[i] = audioData.charCodeAt(i);
      }

      // Gemini TTS returns raw 16-bit PCM at 24kHz
      const pcmLength = Math.floor(length / 2);
      const int16Data = new Int16Array(arrayBuffer, 0, pcmLength);
      const float32Data = new Float32Array(pcmLength);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        processQueue(voice);
      };

      source.start();
    } else {
      playSpeechSynthesisFallback(text, () => processQueue(voice));
    }
  } catch (error) {
    console.error("Failed to play audio cue:", error);
    playSpeechSynthesisFallback(text, () => processQueue(voice));
  }
}

function playSpeechSynthesisFallback(text: string, onDone: () => void) {
  if (!('speechSynthesis' in window)) {
    onDone();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  window.speechSynthesis.speak(utterance);
}
