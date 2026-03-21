# dsp-runtime

> **Tier 1** — Depends on `audio-graph`. Start after Tier 0 completes.

## What This Is

The real-time audio processing engine. Takes a `CompiledGraph` from `audio-graph` and executes it on a dedicated real-time thread. This is the most critical crate in the entire project. If this is buggy, nothing else matters.

---

## HARD RULES — NEVER VIOLATE THESE

These rules apply to ALL code that runs on the audio thread (the `process()` call path). Claude Code must treat these as absolute constraints. If a design requires violating any of these, the design is wrong — find another way.

### Rule 1: ZERO ALLOCATION on the audio thread

```rust
// ❌ NEVER on the audio thread:
let v = Vec::new();              // heap allocation
let s = String::from("hello");   // heap allocation
let b = Box::new(42);            // heap allocation
some_vec.push(x);               // may reallocate
format!("value: {}", x);        // allocates a String
println!("debug");               // allocates, may block on I/O
collect::<Vec<_>>();             // allocates

// ✅ ALWAYS use pre-allocated buffers:
// All buffers allocated at graph compile time, before audio starts.
// Audio thread only reads/writes into existing slices.
buffer[i] = sample;              // write into pre-allocated
let x = buffer[i];               // read from pre-allocated
slice.copy_from_slice(other);    // copy between pre-allocated
```

**Verification:** In debug builds, replace the global allocator with one that panics if called from the audio thread. This catches violations immediately.

```rust
#[cfg(debug_assertions)]
mod alloc_guard {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::sync::atomic::{AtomicBool, Ordering};

    thread_local! {
        pub static ON_AUDIO_THREAD: AtomicBool = AtomicBool::new(false);
    }

    pub struct GuardedAllocator;

    unsafe impl GlobalAlloc for GuardedAllocator {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            ON_AUDIO_THREAD.with(|flag| {
                if flag.load(Ordering::Relaxed) {
                    panic!("ALLOCATION ON AUDIO THREAD! This is a real-time safety violation.");
                }
            });
            System.alloc(layout)
        }
        unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
            System.dealloc(ptr, layout)
        }
    }

    #[global_allocator]
    static A: GuardedAllocator = GuardedAllocator;
}
```

**This allocator guard MUST be implemented first, before any other code. Every test runs with it enabled.**

### Rule 2: ZERO LOCKING on the audio thread

```rust
// ❌ NEVER on the audio thread:
mutex.lock()                     // may block indefinitely
rwlock.read()                    // may block
channel.recv()                   // may block
condvar.wait()                   // blocks

// ✅ Use lock-free structures only:
atomic.load(Ordering::Relaxed)   // lock-free
atomic.store(value, Ordering::Relaxed)  // lock-free
ring_buffer.try_push(x)         // lock-free, fails if full
ring_buffer.try_pop()            // lock-free, returns None if empty
arc_swap.load()                  // lock-free pointer swap
```

**Communication pattern (main thread ↔ audio thread):**

```
Main thread                    Audio thread
     │                              │
     ├── parameter changes ──►  ring buffer ──► read at start of each buffer
     │                              │
     ◄── diagnostic data ───── ring buffer ◄── write at end of each buffer
     │                              │
     ├── new graph ──────────► AtomicPtr swap ─► pick up at buffer boundary
     │                              │
     ◄── old graph ──────────── returned for deallocation off audio thread
```

### Rule 3: ZERO BLOCKING on the audio thread

```rust
// ❌ NEVER on the audio thread:
file.read()                      // I/O blocks
file.write()                     // I/O blocks
thread::sleep()                  // blocks
network_call()                   // blocks
log::info!()                     // may block on I/O

// ✅ Audio thread only does:
// 1. Read input buffers
// 2. Execute nodes in order
// 3. Write output buffers
// 4. Push diagnostic data to ring buffer
// Nothing else.
```

### Rule 4: DENORMAL PROTECTION

Denormal (subnormal) floating-point values cause 10-100x CPU spikes in IIR filters and feedback loops. This is the #1 cause of mysterious CPU spikes in audio software.

