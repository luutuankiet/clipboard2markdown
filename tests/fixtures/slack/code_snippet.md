Ken  [12:39 PM]

lesser known dbt cost savings tip : when your local dbt run fails, there's [dbt retry](https://docs.getdbt.com/reference/commands/retry) to help  pick up from failures. (this is also a feature in dbt cloud).
basically if your run fails midway, you don't have to restart the whole DAG. You just need to point dbt to the **"failed state"** artifacts. The trick is to **persist your artifacts** immediately after a crash so they don't get overwritten by your next command
So when your runs fail, do this:

1.  Immediately copy `./target/manifest.json` and `./target/run_results.json` to a persistent dir .e.g. `./retry` (so that the next run don't override it)
2.  do your fix. rerun the models query tests etc.
3.  whenever you want to re validate the build, kick off the retry point it to the last state dir i.e. `dbt retry --state ./retry`

Other forms to parse this metadata is through `result:error --state ./retry`
For instance if your last run overflowed the terminal / you closed the session, access this by

```
dbt ls -s result:error --state ./retry

05:30:30  Running with dbt=1.10.15
05:30:33  Registered adapter: bigquery=1.10.3
05:30:35  Found 381 models, 13 snapshots, 564 data tests, 7 seeds, 2 operations, 124 sources, 1135 macros
estrid_dw.marts.DM_ECOM.fct_ga4_event_purchases
estrid_dw.marts.DM_SAL.fct_transactions
estrid_dw.intermediate.orders.intr_orders
```