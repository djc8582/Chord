import { describe, it, expect, beforeEach, vi } from "vitest";
import { MidiLearnSession } from "../midi-learn.js";
import { createMidiMessage, controlChange, noteOn } from "../midi-types.js";
import { resetMappingIdCounter } from "../controller-mapping.js";

beforeEach(() => {
  resetMappingIdCounter();
  vi.useFakeTimers();
});

describe("MidiLearnSession", () => {
  it("starts in idle state", () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    expect(session.state).toBe("idle");
    expect(session.result).toBeNull();
  });

  it("transitions to listening on start", () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    session.start(); // don't await — we're testing state
    expect(session.state).toBe("listening");
  });

  it("throws if started twice", () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    session.start();
    expect(() => session.start()).toThrow("Cannot start session");
  });

  it("captures a CC message and creates a mapping", async () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    const promise = session.start();

    const ccMsg = createMidiMessage(1000, controlChange(3, 74, 64));
    const consumed = session.feed(ccMsg);

    expect(consumed).toBe(true);
    expect(session.state).toBe("completed");

    const mapping = await promise;
    expect(mapping).not.toBeNull();
    expect(mapping!.midiChannel).toBe(3);
    expect(mapping!.midiCC).toBe(74);
    expect(mapping!.targetNodeId).toBe("n1");
    expect(mapping!.targetParam).toBe("freq");
    expect(session.result).toEqual(mapping);
  });

  it("ignores non-CC messages", () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    session.start();

    const noteMsg = createMidiMessage(1000, noteOn(0, 60, 100));
    const consumed = session.feed(noteMsg);

    expect(consumed).toBe(false);
    expect(session.state).toBe("listening");
  });

  it("ignores messages when not listening", () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    // still idle — not started
    const ccMsg = createMidiMessage(1000, controlChange(0, 1, 64));
    const consumed = session.feed(ccMsg);
    expect(consumed).toBe(false);
  });

  it("can be cancelled", async () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    const promise = session.start();

    session.cancel();

    const result = await promise;
    expect(result).toBeNull();
    expect(session.state).toBe("cancelled");
  });

  it("cancel is a no-op if not listening", () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    session.cancel(); // idle — no-op
    expect(session.state).toBe("idle");
  });

  it("times out after the specified duration", async () => {
    const session = new MidiLearnSession(
      { nodeId: "n1", param: "freq" },
      { timeoutMs: 5000 },
    );
    const promise = session.start();

    expect(session.state).toBe("listening");

    vi.advanceTimersByTime(5000);

    const result = await promise;
    expect(result).toBeNull();
    expect(session.state).toBe("timed-out");
  });

  it("does not time out if CC arrives before timeout", async () => {
    const session = new MidiLearnSession(
      { nodeId: "n1", param: "freq" },
      { timeoutMs: 5000 },
    );
    const promise = session.start();

    vi.advanceTimersByTime(2000);

    const ccMsg = createMidiMessage(2000, controlChange(0, 1, 64));
    session.feed(ccMsg);

    const result = await promise;
    expect(result).not.toBeNull();
    expect(session.state).toBe("completed");

    // Advancing past timeout should have no effect
    vi.advanceTimersByTime(10000);
    expect(session.state).toBe("completed");
  });

  it("uses target min/max/curve in the created mapping", async () => {
    const session = new MidiLearnSession({
      nodeId: "n1",
      param: "cutoff",
      min: 20,
      max: 20000,
      curve: "logarithmic",
    });
    const promise = session.start();

    session.feed(createMidiMessage(1000, controlChange(0, 74, 64)));

    const mapping = await promise;
    expect(mapping!.min).toBe(20);
    expect(mapping!.max).toBe(20000);
    expect(mapping!.curve).toBe("logarithmic");
  });

  it("only captures the first CC message", async () => {
    const session = new MidiLearnSession({ nodeId: "n1", param: "freq" });
    const promise = session.start();

    session.feed(createMidiMessage(1000, controlChange(0, 1, 64)));

    // Second CC should be ignored (session already completed)
    const consumed = session.feed(createMidiMessage(2000, controlChange(0, 2, 100)));
    expect(consumed).toBe(false);

    const mapping = await promise;
    expect(mapping!.midiCC).toBe(1); // first CC
  });
});
