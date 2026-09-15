/** Shared Redis key names so cache and counter code never drift apart. */
export const PAPERS_CACHE_KEY = "papers:all";
export const PENDING_HASH = "dl:pending";
// List of JSON-encoded DownloadLog events awaiting a bulk Mongo insert.
export const LOG_PENDING_LIST = "dl:log:pending";
// Hash of `date::resourceType::resourceId::plan::action` -> pending count,
// awaiting a bulk DownloadStatsDaily upsert.
export const STATS_PENDING_HASH = "dl:stats:pending";
