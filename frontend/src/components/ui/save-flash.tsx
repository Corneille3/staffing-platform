"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export type SaveFlashState = "idle" | "saving" | "saved";

/**
 * Feedback for controls that persist on change/blur with no Save button.
 * `start()` when the request fires, `succeed()` on 2xx (shows "Saved" then
 * auto-clears), `fail()` on error (clears — error copy stays the caller's job).
 */
export function useSaveFlash(holdMs = 2000): {
  state: SaveFlashState;
  start: () => void;
  succeed: () => void;
  fail: () => void;
} {
  const [state, setState] = useState<SaveFlashState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
  }, []);

  const succeed = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setState("saved");
    timer.current = setTimeout(() => setState("idle"), holdMs);
  }, [holdMs]);

  const fail = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setState("idle");
  }, []);

  return { state, start, succeed, fail };
}

export function SaveFlash({
  state,
  savingLabel = "Saving…",
  savedLabel = "Saved",
  style,
}: {
  state: SaveFlashState;
  savingLabel?: string;
  savedLabel?: string;
  style?: React.CSSProperties;
}) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", ...style }}>
        {savingLabel}
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 12,
        color: "var(--moss)",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Check size={13} /> {savedLabel}
    </span>
  );
}
