// Tauri build script. Also exports the compile target triple to the crate so
// the runtime can locate the `opennow-server-<triple>` sidecar without
// hardcoding it (Tauri appends the same triple to externalBin names).
fn main() {
    println!(
        "cargo:rustc-env=OPENNOW_TARGET_TRIPLE={}",
        std::env::var("TARGET").expect("cargo always sets TARGET for build scripts")
    );
    tauri_build::build()
}
