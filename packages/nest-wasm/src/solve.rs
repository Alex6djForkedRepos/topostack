//! Runs sparrow on a [`StripJob`] with a deadline, an optional target width and throttled reports.

use crate::job::{StripJob, StripReport, StripResult};
use jagua_rs::Instant;
use jagua_rs::io::import::Importer;
use jagua_rs::probs::spp::entities::{SPInstance, SPSolution};
use rand::SeedableRng;
use rand::rngs::Xoshiro256PlusPlus;
use sparrow::config::DEFAULT_SPARROW_CONFIG;
use sparrow::config::ShrinkDecayStrategy;
use sparrow::consts::{
    DEFAULT_COMPRESS_TIME_RATIO, DEFAULT_EXPLORE_TIME_RATIO, DEFAULT_FAIL_DECAY_RATIO_CMPR,
    DEFAULT_MAX_CONSEQ_FAILS_EXPL,
};
use sparrow::optimizer::optimize;
use sparrow::util::listener::{ReportType, SolutionListener};
use sparrow::util::terminator::Terminator;
use std::cell::Cell;
use std::rc::Rc;
use std::time::Duration;

/// Stops at the job deadline, at the end of each phase, or once the target width has been met.
struct DeadlineTerminator {
    hard_deadline: Instant,
    phase_deadline: Option<Instant>,
    target_met: Rc<Cell<bool>>,
}

impl Terminator for DeadlineTerminator {
    fn kill(&self) -> bool {
        self.target_met.get() || Instant::now() > self.phase_deadline.unwrap_or(self.hard_deadline)
    }

    fn new_timeout(&mut self, timeout: Duration) {
        let phase = Instant::now() + timeout;
        self.phase_deadline = Some(if phase < self.hard_deadline {
            phase
        } else {
            self.hard_deadline
        });
    }

    fn timeout_at(&self) -> Option<Instant> {
        self.phase_deadline
    }
}

/// Forwards feasible layouts, at most one per report interval, and records when the target is met.
struct ReportListener<'a, F: FnMut(&StripReport)> {
    job: &'a StripJob,
    start: Instant,
    last_report: Option<Instant>,
    interval: Duration,
    target_met: Rc<Cell<bool>>,
    on_report: F,
}

impl<F: FnMut(&StripReport)> SolutionListener for ReportListener<'_, F> {
    fn report(&mut self, report: ReportType, solution: &SPSolution, instance: &SPInstance) {
        let phase = match report {
            ReportType::ExplFeas => "exploration",
            ReportType::CmprFeas => "compression",
            _ => return,
        };
        let result = export(self.job, instance, solution);
        if self
            .job
            .target_width
            .is_some_and(|target| result.strip_width <= target)
        {
            self.target_met.set(true);
        }
        let now = Instant::now();
        let due = self
            .last_report
            .is_none_or(|last| now.duration_since(last) >= self.interval);
        if due || self.target_met.get() {
            self.last_report = Some(now);
            (self.on_report)(&StripReport {
                phase,
                elapsed_ms: now.duration_since(self.start).as_millis() as u64,
                result,
            });
        }
    }
}

fn export(job: &StripJob, instance: &SPInstance, solution: &SPSolution) -> StripResult {
    job.result_from(&jagua_rs::probs::spp::io::export(
        instance,
        solution,
        *sparrow::EPOCH,
    ))
}

/// Packs every item of the job into the narrowest strip sparrow finds before the deadline.
pub fn strip_pack(
    job: &StripJob,
    on_report: impl FnMut(&StripReport),
) -> Result<StripResult, String> {
    job.validate()?;
    let start = Instant::now();
    let config = DEFAULT_SPARROW_CONFIG;
    let separation = (job.spacing > 0.0).then_some(job.spacing);
    let importer = Importer::new(
        config.cde_config,
        job.simplify_tolerance.or(config.poly_simpl_tolerance),
        separation,
        config.narrow_concavity_cutoff_ratio,
    );
    let instance = jagua_rs::probs::spp::io::import_instance(&importer, &job.to_ext_instance())
        .map_err(|error| format!("could not read the parts: {error:#}"))?;

    let total = Duration::from_millis(job.time_limit_ms.max(1));
    let mut expl_config = config.expl_cfg;
    let mut cmpr_config = config.cmpr_cfg;
    expl_config.time_limit = total.mul_f32(DEFAULT_EXPLORE_TIME_RATIO);
    cmpr_config.time_limit = total.mul_f32(DEFAULT_COMPRESS_TIME_RATIO);
    // One worker: the browser build has no thread pool, and native tests should behave the same.
    expl_config.separator_config.n_workers = 1;
    cmpr_config.separator_config.n_workers = 1;
    if job.early_termination {
        expl_config.max_conseq_failed_attempts = Some(DEFAULT_MAX_CONSEQ_FAILS_EXPL);
        cmpr_config.shrink_decay = ShrinkDecayStrategy::FailureBased(DEFAULT_FAIL_DECAY_RATIO_CMPR);
    }

    let target_met = Rc::new(Cell::new(false));
    let mut terminator = DeadlineTerminator {
        hard_deadline: start + total,
        phase_deadline: None,
        target_met: target_met.clone(),
    };
    let mut listener = ReportListener {
        job,
        start,
        last_report: None,
        interval: Duration::from_millis(job.report_interval_ms),
        target_met,
        on_report,
    };
    let solution = optimize(
        instance.clone(),
        Xoshiro256PlusPlus::seed_from_u64(job.seed),
        &mut listener,
        &mut terminator,
        &expl_config,
        &cmpr_config,
        None,
    )
    .map_err(|error| format!("could not build a first layout: {error:?}"))?;
    Ok(export(job, &instance, &solution))
}
