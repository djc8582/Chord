//! Plugin scanner — find VST3, CLAP, and AU plugins on disk.
//!
//! Walks a set of directories looking for files/directories with the correct
//! extensions (`.vst3`, `.clap`, `.component`).  For each match it creates a
//! [`PluginInfo`] with the name derived from the filename and a UID derived
//! from the path.
//!
//! Because actually interrogating the binary for metadata requires FFI
//! (loading the plugin and calling its `get_info`-style entry point), the
//! scanner currently fills `vendor` and `category` with placeholder values.
//! The full metadata will be populated once the real format loaders land.

use std::path::{Path, PathBuf};

use crate::format::{PluginFormat, PluginInfo};

/// Scans filesystem directories for audio plugin bundles.
pub struct PluginScanner;

impl PluginScanner {
    /// Scan a list of directories for plugins and return discovered [`PluginInfo`] entries.
    ///
    /// Non-existent directories are silently skipped.  The scan is *not*
    /// recursive — only immediate children of each directory are inspected.
    pub fn scan_directories(paths: &[PathBuf]) -> Vec<PluginInfo> {
        let mut results = Vec::new();
        for dir in paths {
            if !dir.is_dir() {
                continue;
            }
            Self::scan_single_directory(dir, &mut results);
        }
        results
    }

    /// Scan a single directory (non-recursively) for plugins.
    fn scan_single_directory(dir: &Path, out: &mut Vec<PluginInfo>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(format) = PluginFormat::from_path(&path) {
                if let Some(info) = Self::info_from_path(&path, format) {
                    out.push(info);
                }
            }
        }
    }

    /// Build a [`PluginInfo`] from a path and detected format.
    ///
    /// The name is derived from the file-stem (e.g. `Serum.vst3` -> `Serum`).
    /// Vendor and category are placeholders until real binary interrogation is
    /// implemented.
    fn info_from_path(path: &Path, format: PluginFormat) -> Option<PluginInfo> {
        let name = path.file_stem()?.to_string_lossy().to_string();
        let uid = format!(
            "{}:{}",
            format.extension(),
            path.to_string_lossy()
        );

        Some(PluginInfo {
            name,
            vendor: "Unknown".to_string(),
            format,
            path: path.to_path_buf(),
            uid,
            category: "Unknown".to_string(),
            // Without loading the binary, we can't tell if it's an instrument or
            // effect — default to effect.
            is_instrument: false,
            is_effect: true,
        })
    }

    /// Return the platform's default plugin directories.
    ///
    /// These are the standard locations where DAWs install plugins.
    #[cfg(target_os = "macos")]
    pub fn default_directories() -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        // System-wide
        dirs.push(PathBuf::from("/Library/Audio/Plug-Ins/VST3"));
        dirs.push(PathBuf::from("/Library/Audio/Plug-Ins/CLAP"));
        dirs.push(PathBuf::from("/Library/Audio/Plug-Ins/Components"));

        // Per-user
        if let Some(home) = home_dir() {
            dirs.push(home.join("Library/Audio/Plug-Ins/VST3"));
            dirs.push(home.join("Library/Audio/Plug-Ins/CLAP"));
            dirs.push(home.join("Library/Audio/Plug-Ins/Components"));
        }

        dirs
    }

    #[cfg(target_os = "windows")]
    pub fn default_directories() -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        dirs.push(PathBuf::from(r"C:\Program Files\Common Files\VST3"));
        dirs.push(PathBuf::from(r"C:\Program Files\Common Files\CLAP"));
        dirs
    }

    #[cfg(target_os = "linux")]
    pub fn default_directories() -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        dirs.push(PathBuf::from("/usr/lib/vst3"));
        dirs.push(PathBuf::from("/usr/lib/clap"));
        dirs.push(PathBuf::from("/usr/local/lib/vst3"));
        dirs.push(PathBuf::from("/usr/local/lib/clap"));

        if let Some(home) = home_dir() {
            dirs.push(home.join(".vst3"));
            dirs.push(home.join(".clap"));
        }

        dirs
    }

    // Fallback for other platforms.
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    pub fn default_directories() -> Vec<PathBuf> {
        Vec::new()
    }
}

/// Helper to get the user's home directory.
fn home_dir() -> Option<PathBuf> {
    // std::env::home_dir is deprecated but still the simplest cross-platform
    // approach without adding a dependency.  For our purposes (scanning
    // default directories) it is adequate.
    #[allow(deprecated)]
    std::env::home_dir()
}
