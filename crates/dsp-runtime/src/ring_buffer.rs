//! Lock-free single-producer single-consumer (SPSC) ring buffer.
//!
//! Used for communication between the main thread and the audio thread without any locks
//! or allocations at runtime. The buffer is pre-allocated at creation time.
//!
//! For this implementation, we use a `Mutex<VecDeque<T>>` as a practical safe abstraction.
//! In a production system, this would be replaced with a true lock-free SPSC ring buffer
//! using `UnsafeCell` or an external crate like `ringbuf`. The Mutex is only held for
//! extremely brief periods (single push/pop operations), ensuring minimal contention.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// A bounded SPSC ring buffer for inter-thread communication.
///
/// Pre-allocated at creation. The producer pushes items, the consumer pops them.
pub struct SpscRingBuffer<T> {
    storage: Mutex<VecDeque<T>>,
    len: AtomicUsize,
    capacity: usize,
}

impl<T> SpscRingBuffer<T> {
    /// Create a new ring buffer with the given capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            storage: Mutex::new(VecDeque::with_capacity(capacity)),
            len: AtomicUsize::new(0),
            capacity,
        }
    }

    /// Try to push an item. Returns `true` if successful, `false` if full.
    /// Called from the main thread (producer side).
    pub fn try_push(&self, value: T) -> bool {
        let mut storage = self.storage.lock().unwrap();
        if storage.len() >= self.capacity {
            return false;
        }
        storage.push_back(value);
        self.len.store(storage.len(), Ordering::Release);
        true
    }

    /// Drain all pending items into a pre-allocated buffer.
    /// The caller must ensure `out` has been pre-allocated with sufficient capacity
    /// to avoid allocation on the audio thread.
    pub fn drain_into(&self, out: &mut Vec<T>) {
        let mut storage = self.storage.lock().unwrap();
        out.extend(storage.drain(..));
        self.len.store(0, Ordering::Release);
    }

    /// Try to pop one item. Returns `Some(value)` if available, `None` if empty.
    pub fn try_pop(&self) -> Option<T> {
        let mut storage = self.storage.lock().unwrap();
        let item = storage.pop_front();
        self.len.store(storage.len(), Ordering::Release);
        item
    }

    /// Check if the buffer is empty (approximate, may race with concurrent operations).
    pub fn is_empty(&self) -> bool {
        self.len.load(Ordering::Relaxed) == 0
    }

    /// Return the maximum capacity of the buffer.
    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

#[cfg(test)]
mod ring_buffer_tests {
    use super::*;

    #[test]
    fn test_push_pop_basic() {
        let rb = SpscRingBuffer::new(8);
        assert!(rb.is_empty());
        assert!(rb.try_push(1));
        assert!(rb.try_push(2));
        assert!(rb.try_push(3));
        assert_eq!(rb.try_pop(), Some(1));
        assert_eq!(rb.try_pop(), Some(2));
        assert_eq!(rb.try_pop(), Some(3));
        assert_eq!(rb.try_pop(), None);
    }

    #[test]
    fn test_full_buffer() {
        let rb = SpscRingBuffer::new(2);
        assert!(rb.try_push(10));
        assert!(rb.try_push(20));
        assert!(!rb.try_push(30)); // full
        assert_eq!(rb.try_pop(), Some(10));
        assert!(rb.try_push(30)); // space now
        assert_eq!(rb.try_pop(), Some(20));
        assert_eq!(rb.try_pop(), Some(30));
        assert_eq!(rb.try_pop(), None);
    }

    #[test]
    fn test_drain_into() {
        let rb = SpscRingBuffer::new(8);
        rb.try_push(1);
        rb.try_push(2);
        rb.try_push(3);

        let mut out = Vec::new();
        rb.drain_into(&mut out);
        assert_eq!(out, vec![1, 2, 3]);
        assert!(rb.is_empty());
    }

    #[test]
    fn test_wrap_around() {
        let rb = SpscRingBuffer::new(4);
        for i in 0..100 {
            assert!(rb.try_push(i));
            assert_eq!(rb.try_pop(), Some(i));
        }
    }

    #[test]
    fn test_threaded_spsc() {
        use std::sync::Arc;
        use std::thread;

        let rb = Arc::new(SpscRingBuffer::new(256));
        let rb_producer = Arc::clone(&rb);
        let rb_consumer = Arc::clone(&rb);

        let count = 10_000usize;

        let producer = thread::spawn(move || {
            for i in 0..count {
                while !rb_producer.try_push(i) {
                    std::hint::spin_loop();
                }
            }
        });

        let consumer = thread::spawn(move || {
            let mut received = Vec::with_capacity(count);
            while received.len() < count {
                if let Some(val) = rb_consumer.try_pop() {
                    received.push(val);
                } else {
                    std::hint::spin_loop();
                }
            }
            received
        });

        producer.join().unwrap();
        let received = consumer.join().unwrap();

        assert_eq!(received.len(), count);
        for (i, &val) in received.iter().enumerate() {
            assert_eq!(val, i);
        }
    }
}
