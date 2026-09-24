//! TopoStack's WebAssembly entry point to the sparrow nesting heuristic.
//!
//! sparrow (MIT, © 2025 Jeroen Gardeyn, KU Leuven) and jagua-rs (MPL-2.0) are used unmodified.
//! This crate only adapts TopoStack's strip jobs to their library API.

pub mod job;
pub mod solve;

use wasm_bindgen::prelude::*;

pub const SPARROW_REV: &str = "7f0e10f946f70a86138d3938548a13ee46464f39";
pub const JAGUA_VERSION: &str = "0.8.3";

/// Versions of this wrapper and the solver it was built from, as JSON.
#[wasm_bindgen(js_name = engineInfo)]
pub fn engine_info() -> String {
    serde_json::json!({
        "crate": env!("CARGO_PKG_VERSION"),
        "sparrowRev": SPARROW_REV,
        "jaguaVersion": JAGUA_VERSION,
    })
    .to_string()
}

/// Packs a strip job given as JSON. `on_report` receives progress reports as JSON strings.
/// Returns the final result as JSON.
#[wasm_bindgen(js_name = stripPack)]
pub fn strip_pack(job_json: &str, on_report: &js_sys::Function) -> Result<String, JsError> {
    #[cfg(target_arch = "wasm32")]
    console_error_panic_hook::set_once();
    let job: job::StripJob = serde_json::from_str(job_json)
        .map_err(|error| JsError::new(&format!("invalid strip job: {error}")))?;
    let result = solve::strip_pack(&job, |report| {
        if let Ok(text) = serde_json::to_string(report) {
            let _ = on_report.call1(&JsValue::NULL, &JsValue::from_str(&text));
        }
    })
    .map_err(|error| JsError::new(&error))?;
    serde_json::to_string(&result).map_err(|error| JsError::new(&error.to_string()))
}
