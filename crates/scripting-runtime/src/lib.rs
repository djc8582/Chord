//! Chord scripting runtime — expression evaluator and ExpressionNode.
//!
//! Provides a zero-allocation-at-runtime math expression evaluator for audio processing.
//! Expressions are parsed and compiled into an AST at construction time; during `process()`,
//! the tree is evaluated per-sample with no heap allocation.
//!
//! ## Supported syntax
//!
//! - Arithmetic: `+`, `-`, `*`, `/`
//! - Parentheses: `(expr)`
//! - Functions: `sin`, `cos`, `tan`, `abs`, `min`, `max`, `pow`, `sqrt`, `floor`, `ceil`,
//!   `clamp`, `log`, `exp`
//! - Conditionals: `if COND then A else B` (comparison operators: `<`, `>`, `<=`, `>=`, `==`, `!=`)
//! - Variables: `t` (time in seconds), `sr` (sample rate), `pi`, `tau`, `freq`, `in1`,
//!   `phase`, `param1`, `param2`
//!
//! ## Preset expressions
//!
//! Since parameters are f64-only, expression text is selected via a `preset` parameter (0-7).

use chord_dsp_runtime::{AudioNode, ProcessContext, ProcessResult, ProcessStatus};

// ============================================================================
// Tokenizer
// ============================================================================

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(f64),
    Ident(String),
    Plus,
    Minus,
    Star,
    Slash,
    LParen,
    RParen,
    Comma,
    Lt,
    Gt,
    Le,
    Ge,
    Eq,
    Ne,
    Eof,
}

struct Tokenizer {
    chars: Vec<char>,
    pos: usize,
}

impl Tokenizer {
    fn new(input: &str) -> Self {
        Self {
            chars: input.chars().collect(),
            pos: 0,
        }
    }

    fn peek_char(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn advance_char(&mut self) -> Option<char> {
        let ch = self.chars.get(self.pos).copied();
        if ch.is_some() {
            self.pos += 1;
        }
        ch
    }

    fn skip_whitespace(&mut self) {
        while let Some(ch) = self.peek_char() {
            if ch.is_whitespace() {
                self.advance_char();
            } else {
                break;
            }
        }
    }

    fn tokenize(&mut self) -> Vec<Token> {
        let mut tokens = Vec::new();
        loop {
            self.skip_whitespace();
            match self.peek_char() {
                None => {
                    tokens.push(Token::Eof);
                    break;
                }
                Some(ch) => match ch {
                    '+' => {
                        self.advance_char();
                        tokens.push(Token::Plus);
                    }
                    '-' => {
                        self.advance_char();
                        tokens.push(Token::Minus);
                    }
                    '*' => {
                        self.advance_char();
                        tokens.push(Token::Star);
                    }
                    '/' => {
                        self.advance_char();
                        tokens.push(Token::Slash);
                    }
                    '(' => {
                        self.advance_char();
                        tokens.push(Token::LParen);
                    }
                    ')' => {
                        self.advance_char();
                        tokens.push(Token::RParen);
                    }
                    ',' => {
                        self.advance_char();
                        tokens.push(Token::Comma);
                    }
                    '<' => {
                        self.advance_char();
                        if self.peek_char() == Some('=') {
                            self.advance_char();
                            tokens.push(Token::Le);
                        } else {
                            tokens.push(Token::Lt);
                        }
                    }
                    '>' => {
                        self.advance_char();
                        if self.peek_char() == Some('=') {
                            self.advance_char();
                            tokens.push(Token::Ge);
                        } else {
                            tokens.push(Token::Gt);
                        }
                    }
                    '=' => {
                        self.advance_char();
                        if self.peek_char() == Some('=') {
                            self.advance_char();
                        }
                        tokens.push(Token::Eq);
                    }
                    '!' => {
                        self.advance_char();
                        if self.peek_char() == Some('=') {
                            self.advance_char();
                            tokens.push(Token::Ne);
                        } else {
                            // Lone '!' is not supported; treat as error — skip it.
                            continue;
                        }
                    }
                    _ if ch.is_ascii_digit() || ch == '.' => {
                        tokens.push(self.read_number());
                    }
                    _ if ch.is_ascii_alphabetic() || ch == '_' => {
                        tokens.push(self.read_ident());
                    }
                    _ => {
                        // Unknown character, skip
                        self.advance_char();
                    }
                },
            }
        }
        tokens
    }

    fn read_number(&mut self) -> Token {
        let mut s = String::new();
        let mut has_dot = false;
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_digit() {
                s.push(ch);
                self.advance_char();
            } else if ch == '.' && !has_dot {
                has_dot = true;
                s.push(ch);
                self.advance_char();
            } else {
                break;
            }
        }
        Token::Number(s.parse::<f64>().unwrap_or(0.0))
    }

