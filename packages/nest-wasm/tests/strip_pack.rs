use topostack_nest_wasm::job::{StripItem, StripJob, StripResult};
use topostack_nest_wasm::solve::strip_pack;

fn rect(width: f32, height: f32) -> Vec<[f32; 2]> {
    // Deliberately off-origin: the result must map the input coordinates, not a centred copy.
    vec![
        [100.0, 50.0],
        [100.0 + width, 50.0],
        [100.0 + width, 50.0 + height],
        [100.0, 50.0 + height],
    ]
}

fn triangle(size: f32) -> Vec<[f32; 2]> {
    vec![[-20.0, -20.0], [-20.0 + size, -20.0], [-20.0, -20.0 + size]]
}

fn job(items: Vec<StripItem>, strip_height: f32, spacing: f32, time_limit_ms: u64) -> StripJob {
    StripJob {
        items,
        strip_height,
        spacing,
        fit_tolerance: 0.01,
        simplify_tolerance: None,
        time_limit_ms,
        target_width: None,
        early_termination: false,
        seed: 7,
        report_interval_ms: 0,
    }
}

fn item(outline: Vec<[f32; 2]>, orientations: Option<Vec<f32>>) -> StripItem {
    StripItem {
        outline,
        orientations_deg: orientations,
    }
}

fn placed(job: &StripJob, result: &StripResult) -> Vec<Vec<[f32; 2]>> {
    assert_eq!(
        result.placements.len(),
        job.items.len(),
        "every item is placed once"
    );
    result
        .placements
        .iter()
        .map(|placement| {
            let (sin, cos) = placement.rotation_deg.to_radians().sin_cos();
            job.items[placement.index]
                .outline
                .iter()
                .map(|[x, y]| {
                    [
                        cos * x - sin * y + placement.x,
                        sin * x + cos * y + placement.y,
                    ]
                })
                .collect()
        })
        .collect()
}

fn segment_distance(p: [f32; 2], a: [f32; 2], b: [f32; 2]) -> f32 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let length = dx * dx + dy * dy;
    let t = if length == 0.0 {
        0.0
    } else {
        (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length).clamp(0.0, 1.0)
    };
    let (qx, qy) = (a[0] + t * dx, a[1] + t * dy);
    ((p[0] - qx).powi(2) + (p[1] - qy).powi(2)).sqrt()
}

fn separated_on_some_axis(a: &[[f32; 2]], b: &[[f32; 2]]) -> bool {
    [a, b].iter().any(|polygon| {
        (0..polygon.len()).any(|i| {
            let (p, q) = (polygon[i], polygon[(i + 1) % polygon.len()]);
            let axis = [q[1] - p[1], p[0] - q[0]];
            let project = |shape: &[[f32; 2]]| {
                shape
                    .iter()
                    .map(|v| v[0] * axis[0] + v[1] * axis[1])
                    .fold((f32::MAX, f32::MIN), |(lo, hi), d| (lo.min(d), hi.max(d)))
            };
            let ((a_lo, a_hi), (b_lo, b_hi)) = (project(a), project(b));
            a_hi <= b_lo + 1e-3 || b_hi <= a_lo + 1e-3
        })
    })
}

/// Minimum distance between two disjoint convex polygons.
fn convex_gap(a: &[[f32; 2]], b: &[[f32; 2]]) -> f32 {
    assert!(separated_on_some_axis(a, b), "placed outlines overlap");
    let mut gap = f32::MAX;
    for (from, to) in [(a, b), (b, a)] {
        for &point in from {
            for i in 0..to.len() {
                gap = gap.min(segment_distance(point, to[i], to[(i + 1) % to.len()]));
            }
        }
    }
    gap
}

fn assert_valid(job: &StripJob, result: &StripResult) {
    let shapes = placed(job, result);
    let tolerance = job.fit_tolerance + 0.01;
    for shape in &shapes {
        for [x, y] in shape {
            assert!(
                *x >= -tolerance && *x <= result.strip_width + tolerance,
                "x {x} outside strip width {}",
                result.strip_width
            );
            assert!(
                *y >= -tolerance && *y <= job.strip_height + tolerance,
                "y {y} outside strip height {}",
                job.strip_height
            );
        }
    }
    for i in 0..shapes.len() {
        for j in i + 1..shapes.len() {
            let gap = convex_gap(&shapes[i], &shapes[j]);
            assert!(
                gap >= job.spacing * 0.98 - 1e-3,
                "gap {gap} between items {i} and {j} is below spacing {}",
                job.spacing
            );
        }
    }
}

#[test]
fn packs_rectangles_close_to_the_optimum() {
    let items = (0..4)
        .map(|_| item(rect(50.0, 50.0), Some(vec![0.0, 90.0])))
        .collect();
    let job = job(items, 100.0, 0.0, 1500);
    let result = strip_pack(&job, |_| {}).unwrap();
    assert_valid(&job, &result);
    assert!(
        result.strip_width <= 102.0,
        "four 50 mm squares fit a 100 mm strip in about 100 mm, got {}",
        result.strip_width
    );
}

