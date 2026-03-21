//! Buffer sanitization — NaN/Inf detection and denormal protection.
//!
//! These functions run after every node's `process()` call to prevent NaN/Inf
//! propagation through the audio graph. The CPU cost is negligible (~1%).
//! A NaN reaching the DAC produces painful noise at max volume — this is a safety issue.

/// Sanitize a buffer: replace any NaN or Infinity values with 0.0.
///
/// Returns the number of non-finite samples that were replaced.
/// This check runs after EVERY node in both debug and release builds.
#[inline]
pub fn sanitize_buffer(buffer: &mut [f32]) -> usize {
    let mut nan_count = 0;
    for sample in buffer.iter_mut() {
        if !sample.is_finite() {
            *sample = 0.0;
            nan_count += 1;
        }
    }
    nan_count
}

/// Apply denormal protection to a buffer.
///
/// Denormal (subnormal) floating-point values cause 10-100x CPU spikes in IIR filters
/// and feedback loops. This flushes any subnormal values to zero.
#[inline]
pub fn flush_denormals(buffer: &mut [f32]) {
    for sample in buffer.iter_mut() {
        if sample.is_subnormal() {
            *sample = 0.0;
        }
    }
}

/// Set the CPU's FTZ (Flush-To-Zero) and DAZ (Denormals-Are-Zero) flags.
///
/// This should be called at the start of every audio callback to prevent
/// denormal CPU spikes. On x86_64, this sets the MXCSR register bits.
/// On aarch64, denormals are flushed by default in AArch64 mode.
///
/// This function is a no-op if not on x86_64 or aarch64.
#[inline]
pub fn set_ftz_daz() {
    #[cfg(target_arch = "x86_64")]
    {
        // SAFETY: _mm_getcsr and _mm_setcsr are safe SSE intrinsics available on all x86_64.
        // Setting FTZ (bit 15) and DAZ (bit 6) is a standard operation for real-time audio.
        // These flags only affect the current thread's floating-point behavior.
        #[cfg(target_feature = "sse")]
        {
            use std::arch::x86_64::{_mm_getcsr, _mm_setcsr};
            // SAFETY: SSE is guaranteed available on x86_64.
            // FTZ = bit 15 (0x8000), DAZ = bit 6 (0x0040).
            let csr = unsafe { _mm_getcsr() };
            unsafe { _mm_setcsr(csr | 0x8040) };
        }
    }
    // aarch64 flushes denormals by default — no action needed.
}

#[cfg(test)]
mod sanitize_tests {
    use super::*;

    #[test]
    fn test_sanitize_clean_buffer() {
        let mut buf = vec![0.0f32, 0.5, -0.5, 1.0, -1.0];
        let count = sanitize_buffer(&mut buf);
        assert_eq!(count, 0);
        assert_eq!(buf, vec![0.0, 0.5, -0.5, 1.0, -1.0]);
    }

    #[test]
    fn test_sanitize_nan() {
        let mut buf = vec![0.5, f32::NAN, -0.5, f32::NAN, 1.0];
        let count = sanitize_buffer(&mut buf);
        assert_eq!(count, 2);
        assert_eq!(buf[0], 0.5);
        assert_eq!(buf[1], 0.0);
        assert_eq!(buf[2], -0.5);
        assert_eq!(buf[3], 0.0);
        assert_eq!(buf[4], 1.0);
    }

    #[test]
    fn test_sanitize_infinity() {
        let mut buf = vec![f32::INFINITY, f32::NEG_INFINITY, 0.5];
        let count = sanitize_buffer(&mut buf);
        assert_eq!(count, 2);
        assert_eq!(buf, vec![0.0, 0.0, 0.5]);
    }

    #[test]
    fn test_flush_denormals() {
        // f32::MIN_POSITIVE is the smallest normal; anything smaller (but > 0) is subnormal.
        let tiny = f32::from_bits(1); // smallest subnormal
        let mut buf = vec![tiny, 0.5, -tiny, 1.0];
        flush_denormals(&mut buf);
        assert_eq!(buf[0], 0.0);
        assert_eq!(buf[1], 0.5);
        assert_eq!(buf[2], 0.0);
        assert_eq!(buf[3], 1.0);
    }

    #[test]
    fn test_set_ftz_daz_does_not_panic() {
        // Just verify it doesn't crash.
        set_ftz_daz();
    }
}