    fn read_ident(&mut self) -> Token {
        let mut s = String::new();
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_alphanumeric() || ch == '_' {
                s.push(ch);
                self.advance_char();
            } else {
                break;
            }
        }
        Token::Ident(s)
    }
}

// ============================================================================
// AST
// ============================================================================

/// A compiled expression tree node. Fully owned, no references — can live in
/// the AudioNode struct across process() calls.
#[derive(Debug, Clone)]
enum Expr {
    /// Literal constant.
    Literal(f64),
    /// Variable lookup.
    Var(VarId),
    /// Unary negation.
    Negate(Box<Expr>),
    /// Binary arithmetic: +, -, *, /
    BinOp(BinOpKind, Box<Expr>, Box<Expr>),
    /// Function call with 1 argument.
    Func1(Func1Kind, Box<Expr>),
    /// Function call with 2 arguments.
    Func2(Func2Kind, Box<Expr>, Box<Expr>),
    /// Function call with 3 arguments (clamp).
    Func3(Func3Kind, Box<Expr>, Box<Expr>, Box<Expr>),
    /// Conditional: if cond then a else b.
    IfThenElse(CompareOp, Box<Expr>, Box<Expr>, Box<Expr>, Box<Expr>),
}

#[derive(Debug, Clone, Copy)]
enum VarId {
    T,
    Sr,
    Pi,
    Tau,
    Freq,
    In1,
    Phase,
    Param1,
    Param2,
}

#[derive(Debug, Clone, Copy)]
enum BinOpKind {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Debug, Clone, Copy)]
enum Func1Kind {
    Sin,
    Cos,
    Tan,
    Abs,
    Sqrt,
    Floor,
    Ceil,
    Log,
    Exp,
}

#[derive(Debug, Clone, Copy)]
enum Func2Kind {
    Min,
    Max,
    Pow,
}

#[derive(Debug, Clone, Copy)]
enum Func3Kind {
    Clamp,
}

#[derive(Debug, Clone, Copy)]
enum CompareOp {
    Lt,
    Gt,
    Le,
    Ge,
    Eq,
    Ne,
}

/// Runtime variable context — passed by value, no allocation.
#[derive(Debug, Clone, Copy)]
struct EvalContext {
    t: f64,
    sr: f64,
    freq: f64,
    in1: f64,
    phase: f64,
    param1: f64,
    param2: f64,
}

