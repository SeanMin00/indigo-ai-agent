"use client";

import { useRef, useState, useCallback } from "react";

type UseAudioCaptureOptions = {
  onChunk: (base64: string) => void;
  sampleRate?: number;
  chunkIntervalMs?: number;
};

export function useAudioCapture({
  onChunk,
  sampleRate = 16000,
  chunkIntervalMs = 500,
}: UseAudioCaptureOptions) {
  const [capturing, setCapturing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return;

    const totalLength = bufferRef.current.reduce((sum, b) => sum + b.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of bufferRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    bufferRef.current = [];

    // Convert float32 → int16 PCM (Gemini Live requires 16-bit PCM 16kHz)
    const pcm = new Int16Array(merged.length);
    for (let i = 0; i < merged.length; i++) {
      const s = Math.max(-1, Math.min(1, merged[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Base64 encode
    const bytes = new Uint8Array(pcm.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    onChunk(btoa(binary));
  }, [onChunk]);

  const start = useCallback(async () => {
    if (capturing) return;
    setMicError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate, channelCount: 1, echoCancellation: true },
      });
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied — using demo mode"
          : `Microphone error: ${err instanceof Error ? err.message : String(err)}`;
      setMicError(msg);
      console.warn("[useAudioCapture]", msg);
      return;
    }
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate });
    contextRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const data = e.inputBuffer.getChannelData(0);
      bufferRef.current.push(new Float32Array(data));
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    intervalRef.current = setInterval(flush, chunkIntervalMs);
    setCapturing(true);
  }, [capturing, sampleRate, chunkIntervalMs, flush]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    flush();
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    bufferRef.current = [];
    setCapturing(false);
  }, [flush]);

  return { capturing, micError, start, stop };
}
