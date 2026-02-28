import { createTypingKeepaliveLoop } from "./typing-lifecycle.js";

export type TypingCallbacks = {
  onReplyStart: () => Promise<void>;
  onIdle?: () => void;
  /** Called when the typing controller is cleaned up (e.g., on NO_REPLY). */
  onCleanup?: () => void;
};

export function createTypingCallbacks(params: {
  start: () => Promise<void>;
  stop?: () => Promise<void>;
  onStartError: (err: unknown) => void;
  onStopError?: (err: unknown) => void;
  keepaliveIntervalMs?: number;
}): TypingCallbacks {
  const stop = params.stop;
  const keepaliveIntervalMs = params.keepaliveIntervalMs ?? 3_000;
  let stopSent = false;
  // Track whether fireStop has been called so that an in-flight onReplyStart
  // (awaiting the async start() call) cannot restart the keepalive loop after
  // cleanup has already run.
  let stopped = false;

  const fireStart = async () => {
    try {
      await params.start();
    } catch (err) {
      params.onStartError(err);
    }
  };

  const keepaliveLoop = createTypingKeepaliveLoop({
    intervalMs: keepaliveIntervalMs,
    onTick: fireStart,
  });

  const onReplyStart = async () => {
    if (stopped) {
      return;
    }
    stopSent = false;
    keepaliveLoop.stop();
    await fireStart();
    // Guard again after the async fireStart — cleanup may have run while we were awaiting.
    if (!stopped) {
      keepaliveLoop.start();
    }
  };

  const fireStop = () => {
    stopped = true;
    keepaliveLoop.stop();
    if (!stop || stopSent) {
      return;
    }
    stopSent = true;
    void stop().catch((err) => (params.onStopError ?? params.onStartError)(err));
  };

  return { onReplyStart, onIdle: fireStop, onCleanup: fireStop };
}
