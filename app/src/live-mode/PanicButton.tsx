/**
 * PanicButton
 *
 * Large, highly visible button for emergency all-notes-off and audio reset.
 * Designed for stage use: big tap target, red color, clear feedback.
 */

import React, { useCallback } from "react";
import { useLiveModeStore } from "./store.js";

export interface PanicButtonProps {
  /** Optional callback invoked when panic is triggered (e.g. to call bridge.stop). */
  onPanic?: () => void;
  /** Optional CSS class name. */
  className?: string;
}

export const PanicButton: React.FC<PanicButtonProps> = ({ onPanic, className }) => {
  const panic = useLiveModeStore((s) => s.panic);
  const clearPanic = useLiveModeStore((s) => s.clearPanic);
  const isPanicking = useLiveModeStore((s) => s.isPanicking);

  const handlePanic = useCallback(() => {
    panic();
    onPanic?.();
    // Auto-clear after a short delay to allow visual feedback
    setTimeout(() => {
      clearPanic();
    }, 1000);
  }, [panic, clearPanic, onPanic]);

  return (
    <button
      className={className}
      onClick={handlePanic}
      aria-label="Panic - All Notes Off"
      style={{
        minWidth: 80,
        minHeight: 56,
        padding: "12px 24px",
        fontSize: 18,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1,
        color: "#fff",
        backgroundColor: isPanicking ? "#fca5a5" : "#dc2626",
        border: "2px solid #991b1b",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background-color 0.15s ease",
        userSelect: "none",
      }}
    >
      {isPanicking ? "..." : "Panic"}
    </button>
  );
};