```rust
// At the start of every audio callback:
#[cfg(target_arch = "x86_64")]
unsafe {
    use std::arch::x86_64::*;
    // Set Flush-To-Zero and Denormals-Are-Zero
    _mm_setcsr(_mm_getcsr() | 0x8040);
}

#[cfg(target_arch = "aarch64")]
// ARM64 flushes denormals by default in AArch64 — no action needed.
```

**Additionally:** Every filter and feedback node must add a tiny DC offset (1e-25) or use `if x.abs() < 1e-30 { 0.0 } else { x }` on its state variables after each sample.

### Rule 5: NaN/Inf PROPAGATION PREVENTION

A single NaN from any node will propagate through the entire graph and corrupt all audio. This must be caught at the source.

```rust
// After EVERY node's process() call:
fn sanitize_buffer(buffer: &mut [f32]) {
    for sample in buffer.iter_mut() {
        if !sample.is_finite() {
            *sample = 0.0;
            // Report to diagnostics (via lock-free flag)
        }
    }
}
```

**This check is NOT optional. It runs after every node in debug AND release builds.** The CPU cost is negligible (~1% for the check). The alternative — a NaN reaching the DAC — produces painful noise at max volume. This is a safety issue.

### Rule 6: BUFFER SIZE ASSUMPTIONS

Never assume a specific buffer size. Nodes must work correctly at any buffer size from 1 to 8192 samples.

```rust
// ❌ NEVER:
let buffer = [0.0f32; 512];     // hardcoded size
assert!(buffer.len() == 256);    // assumed size

// ✅ ALWAYS:
let buffer = &mut ctx.outputs[0][..ctx.buffer_size];  // use actual size
for i in 0..ctx.buffer_size { /* ... */ }              // iterate actual size
```

### Rule 7: SAMPLE RATE INDEPENDENCE

All time-dependent calculations must use the sample rate from ProcessContext. Never hardcode 44100 or 48000.

```rust
// ❌ NEVER:
let phase_inc = frequency / 44100.0;

// ✅ ALWAYS:
let phase_inc = frequency / ctx.sample_rate;
```

### Rule 8: PARAMETER SMOOTHING

Raw parameter changes cause clicks/pops (discontinuities in the signal). Every parameter that affects the audio signal must be smoothed.

```rust
pub struct SmoothedParam {
    current: f32,
    target: f32,
    step: f32,     // computed from smoothing time and sample rate
}

impl SmoothedParam {
    pub fn set_target(&mut self, value: f32) {
        self.target = value;
        self.step = (self.target - self.current) / SMOOTHING_SAMPLES as f32;
    }

    /// Call once per sample. Returns smoothed value.
    pub fn next(&mut self) -> f32 {
        if (self.current - self.target).abs() < 1e-7 {
            self.current = self.target;
        } else {
            self.current += self.step;
        }
        self.current
    }
}

// Default smoothing: 64 samples (~1.3ms at 48kHz)
// This is fast enough to feel responsive, slow enough to prevent clicks.
```

**Every `set_parameter()` goes through SmoothedParam. No exceptions.**

---

## PUBLIC API