impl Expr {
    /// Evaluate the expression tree. Zero allocation — pure stack computation.
    #[inline]
    fn eval(&self, ctx: &EvalContext) -> f64 {
        match self {
            Expr::Literal(v) => *v,
            Expr::Var(var) => match var {
                VarId::T => ctx.t,
                VarId::Sr => ctx.sr,
                VarId::Pi => std::f64::consts::PI,
                VarId::Tau => std::f64::consts::TAU,
                VarId::Freq => ctx.freq,
                VarId::In1 => ctx.in1,
                VarId::Phase => ctx.phase,
                VarId::Param1 => ctx.param1,
                VarId::Param2 => ctx.param2,
            },
            Expr::Negate(inner) => -inner.eval(ctx),
            Expr::BinOp(op, lhs, rhs) => {
                let l = lhs.eval(ctx);
                let r = rhs.eval(ctx);
                match op {
                    BinOpKind::Add => l + r,
                    BinOpKind::Sub => l - r,
                    BinOpKind::Mul => l * r,
                    BinOpKind::Div => {
                        if r.abs() < 1e-30 {
                            0.0
                        } else {
                            l / r
                        }
                    }
                }
            }
            Expr::Func1(func, arg) => {
                let a = arg.eval(ctx);
                match func {
                    Func1Kind::Sin => a.sin(),
                    Func1Kind::Cos => a.cos(),
                    Func1Kind::Tan => a.tan(),
                    Func1Kind::Abs => a.abs(),
                    Func1Kind::Sqrt => a.max(0.0).sqrt(),
                    Func1Kind::Floor => a.floor(),
                    Func1Kind::Ceil => a.ceil(),
                    Func1Kind::Log => a.max(1e-30).ln(),
                    Func1Kind::Exp => a.exp(),
                }
            }
            Expr::Func2(func, a, b) => {
                let av = a.eval(ctx);
                let bv = b.eval(ctx);
                match func {
                    Func2Kind::Min => av.min(bv),
                    Func2Kind::Max => av.max(bv),
                    Func2Kind::Pow => av.powf(bv),
                }
            }
            Expr::Func3(func, a, b, c) => {
                let av = a.eval(ctx);
                let bv = b.eval(ctx);
                let cv = c.eval(ctx);
                match func {
                    Func3Kind::Clamp => av.clamp(bv, cv),
                }
            }
            Expr::IfThenElse(op, lhs, rhs, then_expr, else_expr) => {
                let l = lhs.eval(ctx);
                let r = rhs.eval(ctx);
                let cond = match op {
                    CompareOp::Lt => l < r,
                    CompareOp::Gt => l > r,
                    CompareOp::Le => l <= r,
                    CompareOp::Ge => l >= r,
                    CompareOp::Eq => (l - r).abs() < 1e-10,
                    CompareOp::Ne => (l - r).abs() >= 1e-10,
                };
                if cond {
                    then_expr.eval(ctx)
                } else {
                    else_expr.eval(ctx)
                }
            }
        }
    }
}

