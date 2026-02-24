## I. New Top-Level Explores Added

Two entirely new top-level explores have been added:

| **Explore Name** | **Explore Display Name** | **Primary Key** |
| --- | --- | --- |
| concurrency | Query Concurrency | concurrency.pk |
| scheduled_plan_oauth_events | Scheduled Plan OAuth Events | N/A |

## II. New Views and Fields Added

This section summarizes new views and significant field additions within existing or new explores.

### A. New Views

| **Explore** | **New View Name** | **View Display Name** | **Purpose/Key Fields** |
| --- | --- | --- | --- |
| api_usage | api_usage_hourly | API Usage Duration Histogram | Provides hourly API usage duration data. |
| api_usage_hourly (New) | api_usage_endpoint | API Usage Endpoint | Details on API endpoints, including HTTP verb and path. |
| dashboard | content_metadata | Dashboard | Contains a slug field for unique content identification. |
| query_metrics | dashboard_element | Dashboard Element (User-defined only) | Provides granular details on dashboard tiles (e.g., text, notes, refresh intervals). |
| concurrency (New) | concurrency | Concurrency | Contains concurrency fraction data. |
| concurrency (New) | query_intervals | DB Connection | Includes query timing metrics like async processing and queuing time. |