```rust
pub struct AudioEngine {
    sample_rate: f64,
    buffer_size: usize,
}

impl AudioEngine {
    pub fn new(config: EngineConfig) -> Self;

    /// Swap in a new compiled graph. Lock-free (AtomicPtr swap).
    /// Old graph returned for deallocation on the calling thread.
    pub fn swap_graph(&self, graph: CompiledGraph) -> Option<CompiledGraph>;

    /// Register a node type. Called at startup, NOT on audio thread.
    pub fn register_node_type(&mut self, type_name: &str, factory: Box<dyn NodeFactory>);

    /// Set parameter. Lock-free (ring buffer push).
    pub fn set_parameter(&self, node_id: NodeId, param: &str, value: f64);

    /// Get current parameter value. Lock-free (atomic read).
    pub fn get_parameter(&self, node_id: NodeId, param: &str) -> Option<f64>;

    /// Subscribe to diagnostics. Called at startup.
    pub fn set_diagnostic_probe(&mut self, probe: Box<dyn DiagnosticProbe>);

    /// Called by audio-io in the audio callback.
    /// This is the hot path. Everything in here follows the HARD RULES.
    pub fn process(&mut self, input: &AudioBuffer, output: &mut AudioBuffer);

    /// Render offline (faster-than-real-time). Same processing, no clock.
    pub fn render_offline(&mut self, duration_samples: usize) -> Vec<AudioBuffer>;
}

pub trait AudioNode: Send + 'static {
    /// Process one buffer of audio. This runs on the audio thread.
    /// MUST follow all HARD RULES above.
    fn process(&mut self, ctx: &ProcessContext) -> ProcessResult;

    /// Reset internal state (called on transport stop/restart).
    fn reset(&mut self);

    /// Report latency in samples (for latency compensation).
    fn latency(&self) -> u32 { 0 }

    /// Report tail length in samples (reverb/delay tails).
    fn tail_length(&self) -> u32 { 0 }
}

pub struct ProcessContext<'a> {
    pub inputs: &'a [&'a [f32]],         // [port][sample]
    pub outputs: &'a mut [&'a mut [f32]], // [port][sample]
    pub parameters: &'a ParameterState,
    pub sample_rate: f64,
    pub buffer_size: usize,
    pub transport: &'a TransportState,
    pub midi_input: &'a [MidiMessage],
    pub midi_output: &'a mut Vec<MidiMessage>, // pre-allocated with capacity
}

pub struct EngineConfig {
    pub sample_rate: f64,
    pub buffer_size: usize,
    pub max_nodes: usize,          // pre-allocate capacity
    pub max_connections: usize,    // pre-allocate capacity
    pub parameter_ring_size: usize, // ring buffer capacity
    pub diagnostic_ring_size: usize,
    pub worker_threads: usize,     // for parallel graph execution
}
```

---

## IMPLEMENTATION CHECKLIST

Build in exactly this order. Each step must pass its tests before proceeding.

### Step 1: Allocation Guard
- [ ] Implement the debug allocator that panics on audio-thread allocation
- [ ] Write a test that intentionally allocates on the audio thread and verify it panics
- [ ] Write a test that processes audio without allocating and verify it passes

### Step 2: Buffer Pool
- [ ] Pre-allocated pool of audio buffers (f32 slices)
- [ ] Pool created at engine startup based on CompiledGraph.buffer_layout
- [ ] Buffers assigned to connections per the graph compiler's allocation plan
- [ ] Test: verify zero allocations during buffer acquisition and release

### Step 3: Parameter Ring Buffer
- [ ] Lock-free SPSC ring buffer for parameter updates (main → audio thread)
- [ ] SmoothedParam implementation with configurable smoothing time
- [ ] Test: set parameter from main thread, verify audio thread reads smoothed value
- [ ] Test: rapid parameter changes don't cause buffer overflow (ring wraps gracefully)

### Step 4: Graph Execution
- [ ] Execute nodes in topological order from CompiledGraph
- [ ] For each node: gather input buffers, call process(), sanitize output, push diagnostics
- [ ] Test: simple chain (sine osc → gain → output) produces expected audio
- [ ] Test: verify output is bit-exact between two runs with same input

### Step 5: Graph Hot-Swap
- [ ] AtomicPtr-based graph swap
- [ ] New graph prepared off audio thread (allocations happen here)
- [ ] Audio thread picks up new graph at start of next buffer
- [ ] Old graph returned to main thread for deallocation
- [ ] Test: swap graph mid-playback, verify no discontinuity in output (measure max sample-to-sample delta)

### Step 6: Multi-Core Execution
- [ ] Thread pool for parallel graph execution
- [ ] Independent branches from CompiledGraph.parallel_groups execute on separate threads
- [ ] Barrier synchronization between groups (lock-free spin barrier, NOT mutex)
- [ ] Test: parallel execution produces bit-exact same output as single-core
- [ ] Test: 500-node graph with 4 parallel branches uses multiple cores (verify via timing)

### Step 7: NaN/Denormal Protection
- [ ] FTZ/DAZ flags set at audio callback entry
- [ ] Sanitize buffer after every node
- [ ] Test: node that outputs NaN → next node receives silence, diagnostic reports it
- [ ] Test: IIR filter with near-zero input doesn't produce denormal CPU spike

### Step 8: Offline Rendering
- [ ] Same processing pipeline, loop instead of callback
- [ ] No CPAL dependency, just process() in a loop
- [ ] Test: offline render of 10-second sine wave matches real-time render (bit-exact)