// ============================================================================
// Parser — recursive descent
// ============================================================================

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self) -> &Token {
        self.tokens.get(self.pos).unwrap_or(&Token::Eof)
    }

    fn advance(&mut self) -> Token {
        let tok = self.tokens.get(self.pos).cloned().unwrap_or(Token::Eof);
        self.pos += 1;
        tok
    }

    fn expect_ident(&mut self, name: &str) -> bool {
        if let Token::Ident(ref s) = self.peek() {
            if s == name {
                self.advance();
                return true;
            }
        }
        false
    }

    /// Parse a complete expression.
    fn parse_expr(&mut self) -> Expr {
        // Check for `if ... then ... else ...`
        if let Token::Ident(ref s) = self.peek() {
            if s == "if" {
                return self.parse_if();
            }
        }
        self.parse_additive()
    }

    fn parse_if(&mut self) -> Expr {
        // Consume 'if'
        self.advance();
        // Parse the left side of the comparison
        let lhs = self.parse_additive();
        // Parse comparison operator
        let op = match self.peek() {
            Token::Lt => CompareOp::Lt,
            Token::Gt => CompareOp::Gt,
            Token::Le => CompareOp::Le,
            Token::Ge => CompareOp::Ge,
            Token::Eq => CompareOp::Eq,
            Token::Ne => CompareOp::Ne,
            _ => CompareOp::Gt, // default fallback
        };
        self.advance(); // consume the comparison operator
        let rhs = self.parse_additive();
        // Expect 'then'
        self.expect_ident("then");
        let then_expr = self.parse_additive();
        // Expect 'else'
        self.expect_ident("else");
        let else_expr = self.parse_additive();
        Expr::IfThenElse(op, Box::new(lhs), Box::new(rhs), Box::new(then_expr), Box::new(else_expr))
    }

    fn parse_additive(&mut self) -> Expr {
        let mut left = self.parse_multiplicative();
        loop {
            match self.peek() {
                Token::Plus => {
                    self.advance();
                    let right = self.parse_multiplicative();
                    left = Expr::BinOp(BinOpKind::Add, Box::new(left), Box::new(right));
                }
                Token::Minus => {
                    self.advance();
                    let right = self.parse_multiplicative();
                    left = Expr::BinOp(BinOpKind::Sub, Box::new(left), Box::new(right));
                }
                _ => break,
            }
        }
        left
    }

    fn parse_multiplicative(&mut self) -> Expr {
        let mut left = self.parse_unary();
        loop {
            match self.peek() {
                Token::Star => {
                    self.advance();
                    let right = self.parse_unary();
                    left = Expr::BinOp(BinOpKind::Mul, Box::new(left), Box::new(right));
                }
                Token::Slash => {
                    self.advance();
                    let right = self.parse_unary();
                    left = Expr::BinOp(BinOpKind::Div, Box::new(left), Box::new(right));
                }
                _ => break,
            }
        }
        left
    }

    fn parse_unary(&mut self) -> Expr {
        if *self.peek() == Token::Minus {
            self.advance();
            let inner = self.parse_primary();
            return Expr::Negate(Box::new(inner));
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Expr {
        match self.advance() {
            Token::Number(n) => Expr::Literal(n),
            Token::LParen => {
                let inner = self.parse_expr();
                // Consume RParen if present
                if *self.peek() == Token::RParen {
                    self.advance();
                }
                inner
            }
            Token::Ident(name) => {
                // Check if it's a function call (followed by '(')
                if *self.peek() == Token::LParen {
                    return self.parse_function_call(&name);
                }
                // Otherwise it's a variable
                match name.as_str() {
                    "t" => Expr::Var(VarId::T),
                    "sr" => Expr::Var(VarId::Sr),
                    "pi" => Expr::Var(VarId::Pi),
                    "tau" => Expr::Var(VarId::Tau),
                    "freq" => Expr::Var(VarId::Freq),
                    "in1" => Expr::Var(VarId::In1),
                    "phase" => Expr::Var(VarId::Phase),
                    "param1" => Expr::Var(VarId::Param1),
                    "param2" => Expr::Var(VarId::Param2),
                    // Unknown variable — treat as 0
                    _ => Expr::Literal(0.0),
                }
            }
            // Fallback: return 0
            _ => Expr::Literal(0.0),
        }
    }

    fn parse_function_call(&mut self, name: &str) -> Expr {
        // Consume '('
        self.advance();
        let arg1 = self.parse_expr();

        match name {
            // 1-argument functions
            "sin" | "cos" | "tan" | "abs" | "sqrt" | "floor" | "ceil" | "log" | "exp" => {
                if *self.peek() == Token::RParen {
                    self.advance();
                }
                let kind = match name {
                    "sin" => Func1Kind::Sin,
                    "cos" => Func1Kind::Cos,
                    "tan" => Func1Kind::Tan,
                    "abs" => Func1Kind::Abs,
                    "sqrt" => Func1Kind::Sqrt,
                    "floor" => Func1Kind::Floor,
                    "ceil" => Func1Kind::Ceil,
                    "log" => Func1Kind::Log,
                    "exp" => Func1Kind::Exp,
                    _ => unreachable!(),
                };
                Expr::Func1(kind, Box::new(arg1))
            }
            // 2-argument functions
            "min" | "max" | "pow" => {
                // Consume ','
                if *self.peek() == Token::Comma {
                    self.advance();
                }
                let arg2 = self.parse_expr();
                if *self.peek() == Token::RParen {
                    self.advance();
                }
                let kind = match name {
                    "min" => Func2Kind::Min,
                    "max" => Func2Kind::Max,
                    "pow" => Func2Kind::Pow,
                    _ => unreachable!(),
                };
                Expr::Func2(kind, Box::new(arg1), Box::new(arg2))
            }
            // 3-argument functions
            "clamp" => {
                if *self.peek() == Token::Comma {
                    self.advance();
                }
                let arg2 = self.parse_expr();
                if *self.peek() == Token::Comma {
                    self.advance();
                }
                let arg3 = self.parse_expr();
                if *self.peek() == Token::RParen {
                    self.advance();
                }
                Expr::Func3(Func3Kind::Clamp, Box::new(arg1), Box::new(arg2), Box::new(arg3))
            }
            // Unknown function — treat as identity
            _ => {
                if *self.peek() == Token::RParen {
                    self.advance();
                }
                arg1
            }
        }
    }
}

// ============================================================================
// Public API: compile an expression string into an Expr tree
// ============================================================================

/// Compile an expression string into an evaluable AST.
///
/// This performs all allocation (tokenization, tree construction). The returned
/// `Expr` can then be evaluated per-sample with zero allocation via `eval()`.
fn compile_expression(source: &str) -> Expr {
    let mut tokenizer = Tokenizer::new(source);
    let tokens = tokenizer.tokenize();
    let mut parser = Parser::new(tokens);
    parser.parse_expr()
}

// ============================================================================
// Preset expressions
// ============================================================================

/// Returns the expression source for a given preset index (0-7).
fn preset_expression(index: u32) -> &'static str {
    match index {
        0 => "sin(phase * tau)",
        1 => "phase * 2 - 1",
        2 => "if phase < 0.5 then 1 else -1",
        3 => "sin(phase * tau) * sin(phase * tau * param1 * 8)",
        4 => "sin(phase * tau + sin(phase * tau * 3) * param1 * 5)",
        5 => "(sin(phase * tau) + sin(phase * tau * 2) * 0.5 + sin(phase * tau * 3) * 0.25) * 0.5",
        6 => "sin(phase * tau) * exp(-t * param1 * 10)",
        7 => "in1 * sin(phase * tau * param1 * 4)",
        _ => "sin(phase * tau)",
    }
}

