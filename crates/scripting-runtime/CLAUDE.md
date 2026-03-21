# scripting-runtime

> **Tier 2** — Depends on `dsp-runtime`.

## What This Is

Execution environment for Expression nodes, Code nodes, and Script nodes. Compiles math expressions to native code, embeds FAUST compiler, and provides sandboxed JS/Python for non-real-time scripting.

## Public API

```rust
pub struct ExpressionCompiler;
impl ExpressionCompiler {
    pub fn compile(expression: &str, inputs: &[&str]) -> Result<CompiledExpression>;
}

pub struct CompiledExpression; // implements AudioNode
// Zero overhead — compiles to native via cranelift or similar

pub struct FaustCompiler;
impl FaustCompiler {
    pub fn compile(code: &str) -> Result<Box<dyn AudioNode>>;
}

pub struct ScriptEngine; // JS/Python, non-real-time
impl ScriptEngine {
    pub fn new(language: ScriptLanguage) -> Self;
    pub fn execute(&mut self, code: &str, context: &ScriptContext) -> Result<ScriptOutput>;
}
```

## Dependencies
- `dsp-runtime` (Tier 1) — AudioNode trait

## Definition of Done
- [ ] Expression "sin(in1 * 6.283 * 440.0)" produces 440Hz sine
- [ ] Expression compiler has zero per-sample overhead vs hand-written
- [ ] Code node hot-reloads on save without glitch
- [ ] Script node executes JS and emits MIDI events
