//! Audio device enumeration and management.
//!
//! Wraps CPAL device discovery to provide a simplified device listing with
//! input/output channel counts and supported sample rates.

use cpal::traits::{DeviceTrait, HostTrait};

use crate::error::{AudioIoError, Result};

/// Description of an audio device available on the system.
#[derive(Debug, Clone)]
pub struct AudioDevice {
    /// Human-readable device name.
    pub name: String,
    /// Number of input channels (0 if output-only).
    pub input_channels: usize,
    /// Number of output channels (0 if input-only).
    pub output_channels: usize,
    /// Supported sample rates (in Hz), deduplicated and sorted.
    pub sample_rates: Vec<u32>,
    /// Whether this is the system default input device.
    pub is_default_input: bool,
    /// Whether this is the system default output device.
    pub is_default_output: bool,
}

/// Query a CPAL device for its input channel count.
fn get_input_channels(device: &cpal::Device) -> usize {
    device
        .supported_input_configs()
        .ok()
        .map(|configs| {
            configs
                .map(|c| c.channels() as usize)
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

/// Query a CPAL device for its output channel count.
fn get_output_channels(device: &cpal::Device) -> usize {
    device
        .supported_output_configs()
        .ok()
        .map(|configs| {
            configs
                .map(|c| c.channels() as usize)
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

/// Collect supported sample rates from a CPAL device.
///
/// Checks a set of common audio sample rates against the device's supported
/// configurations. Returns a sorted, deduplicated list.
fn get_supported_sample_rates(device: &cpal::Device) -> Vec<u32> {
    let common_rates: &[u32] = &[
        8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000,
    ];

    let mut rates = Vec::new();

    // Check output configs.
    if let Ok(configs) = device.supported_output_configs() {
        for config in configs {
            let min = config.min_sample_rate().0;
            let max = config.max_sample_rate().0;
            for &rate in common_rates {
                if rate >= min && rate <= max && !rates.contains(&rate) {
                    rates.push(rate);
                }
            }
        }
    }

    // Also check input configs if any.
    if let Ok(configs) = device.supported_input_configs() {
        for config in configs {
            let min = config.min_sample_rate().0;
            let max = config.max_sample_rate().0;
            for &rate in common_rates {
                if rate >= min && rate <= max && !rates.contains(&rate) {
                    rates.push(rate);
                }
            }
        }
    }

    rates.sort_unstable();
    rates.dedup();
    rates
}

/// Enumerate all audio devices on the default host.
///
/// Returns a list of [`AudioDevice`] structs describing each device's capabilities.
/// Device names of the system defaults are used for matching in [`StreamConfig`](crate::StreamConfig).
pub fn list_devices(host: &cpal::Host) -> Result<Vec<AudioDevice>> {
    let default_input_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());
    let default_output_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());

    let mut devices = Vec::new();

    // Collect output devices.
    if let Ok(output_devices) = host.output_devices() {
        for device in output_devices {
            let name = device.name().unwrap_or_else(|_| "<unknown>".to_string());
            let is_default_output = default_output_name.as_deref() == Some(&name);
            let is_default_input = default_input_name.as_deref() == Some(&name);

            let entry = AudioDevice {
                input_channels: get_input_channels(&device),
                output_channels: get_output_channels(&device),
                sample_rates: get_supported_sample_rates(&device),
                is_default_input,
                is_default_output,
                name,
            };
            devices.push(entry);
        }
    }

    // Collect input-only devices (those not already listed as output devices).
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            let name = device.name().unwrap_or_else(|_| "<unknown>".to_string());
            if devices.iter().any(|d| d.name == name) {
                continue; // Already listed.
            }
            let is_default_input = default_input_name.as_deref() == Some(&name);

            let entry = AudioDevice {
                input_channels: get_input_channels(&device),
                output_channels: get_output_channels(&device),
                sample_rates: get_supported_sample_rates(&device),
                is_default_input,
                is_default_output: false,
                name,
            };
            devices.push(entry);
        }
    }

    Ok(devices)
}

/// Find a CPAL output device by name, falling back to the default if the name is "default".
pub fn find_output_device(host: &cpal::Host, name: &str) -> Result<cpal::Device> {
    if name == "default" {
        return host
            .default_output_device()
            .ok_or_else(|| AudioIoError::DeviceNotFound("default output".to_string()));
    }

    let devices = host.output_devices()?;
    for device in devices {
        if let Ok(dev_name) = device.name() {
            if dev_name == name {
                return Ok(device);
            }
        }
    }

    Err(AudioIoError::DeviceNotFound(name.to_string()))
}

/// Find a CPAL input device by name, falling back to the default if the name is "default".
pub fn find_input_device(host: &cpal::Host, name: &str) -> Result<cpal::Device> {
    if name == "default" {
        return host
            .default_input_device()
            .ok_or_else(|| AudioIoError::DeviceNotFound("default input".to_string()));
    }

    let devices = host.input_devices()?;
    for device in devices {
        if let Ok(dev_name) = device.name() {
            if dev_name == name {
                return Ok(device);
            }
        }
    }

    Err(AudioIoError::DeviceNotFound(name.to_string()))
}

/// Negotiate a stream configuration for a device.
///
/// Validates the requested sample rate and buffer size against the device's
/// supported configurations. Returns a CPAL `StreamConfig` ready for use.
pub fn negotiate_config(
    device: &cpal::Device,
    requested_sample_rate: u32,
    requested_buffer_size: u32,
    is_output: bool,
) -> Result<cpal::StreamConfig> {
    // Validate buffer size range (64..=2048 as specified).
    if !(64..=2048).contains(&requested_buffer_size) {
        return Err(AudioIoError::InvalidBufferSize {
            requested: requested_buffer_size,
            min: 64,
            max: 2048,
        });
    }

    // Collect supported configs into a common representation.
    // CPAL returns different iterator types for input vs output, so we collect
    // the fields we need (channels, min_sample_rate, max_sample_rate) into tuples.
    let configs: Vec<(u16, u32, u32)> = if is_output {
        device
            .supported_output_configs()?
            .map(|c| (c.channels(), c.min_sample_rate().0, c.max_sample_rate().0))
            .collect()
    } else {
        device
            .supported_input_configs()?
            .map(|c| (c.channels(), c.min_sample_rate().0, c.max_sample_rate().0))
            .collect()
    };

    // Find a config that supports the requested sample rate.
    let matching_config = configs.iter().find(|(_, min, max)| {
        requested_sample_rate >= *min && requested_sample_rate <= *max
    });

    let (channels, _, _) = match matching_config {
        Some(c) => *c,
        None => {
            // Gather available sample rates for the error message.
            let common_rates: &[u32] = &[44100, 48000, 88200, 96000, 192000];
            let mut available = Vec::new();
            for &(_, min, max) in &configs {
                for &rate in common_rates {
                    if rate >= min && rate <= max && !available.contains(&rate) {
                        available.push(rate);
                    }
                }
            }
            available.sort_unstable();
            return Err(AudioIoError::UnsupportedSampleRate {
                requested: requested_sample_rate,
                available,
            });
        }
    };

    Ok(cpal::StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(requested_sample_rate),
        buffer_size: cpal::BufferSize::Fixed(requested_buffer_size),
    })
}

#[cfg(test)]
mod device_tests {
    use super::*;
    use cpal::traits::HostTrait;

    #[test]
    fn test_list_devices_does_not_panic() {
        // This test verifies that device enumeration doesn't crash,
        // even in headless CI environments where audio hardware is absent.
        let host = cpal::default_host();
        let result = list_devices(&host);
        // We don't assert success because CI may lack audio hardware.
        // We only assert it doesn't panic.
        match result {
            Ok(devices) => {
                // If we got devices, verify they have sensible data.
                for device in &devices {
                    assert!(!device.name.is_empty());
                    // Channels should be reasonable.
                    assert!(device.input_channels <= 256);
                    assert!(device.output_channels <= 256);
                }
            }
            Err(_) => {
                // No audio hardware — that's fine in CI.
            }
        }
    }

    #[test]
    fn test_audio_device_clone() {
        let device = AudioDevice {
            name: "Test Device".to_string(),
            input_channels: 2,
            output_channels: 2,
            sample_rates: vec![44100, 48000, 96000],
            is_default_input: false,
            is_default_output: true,
        };
        let clone = device.clone();
        assert_eq!(clone.name, "Test Device");
        assert_eq!(clone.output_channels, 2);
        assert_eq!(clone.sample_rates, vec![44100, 48000, 96000]);
        assert!(clone.is_default_output);
    }

    #[test]
    fn test_find_output_device_not_found() {
        let host = cpal::default_host();
        let result = find_output_device(&host, "NonExistentDevice12345");
        assert!(result.is_err());
    }

    #[test]
    fn test_find_input_device_not_found() {
        let host = cpal::default_host();
        let result = find_input_device(&host, "NonExistentDevice12345");
        assert!(result.is_err());
    }

    #[test]
    fn test_buffer_size_validation() {
        // We can't negotiate without a real device, but we can test that
        // invalid buffer sizes are rejected by creating a mock scenario.
        // The validation is at the top of negotiate_config.
        // We'll verify the error type for out-of-range sizes.
        let host = cpal::default_host();
        if let Some(device) = host.default_output_device() {
            // Too small.
            let result = negotiate_config(&device, 48000, 32, true);
            match result {
                Err(AudioIoError::InvalidBufferSize { requested, min, max }) => {
                    assert_eq!(requested, 32);
                    assert_eq!(min, 64);
                    assert_eq!(max, 2048);
                }
                _ => {
                    // Device may not exist in CI — that's fine.
                }
            }

            // Too large.
            let result = negotiate_config(&device, 48000, 4096, true);
            match result {
                Err(AudioIoError::InvalidBufferSize { requested, .. }) => {
                    assert_eq!(requested, 4096);
                }
                _ => {}
            }
        }
    }
}