// ============================================================================
// ExpressionNode — implements AudioNode
// ============================================================================

/// A math expression audio node.
///
/// Evaluates a compiled expression tree per-sample to generate or process audio.
/// The expression is selected via the `preset` parameter (0-7), and re-compiled
/// only when the preset changes.
///
/// ## Parameters
/// - `preset` — Expression preset index (0-7, default 0).
/// - `freq` — Base frequency in Hz (default 440.0).
/// - `param1` — User parameter 1 (0-1, default 0.5).
/// - `param2` — User parameter 2 (0-1, default 0.5).
///
/// ## Inputs
/// - `[0]` — Audio input (`in1` variable).
///
/// ## Outputs
/// - `[0]` — Audio output (expression result, clamped to [-1, 1]).
pub struct ExpressionNode {
    /// The compiled expression tree.
    expr: Expr,
    /// Current phase (0..1), auto-incrementing at `freq` Hz.
    phase: f64,
    /// Cumulative time in seconds since reset.
    time: f64,
    /// The currently active preset index, to detect changes.
    current_preset: u32,
}

impl ExpressionNode {
    /// Create a new ExpressionNode with the default preset (sine wave).
    pub fn new() -> Self {
        let expr = compile_expression(preset_expression(0));
        Self {
            expr,
            phase: 0.0,
            time: 0.0,
            current_preset: 0,
        }
    }
}

