/**
 * Resizable, collapsible panel component.
 */

import React, { useCallback, useRef, useState } from "react";
import { useShellStore } from "./store.js";
import { getTheme } from "./themes.js";
import type { PanelPosition } from "./types.js";

export interface PanelProps {
  id: string;
  title: string;
  position: PanelPosition;
  minSize: number;
  children?: React.ReactNode;
}

export function Panel({ id, title, position, minSize, children }: PanelProps) {
  const panel = useShellStore((s) => s.panels[id]);
  const setPanelSize = useShellStore((s) => s.setPanelSize);
  const collapsePanel = useShellStore((s) => s.collapsePanel);
  const expandPanel = useShellStore((s) => s.expandPanel);
  const themeMode = useShellStore((s) => s.theme);
  const theme = getTheme(themeMode);

  const resizing = useRef(false);
  const [hoverResize, setHoverResize] = useState(false);

  const isHorizontal = position === "left" || position === "right";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizing.current = true;

      const startPos = isHorizontal ? e.clientX : e.clientY;
      const startSize = panel?.size ?? minSize;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!resizing.current) return;
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
        let delta = currentPos - startPos;
        // For right/bottom panels, drag direction is inverted
        if (position === "right" || position === "bottom") delta = -delta;
        const newSize = Math.max(minSize, startSize + delta);
        setPanelSize(id, newSize);
      };

      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [id, isHorizontal, minSize, panel?.size, position, setPanelSize],
  );

  if (!panel || !panel.visible) return null;

  const collapsed = panel.collapsed;
  const displaySize = collapsed ? 32 : panel.size;

  // Determine flex direction for the resize handle position
  const resizeEdge: React.CSSProperties = isHorizontal
    ? {
        width: 4,
        height: "100%",
        cursor: "col-resize",
        ...(position === "left" ? { right: 0 } : { left: 0 }),
        top: 0,
      }
    : {
        height: 4,
        width: "100%",
        cursor: "row-resize",
        ...(position === "top" ? { bottom: 0 } : { top: 0 }),
        left: 0,
      };

  const sizeStyle: React.CSSProperties = isHorizontal
    ? { width: displaySize, minWidth: collapsed ? 32 : minSize, height: "100%" }
    : { height: displaySize, minHeight: collapsed ? 32 : minSize, width: "100%" };

  return (
    <div
      data-panel-id={id}
      style={{
        ...sizeStyle,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: theme.colors.bgPanel,
        borderLeft: position === "right" ? `3px solid ${theme.colors.border}` : undefined,
        borderRight: position === "left" ? `3px solid ${theme.colors.border}` : undefined,
        borderTop: position === "bottom" ? `3px solid ${theme.colors.border}` : undefined,
        borderBottom: position === "top" ? `3px solid ${theme.colors.border}` : undefined,
        borderRadius: 0,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          height: 28,
          minHeight: 28,
          background: "#c8ff00",
          borderBottom: "3px solid #000",
          borderRadius: position === "bottom" ? "0" : "0",
          fontSize: 11,
          fontWeight: 800,
          color: "#000",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          userSelect: "none",
          fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
        }}
      >
        <span>{title}</span>
        <button
          onClick={() => (collapsed ? expandPanel(id) : collapsePanel(id))}
          style={{
            background: "#000",
            border: "2px solid #000",
            borderRadius: 4,
            color: "#c8ff00",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 800,
            padding: "0 6px",
            lineHeight: 1,
          }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "+" : "\u2212"}
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {children}
        </div>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHoverResize(true)}
        onMouseLeave={() => setHoverResize(false)}
        style={{
          position: "absolute",
          ...resizeEdge,
          background: hoverResize ? theme.colors.accent : "transparent",
          zIndex: 10,
          transition: "background 0.15s",
        }}
      />
    </div>
  );
}