#[test]
fn keeps_spacing_between_parts_but_not_from_the_edge() {
    let items = (0..4)
        .map(|_| item(rect(45.0, 45.0), Some(vec![0.0])))
        .collect();
    let job = job(items, 100.0, 5.0, 1500);
    let result = strip_pack(&job, |_| {}).unwrap();
    assert_valid(&job, &result);
    // Two rows of 45 + 5 + 45 = 95 fit the 100 mm height only if the edges carry no spacing.
    assert!(
        result.strip_width <= 100.0,
        "expected two columns, got width {}",
        result.strip_width
    );
}

#[test]
fn a_part_as_tall_as_the_strip_still_fits_with_spacing() {
    let job = job(
        vec![
            item(rect(80.0, 100.0), Some(vec![0.0])),
            item(rect(20.0, 20.0), Some(vec![0.0])),
        ],
        100.0,
        3.0,
        800,
    );
    let result = strip_pack(&job, |_| {}).unwrap();
    assert_valid(&job, &result);
}

#[test]
fn honours_fixed_orientation() {
    let job = job(
        vec![
            item(rect(90.0, 10.0), Some(vec![0.0])),
            item(triangle(30.0), Some(vec![0.0, 180.0])),
        ],
        40.0,
        1.0,
        800,
    );
    let result = strip_pack(&job, |_| {}).unwrap();
    assert_valid(&job, &result);
    assert_eq!(result.placements[0].rotation_deg, 0.0);
    assert!(
        [0.0, 180.0]
            .iter()
            .any(|r| (result.placements[1].rotation_deg - r).abs() < 0.01)
    );
}

#[test]
fn free_rotation_places_triangles_validly() {
    let items = (0..6).map(|_| item(triangle(40.0), None)).collect();
    let job = job(items, 60.0, 1.0, 1500);
    let result = strip_pack(&job, |_| {}).unwrap();
    assert_valid(&job, &result);
}

#[test]
fn stops_early_once_the_target_width_is_met() {
    let items = (0..4)
        .map(|_| item(rect(50.0, 50.0), Some(vec![0.0])))
        .collect();
    let mut job = job(items, 100.0, 0.0, 20_000);
    job.target_width = Some(120.0);
    let started = std::time::Instant::now();
    let mut reports = 0;
    let result = strip_pack(&job, |_| reports += 1).unwrap();
    assert!(
        started.elapsed().as_secs_f32() < 10.0,
        "should stop well before the 20 s limit"
    );
    assert!(reports > 0);
    assert!(result.strip_width <= 120.0);
}

#[test]
fn respects_the_time_limit() {
    let items = (0..12)
        .map(|i| item(triangle(20.0 + i as f32), None))
        .collect();
    let job = job(items, 50.0, 0.5, 600);
    let started = std::time::Instant::now();
    strip_pack(&job, |_| {}).unwrap();
    assert!(
        started.elapsed().as_millis() < 1500,
        "took {:?}",
        started.elapsed()
    );
}

#[test]
fn rejects_bad_input_without_panicking() {
    assert!(strip_pack(&job(vec![], 100.0, 0.0, 100), |_| {}).is_err());
    assert!(
        strip_pack(
            &job(
                vec![item(vec![[0.0, 0.0], [1.0, 1.0]], None)],
                100.0,
                0.0,
                100
            ),
            |_| {}
        )
        .is_err()
    );
    assert!(
        strip_pack(
            &job(vec![item(rect(10.0, 10.0), None)], 0.0, 0.0, 100),
            |_| {}
        )
        .is_err()
    );
    // Taller than the strip in every allowed orientation.
    assert!(
        strip_pack(
            &job(
                vec![item(rect(10.0, 200.0), Some(vec![0.0]))],
                100.0,
                0.0,
                100
            ),
            |_| {}
        )
        .is_err()
    );
}

#[test]
fn engine_info_names_the_pinned_solver() {
    let manifest = include_str!("../Cargo.toml");
    assert!(manifest.contains(&format!("rev = \"{}\"", topostack_nest_wasm::SPARROW_REV)));
    assert!(manifest.contains(&format!(
        "version = \"={}\"",
        topostack_nest_wasm::JAGUA_VERSION
    )));
    let info: serde_json::Value =
        serde_json::from_str(&topostack_nest_wasm::engine_info()).unwrap();
    assert_eq!(info["sparrowRev"], topostack_nest_wasm::SPARROW_REV);
}

#[test]
fn parses_the_camel_case_wire_format() {
    let job: StripJob = serde_json::from_str(
        r#"{"items":[{"outline":[[0,0],[10,0],[10,10],[0,10],[0,0]],"orientationsDeg":[0,90]}],"stripHeight":20,"spacing":1,"timeLimitMs":100,"seed":3}"#,
    )
    .unwrap();
    assert_eq!(job.items.len(), 1);
    assert_eq!(job.report_interval_ms, 250);
    let result = strip_pack(&job, |_| {}).unwrap();
    let json = serde_json::to_value(&result).unwrap();
    assert!(json["placements"][0]["rotationDeg"].is_number());
    assert!(json["stripWidth"].is_number());
}
