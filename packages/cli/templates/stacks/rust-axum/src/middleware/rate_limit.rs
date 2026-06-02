//! Rate limit via tower_governor — per-IP token bucket.
use std::sync::Arc;

use axum::body::Body;
use tower::layer::util::Identity;
use tower_governor::{
    governor::GovernorConfigBuilder,
    GovernorLayer,
};

use crate::config::Config;

/// Build the governor layer from config.
pub fn governor_layer(
    cfg: &Config,
) -> GovernorLayer<
    tower_governor::key_extractor::SmartIpKeyExtractor,
    tower_governor::governor::middleware::NoOpMiddleware<tower_governor::governor::clock::QuantaInstant>,
    Body,
> {
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(cfg.rate_limit_per_sec)
            .burst_size(cfg.rate_limit_burst)
            .finish()
            .expect("valid governor config"),
    );
    GovernorLayer { config: governor_conf }
}

// Keep tower::layer::util::Identity in scope to satisfy unused-import lints
// in IDEs that don't see the generic param above. Concrete production code
// can remove this once Layer types stabilize across tower-governor versions.
#[allow(dead_code)]
fn _identity_unused() -> Identity {
    Identity::new()
}