### Step 9: Transport
- [ ] TransportState: playing, position, tempo, time signature
- [ ] Sample-accurate position tracking
- [ ] Tempo changes (instantaneous and ramped)
- [ ] Test: transport start/stop/restart with position tracking

---

## DEPENDENCIES

- `audio-graph` (Tier 0) — `CompiledGraph`, `NodeId`, `BufferLayout`, types

External crates (minimal):
- `crossbeam` — for lock-free ring buffers (or implement from scratch)
- `rayon` — NOT for audio thread (too many allocations). Only for offline rendering parallelism.

---

## TESTING STRATEGY

```bash
cargo test -p dsp-runtime
```

Every test runs with the allocation guard enabled. **A test that allocates on the audio thread is a failing test, even if the audio output is correct.**

### Critical Tests

```rust
#[test]
fn test_no_allocation_during_process() {
    // Enable allocation guard
    // Create engine with simple graph
    // Call process() 100 times
    // If we get here without panic, no allocations occurred
}

#[test]
fn test_nan_does_not_propagate() {
    // Create graph: NaNGenerator → Gain → Output
    // Process one buffer
    // Verify output is all zeros (not NaN)
    // Verify diagnostic reports NaN at NaNGenerator
}

#[test]
fn test_parameter_smoothing_no_clicks() {
    // Create graph: Oscillator → Gain → Output
    // Set gain from 0.0 to 1.0 mid-buffer
    // Process buffer
    // Verify no sample-to-sample delta exceeds threshold (no click)
}

#[test]
fn test_hot_swap_glitch_free() {
    // Create graph A: Oscillator(440Hz) → Output
    // Process 10 buffers
    // Swap to graph B: Oscillator(440Hz) → Gain(0.5) → Output
    // Process 10 more buffers
    // Analyze full output: no discontinuity at swap point
}

#[test]
fn test_500_nodes_within_budget() {
    // Create linear chain of 500 passthrough nodes
    // Measure process() time for one buffer (256 samples at 48kHz)
    // Assert < 5.3ms (buffer duration at 256/48000)
}

#[test]
fn test_parallel_execution_bit_exact() {
    // Create diamond graph: A → B, A → C, B → D, C → D
    // Process with 1 thread, capture output
    // Process with 4 threads, capture output
    // Assert bit-exact match
}

#[test]
fn test_denormal_protection() {
    // Create IIR filter with near-zero input (1e-38)
    // Process 1000 buffers
    // Measure CPU time per buffer
    // Assert no buffer takes >2x the average (denormal spike detection)
}
```

---

## DEFINITION OF DONE

- [ ] Allocation guard implemented and catches violations
- [ ] Zero allocations during process() verified by test
- [ ] Zero locks during process() verified by code review
- [ ] Simple chain produces correct audio
- [ ] Hot-swap is glitch-free (verified by discontinuity measurement)
- [ ] Parameter updates are lock-free and smoothed
- [ ] NaN caught and silenced at source
- [ ] Denormal protection active (FTZ/DAZ + filter guards)
- [ ] Parallel execution matches single-core output (bit-exact)
- [ ] Offline rendering matches real-time (bit-exact)
- [ ] 500-node graph processes within buffer deadline
- [ ] All tests pass with allocation guard enabled
- [ ] No `unsafe` without a `// SAFETY:` comment explaining why it's sound

---

## REFERENCE IMPLEMENTATIONS TO STUDY

If Claude Code needs guidance on real-time audio patterns, these are gold-standard references:

- **JUCE** (C++): AudioProcessor, AudioBuffer, MessageManager patterns
- **cpal** (Rust): Stream callback patterns
- **baseplug** (Rust): VST plugin framework, shows lock-free parameter handling
- **fundsp** (Rust): Functional DSP in Rust, good node processing patterns
- **dasp** (Rust): Digital audio signal processing types and conversions
- **ringbuf** (Rust): Lock-free ring buffer crate

The most common mistake in audio programming is treating the audio thread like a normal thread. It is not. It is a hard real-time context where any blocking, allocation, or lock will cause audible glitches. The rules above are not guidelines — they are invariants that must hold for every line of code on the audio thread.
