/**
 * Tests for the Tauri IPC bridge types and structure.
 */

import { describe, it, expect } from "vitest";
import type { BridgeCommands, SignalStats, DiagnosticReport, ExportOptions } from "./types.js";
import { bridge } from "./bridge.js";

describe("bridge types", () => {
  it("bridge object implements all BridgeCommands methods", () => {
    // Verify the bridge object has every method from the interface
    const requiredMethods: (keyof BridgeCommands)[] = [
      "addNode",
      "removeNode",
      "connect",
      "disconnect",
      "setParameter",
      "play",
      "stop",
      "setTempo",
      "getSignalStats",
      "runDiagnostics",
      "loadPatch",
      "savePatch",
      "exportPatch",
    ];

    for (const method of requiredMethods) {
      expect(typeof bridge[method]).toBe("function");
    }
  });

  it("BridgeCommands methods return promises", () => {
    // Each method should return a Promise (they will reject in test env
    // because Tauri is not available, but the return type should be a Promise)
    const result = bridge.play();
    expect(result).toBeInstanceOf(Promise);
    // Suppress unhandled rejection in test
    result.catch(() => {});
  });

  it("SignalStats type structure is correct at compile time", () => {
    const stats: SignalStats = { peak: 0.5, rms: 0.3, clipping: false };
    expect(stats.peak).toBe(0.5);
    expect(stats.rms).toBe(0.3);
    expect(stats.clipping).toBe(false);
  });

  it("DiagnosticReport type structure is correct at compile time", () => {
    const report: DiagnosticReport = {
      cpu_usage: 12.5,
      buffer_underruns: 0,
      node_count: 10,
      sample_rate: 44100,
    };
    expect(report.cpu_usage).toBe(12.5);
    expect(report.sample_rate).toBe(44100);
  });

  it("ExportOptions type structure is correct at compile time", () => {
    const opts: ExportOptions = { optimize: true, target_sample_rate: 48000 };
    expect(opts.optimize).toBe(true);
    expect(opts.target_sample_rate).toBe(48000);

    // target_sample_rate is optional
    const minOpts: ExportOptions = { optimize: false };
    expect(minOpts.target_sample_rate).toBeUndefined();
  });
});