impl Default for ExpressionNode {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioNode for ExpressionNode {
    fn process(&mut self, ctx: &mut ProcessContext) -> ProcessResult {
        let freq = ctx.parameters.get("freq").unwrap_or(440.0) as f64;
        let param1 = ctx.parameters.get("param1").unwrap_or(0.5) as f64;
        let param2 = ctx.parameters.get("param2").unwrap_or(0.5) as f64;
        let preset_raw = ctx.parameters.get("preset").unwrap_or(0.0) as u32;

        // Recompile expression if preset changed.
        // This allocation is acceptable because it only happens on parameter change,
        // not per-sample. In production, we'd use a lock-free swap, but for the
        // preset-based approach this is a rare event.
        if preset_raw != self.current_preset {
            self.current_preset = preset_raw;
            self.expr = compile_expression(preset_expression(preset_raw));
        }

        let sr = ctx.sample_rate;
        let has_input = !ctx.inputs.is_empty();

        if ctx.outputs.is_empty() {
            return Ok(ProcessStatus::Ok);
        }

        let output = &mut ctx.outputs[0];

        let phase_inc = freq / sr;

        for i in 0..ctx.buffer_size {
            let in1 = if has_input { ctx.inputs[0][i] as f64 } else { 0.0 };

            let eval_ctx = EvalContext {
                t: self.time,
                sr,
                freq,
                in1,
                phase: self.phase,
                param1,
                param2,
            };

            let sample = self.expr.eval(&eval_ctx);

            // Clamp output to [-1, 1] to prevent blowups.
            let clamped = sample.clamp(-1.0, 1.0);
            output[i] = clamped as f32;

            // Advance phase.
            self.phase += phase_inc;
            self.phase -= self.phase.floor();

            // Advance time.
            self.time += 1.0 / sr;
        }

        Ok(ProcessStatus::Ok)
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.time = 0.0;
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_literal() {
        let expr = compile_expression("42.5");
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        assert!((expr.eval(&ctx) - 42.5).abs() < 1e-10);
    }

    #[test]
    fn test_variables() {
        let expr = compile_expression("t");
        let ctx = EvalContext {
            t: 1.5,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        assert!((expr.eval(&ctx) - 1.5).abs() < 1e-10);
    }

    #[test]
    fn test_pi_tau() {
        let expr = compile_expression("pi");
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        assert!((expr.eval(&ctx) - std::f64::consts::PI).abs() < 1e-10);

        let expr2 = compile_expression("tau");
        assert!((expr2.eval(&ctx) - std::f64::consts::TAU).abs() < 1e-10);
    }

    #[test]
    fn test_arithmetic() {
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };

        let expr = compile_expression("2 + 3 * 4");
        assert!((expr.eval(&ctx) - 14.0).abs() < 1e-10);

        let expr2 = compile_expression("(2 + 3) * 4");
        assert!((expr2.eval(&ctx) - 20.0).abs() < 1e-10);

        let expr3 = compile_expression("10 / 2 - 1");
        assert!((expr3.eval(&ctx) - 4.0).abs() < 1e-10);
    }

    #[test]
    fn test_functions() {
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };

        let expr = compile_expression("sin(0)");
        assert!(expr.eval(&ctx).abs() < 1e-10);

        let expr2 = compile_expression("cos(0)");
        assert!((expr2.eval(&ctx) - 1.0).abs() < 1e-10);

        let expr3 = compile_expression("abs(-5)");
        assert!((expr3.eval(&ctx) - 5.0).abs() < 1e-10);

        let expr4 = compile_expression("sqrt(16)");
        assert!((expr4.eval(&ctx) - 4.0).abs() < 1e-10);

        let expr5 = compile_expression("min(3, 7)");
        assert!((expr5.eval(&ctx) - 3.0).abs() < 1e-10);

        let expr6 = compile_expression("max(3, 7)");
        assert!((expr6.eval(&ctx) - 7.0).abs() < 1e-10);

        let expr7 = compile_expression("pow(2, 10)");
        assert!((expr7.eval(&ctx) - 1024.0).abs() < 1e-10);

        let expr8 = compile_expression("floor(3.7)");
        assert!((expr8.eval(&ctx) - 3.0).abs() < 1e-10);

        let expr9 = compile_expression("ceil(3.2)");
        assert!((expr9.eval(&ctx) - 4.0).abs() < 1e-10);

        let expr10 = compile_expression("clamp(5, 0, 1)");
        assert!((expr10.eval(&ctx) - 1.0).abs() < 1e-10);

        let expr11 = compile_expression("clamp(-2, 0, 1)");
        assert!((expr11.eval(&ctx) - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_negation() {
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };

        let expr = compile_expression("-5");
        assert!((expr.eval(&ctx) - (-5.0)).abs() < 1e-10);

        let expr2 = compile_expression("-phase");
        assert!(expr2.eval(&ctx).abs() < 1e-10); // phase is 0
    }

    #[test]
    fn test_if_then_else() {
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.3,
            param1: 0.5,
            param2: 0.5,
        };

        // phase (0.3) < 0.5, so should return 1
        let expr = compile_expression("if phase < 0.5 then 1 else -1");
        assert!((expr.eval(&ctx) - 1.0).abs() < 1e-10);

        // phase = 0.7 > 0.5, should return -1
        let ctx2 = EvalContext { phase: 0.7, ..ctx };
        assert!((expr.eval(&ctx2) - (-1.0)).abs() < 1e-10);
    }

    #[test]
    fn test_preset_0_sine() {
        let expr = compile_expression(preset_expression(0));
        // At phase = 0.25, sin(0.25 * tau) = sin(pi/2) = 1.0
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.25,
            param1: 0.5,
            param2: 0.5,
        };
        assert!((expr.eval(&ctx) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_preset_1_saw() {
        let expr = compile_expression(preset_expression(1));
        // phase * 2 - 1: at phase=0 -> -1, at phase=0.5 -> 0, at phase=1 -> 1
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        assert!((expr.eval(&ctx) - (-1.0)).abs() < 1e-10);

        let ctx2 = EvalContext { phase: 0.5, ..ctx };
        assert!(expr.eval(&ctx2).abs() < 1e-10);

        let ctx3 = EvalContext { phase: 1.0, ..ctx };
        assert!((expr.eval(&ctx3) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_preset_2_square() {
        let expr = compile_expression(preset_expression(2));
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.3,
            param1: 0.5,
            param2: 0.5,
        };
        assert!((expr.eval(&ctx) - 1.0).abs() < 1e-10);

        let ctx2 = EvalContext { phase: 0.7, ..ctx };
        assert!((expr.eval(&ctx2) - (-1.0)).abs() < 1e-10);
    }

    #[test]
    fn test_division_by_zero() {
        let expr = compile_expression("1 / 0");
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        // Should return 0, not panic or produce infinity
        assert!(expr.eval(&ctx).is_finite());
    }

    #[test]
    fn test_nested_functions() {
        let expr = compile_expression("sin(cos(0))");
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        // cos(0) = 1.0, sin(1.0) ~ 0.8414709848
        assert!((expr.eval(&ctx) - 1.0_f64.sin()).abs() < 1e-10);
    }

    #[test]
    fn test_complex_expression() {
        // Test preset 4: FM synthesis
        let expr = compile_expression(preset_expression(4));
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        // At phase=0: sin(0 + sin(0) * 0.5 * 5) = sin(0) = 0
        assert!(expr.eval(&ctx).abs() < 1e-10);
    }

    #[test]
    fn test_all_presets_compile() {
        let ctx = EvalContext {
            t: 0.1,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.5,
            phase: 0.3,
            param1: 0.5,
            param2: 0.5,
        };
        for i in 0..8 {
            let expr = compile_expression(preset_expression(i));
            let val = expr.eval(&ctx);
            assert!(val.is_finite(), "preset {i} produced non-finite value: {val}");
        }
    }

    #[test]
    fn test_exp_function() {
        let expr = compile_expression("exp(0)");
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        assert!((expr.eval(&ctx) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_log_function() {
        let expr = compile_expression("log(1)");
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.0,
            param1: 0.5,
            param2: 0.5,
        };
        assert!(expr.eval(&ctx).abs() < 1e-10);
    }

    #[test]
    fn test_comparison_operators() {
        let ctx = EvalContext {
            t: 0.0,
            sr: 48000.0,
            freq: 440.0,
            in1: 0.0,
            phase: 0.5,
            param1: 0.5,
            param2: 0.5,
        };

        // Test <=
        let expr = compile_expression("if phase <= 0.5 then 1 else 0");
        assert!((expr.eval(&ctx) - 1.0).abs() < 1e-10);

        // Test >=
        let expr2 = compile_expression("if phase >= 0.5 then 1 else 0");
        assert!((expr2.eval(&ctx) - 1.0).abs() < 1e-10);

        // Test ==
        let expr3 = compile_expression("if phase == 0.5 then 1 else 0");
        assert!((expr3.eval(&ctx) - 1.0).abs() < 1e-10);

        // Test !=
        let expr4 = compile_expression("if phase != 0.5 then 1 else 0");
        assert!((expr4.eval(&ctx) - 0.0).abs() < 1e-10);
    }
}
