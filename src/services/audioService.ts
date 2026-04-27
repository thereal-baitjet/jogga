import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice as any },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
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
      processQueue(voice);
    }
  } catch (error) {
    console.error("Failed to play audio cue:", error);
    processQueue(voice);
  }
}
