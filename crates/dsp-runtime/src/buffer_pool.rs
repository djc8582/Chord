//! Pre-allocated buffer pool for the audio engine.
//!
//! All audio buffers are allocated at graph compile time, before audio starts.
//! The audio thread only reads/writes into existing slices — zero allocation.

use chord_audio_graph::BufferLayout;

/// A pool of pre-allocated audio buffers.
///
/// Created at engine startup based on [`BufferLayout`] from the graph compiler.
/// Each buffer holds `buffer_size` samples of `f32`. Buffers are assigned to
/// connections per the compiler's allocation plan.
#[derive(Debug)]
pub struct BufferPool {
    /// The actual buffer storage. `buffers[buffer_index][sample]`.
    buffers: Vec<Vec<f32>>,
    /// The size of each buffer in samples.
    buffer_size: usize,
}

impl BufferPool {
    /// Create a new buffer pool from a [`BufferLayout`] and buffer size.
    ///
    /// This allocates all buffers upfront. After this call, no further allocation
    /// is needed during audio processing.
    pub fn from_layout(layout: &BufferLayout, buffer_size: usize) -> Self {
        let num_buffers = layout.buffer_count.max(1);
        let buffers = (0..num_buffers)
            .map(|_| vec![0.0f32; buffer_size])
            .collect();
        Self {
            buffers,
            buffer_size,
        }
    }

    /// Create a buffer pool with a specific number of buffers.
    pub fn new(num_buffers: usize, buffer_size: usize) -> Self {
        let buffers = (0..num_buffers)
            .map(|_| vec![0.0f32; buffer_size])
            .collect();
        Self {
            buffers,
            buffer_size,
        }
    }

    /// Get a reference to a buffer by index.
    #[inline]
    pub fn get(&self, index: usize) -> &[f32] {
        &self.buffers[index]
    }

    /// Get a mutable reference to a buffer by index.
    #[inline]
    pub fn get_mut(&mut self, index: usize) -> &mut [f32] {
        &mut self.buffers[index]
    }

    /// Clear (zero out) all buffers.
    pub fn clear_all(&mut self) {
        for buf in &mut self.buffers {
            for s in buf.iter_mut() {
                *s = 0.0;
            }
        }
    }

    /// Clear a single buffer by index.
    #[inline]
    pub fn clear(&mut self, index: usize) {
        for s in self.buffers[index].iter_mut() {
            *s = 0.0;
        }
    }

    /// Return the number of buffers in the pool.
    pub fn count(&self) -> usize {
        self.buffers.len()
    }

    /// Return the buffer size (samples per buffer).
    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }

    /// Resize all buffers to a new buffer size. This allocates and should only
    /// be called off the audio thread.
    pub fn resize(&mut self, new_buffer_size: usize) {
        for buf in &mut self.buffers {
            buf.resize(new_buffer_size, 0.0);
        }
        self.buffer_size = new_buffer_size;
    }
}

impl Clone for BufferPool {
    fn clone(&self) -> Self {
        Self {
            buffers: self.buffers.clone(),
            buffer_size: self.buffer_size,
        }
    }
}

#[cfg(test)]
mod buffer_pool_tests {
    use super::*;
    use chord_audio_graph::{BufferIndex, ConnectionId};
    use std::collections::HashMap;

    #[test]
    fn test_from_layout() {
        let layout = BufferLayout {
            buffer_count: 4,
            assignments: {
                let mut m = HashMap::new();
                m.insert(ConnectionId(1), BufferIndex(0));
                m.insert(ConnectionId(2), BufferIndex(1));
                m.insert(ConnectionId(3), BufferIndex(2));
                m.insert(ConnectionId(4), BufferIndex(3));
                m
            },
        };
        let pool = BufferPool::from_layout(&layout, 256);
        assert_eq!(pool.count(), 4);
        assert_eq!(pool.buffer_size(), 256);
    }

    #[test]
    fn test_read_write() {
        let mut pool = BufferPool::new(2, 4);
        let buf = pool.get_mut(0);
        buf[0] = 1.0;
        buf[1] = 2.0;
        buf[2] = 3.0;
        buf[3] = 4.0;

        let buf = pool.get(0);
        assert_eq!(buf, &[1.0, 2.0, 3.0, 4.0]);
    }

    #[test]
    fn test_clear() {
        let mut pool = BufferPool::new(2, 4);
        pool.get_mut(0)[0] = 42.0;
        pool.get_mut(1)[0] = 99.0;

        pool.clear(0);
        assert_eq!(pool.get(0), &[0.0, 0.0, 0.0, 0.0]);
        assert_eq!(pool.get(1)[0], 99.0);

        pool.clear_all();
        assert_eq!(pool.get(1), &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_resize() {
        let mut pool = BufferPool::new(2, 4);
        pool.get_mut(0)[0] = 1.0;
        pool.resize(8);
        assert_eq!(pool.buffer_size(), 8);
        assert_eq!(pool.get(0).len(), 8);
        assert_eq!(pool.get(0)[0], 1.0); // data preserved
    }

    #[test]
    fn test_zero_allocation_during_access() {
        // After creation, get/get_mut should not allocate.
        let mut pool = BufferPool::new(4, 256);
        for i in 0..4 {
            let buf = pool.get_mut(i);
            for (j, s) in buf.iter_mut().enumerate() {
                *s = j as f32;
            }
        }
        for i in 0..4 {
            let buf = pool.get(i);
            for (j, s) in buf.iter().enumerate() {
                assert_eq!(*s, j as f32);
            }
        }
    }
}
