//! Wire format between TopoStack and the strip packer, and the translation to and from
//! jagua-rs' external representation.
//!
//! Coordinates are millimetres. Placements map an item's input outline onto the strip:
//! `p' = R(rotation) · p + (x, y)`, and every placed outline lies inside
//! `[0, strip_width] × [0, strip_height]` with at least `spacing` between outlines.

use jagua_rs::io::ext_repr::{ExtItem as BaseItem, ExtSPolygon, ExtShape};
use jagua_rs::probs::spp::io::ext_repr::{ExtItem, ExtSPInstance, ExtSPSolution};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StripJob {
    /// Parts to place, each exactly once. The index in this list is the part's id in the result.
    pub items: Vec<StripItem>,
    /// Usable height of the strip.
    pub strip_height: f32,
    /// Minimum distance between outlines. Outlines may touch the strip edge.
    #[serde(default)]
    pub spacing: f32,
    /// Largest outward error allowed when jagua-rs simplifies an outline, as a ratio of its size.
    #[serde(default)]
    pub simplify_tolerance: Option<f32>,
    /// How far an outline may cross the strip edge. The collision engine treats touching as
    /// overlapping, so without this slack a part exactly as tall as the strip never fits.
    #[serde(default = "default_fit_tolerance")]
    pub fit_tolerance: f32,
    /// Total time for exploration and compression.
    pub time_limit_ms: u64,
    /// Stop as soon as a feasible layout this narrow is found.
    #[serde(default)]
    pub target_width: Option<f32>,
    /// Stop exploring after repeated failures instead of always using the whole time limit.
    #[serde(default)]
    pub early_termination: bool,
    #[serde(default)]
    pub seed: u64,
    /// Minimum time between progress reports.
    #[serde(default = "default_report_interval")]
    pub report_interval_ms: u64,
}

fn default_report_interval() -> u64 {
    250
}

fn default_fit_tolerance() -> f32 {
    0.01
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StripItem {
    /// Outer boundary, open or closed, either winding.
    pub outline: Vec<[f32; 2]>,
    /// Allowed rotations in degrees. Absent means any rotation.
    #[serde(default)]
    pub orientations_deg: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StripPlacement {
    pub index: usize,
    pub rotation_deg: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StripResult {
    pub strip_width: f32,
    pub density: f32,
    pub placements: Vec<StripPlacement>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StripReport {
    pub phase: &'static str,
    pub elapsed_ms: u64,
    #[serde(flatten)]
    pub result: StripResult,
}

impl StripJob {
    pub fn validate(&self) -> Result<(), String> {
        if self.items.is_empty() {
            return Err("strip job has no items".into());
        }
        if !(self.strip_height.is_finite() && self.strip_height > 0.0) {
            return Err("strip height must be positive".into());
        }
        if !(self.spacing.is_finite() && self.spacing >= 0.0) {
            return Err("spacing must be zero or positive".into());
        }
        if !(self.fit_tolerance.is_finite() && self.fit_tolerance >= 0.0) {
            return Err("fit tolerance must be zero or positive".into());
        }
        for (index, item) in self.items.iter().enumerate() {
            let points = open_ring(&item.outline);
            if points.len() < 3 {
                return Err(format!("item {index} has fewer than three distinct points"));
            }
            if points.iter().any(|[x, y]| !x.is_finite() || !y.is_finite()) {
                return Err(format!("item {index} has a non-finite coordinate"));
            }
        }
        Ok(())
    }

    /// Edge offset added on each side so jagua-rs' container deflation cancels out, plus half the
    /// fit tolerance. jagua-rs inflates items and deflates the container by half the separation
    /// each, which would otherwise keep outlines a full `spacing` away from the strip edge.
    pub fn edge_offset(&self) -> f32 {
        self.spacing + self.fit_tolerance / 2.0
    }

    pub fn to_ext_instance(&self) -> ExtSPInstance {
        let items = self
            .items
            .iter()
            .enumerate()
            .map(|(index, item)| ExtItem {
                base: BaseItem {
                    id: index as u64,
                    allowed_orientations: item.orientations_deg.clone(),
                    shape: ExtShape::SimplePolygon(ExtSPolygon(
                        open_ring(&item.outline)
                            .into_iter()
                            .map(|[x, y]| (x, y))
                            .collect(),
                    )),
                    min_quality: None,
                },
                demand: 1,
            })
            .collect();
        ExtSPInstance {
            name: "topostack".into(),
            items,
            strip_height: self.strip_height + 2.0 * self.edge_offset(),
        }
    }

    pub fn result_from(&self, solution: &ExtSPSolution) -> StripResult {
        let offset = self.edge_offset();
        let mut placements: Vec<StripPlacement> = solution
            .layout
            .placed_items
            .iter()
            .map(|placed| StripPlacement {
                index: placed.item_id as usize,
                rotation_deg: normalize_degrees(placed.transformation.rotation),
                x: placed.transformation.translation.0 - offset,
                y: placed.transformation.translation.1 - offset,
            })
            .collect();
        placements.sort_by_key(|placement| placement.index);
        StripResult {
            strip_width: (solution.strip_width - 2.0 * offset).max(0.0),
            density: solution.density,
            placements,
        }
    }
}

/// Drops a repeated closing point and consecutive duplicates.
pub fn open_ring(points: &[[f32; 2]]) -> Vec<[f32; 2]> {
    let mut ring: Vec<[f32; 2]> = Vec::with_capacity(points.len());
    for &point in points {
        if ring.last() != Some(&point) {
            ring.push(point);
        }
    }
    while ring.len() > 1 && ring.first() == ring.last() {
        ring.pop();
    }
    ring
}

fn normalize_degrees(value: f32) -> f32 {
    let wrapped = value.rem_euclid(360.0);
    if (wrapped - 360.0).abs() < 1e-3 {
        0.0
    } else {
        wrapped
    }
}
