Hi @Alice Johnson thanks for working on gathering the payment gateway rates. Before you go too deep, I want to surface a schema question that could affect how we structure the data.

cc@Bob Chen we'd appreciate your input on the architectural direction here

> **Question : Should the seed file have gateway-level granularity, or is one rate per payment type sufficient?**

Currently the seed schema is:

```
type,cost,unit
```

The join in `fct_transactions` matches on `payment_cost_source = type` and do not include gateway dimension.

---

## Lineage Walkthrough

For sake of completeness below is the lineage for transaction costs up to `fct_transaction` model, annotated with the data quality issues we collected so far.

@Charlie if it helps please scan from the seed node onwards (failure mode B ) is where we'll need your input on.

![demo-image-001.png](blob:[https://example.atlassian.net/00000000demo-image-001.png](https://example.atlassian.net/00000000demo-image-001.png))

### Key Code Snippets

**Step 1: CASE statement in** `fct_transactions.sql` **(CTE: join_payment_provider)**

```
case
    when pay.payment_type = 'WidgetPro' then 'widgetpro'
    when reference_number like 'widgetpro%' then 'widgetpro'
    when reference_number like 'WIDGETPRO' then 'widgetpro'
    when reference_number like 'IDEAL' then 'iDeal'
    when reference_number like 'SOFORT' then 'sofort'
    when payment_method like 'paypal_express_checkout' then 'paypal'
    else payment_method  -- ⚠️ Failure mode A : IF NULL → payment_cost_source = NULL
end as payment_cost_source

```

**Step 2: JOIN to seed in** `fct_transactions.sql` **(CTE: join_trx_costs)**

```
join_trx_costs as (
    select
    trx.*,
    pymt.cost as transaction_cost,
    pymt.unit as transaction_cost_unit
    from join_payment_provider as trx
    left join payment_method_costs as pymt on trx.payment_cost_source = pymt.type
-- ⚠️ Failure mode B : NULL if seed has missing payment type
  ),

```

### The Two Failure Modes We Discovered

We will create a **separate issue for failure mode A** since it's related to fixing the demo model SQL -

Failure mode B is where we want to discuss as simply adding missing seeds might not be enough.

| Mode | Description | Example | Fixable by Seed? |
| --- | --- | --- | --- |
| **A: Upstream NULL** | `payment_method` is NULL at source → CASE falls through → `payment_cost_source` = NULL | Payment transactions: `gateway='paypal'` but `payment_method=NULL` | ❌ No --- needs code fix |
| **B: Seed Gap** | `payment_cost_source` has value but no matching row in seed | `demo_type` exists in data but not in seed | ✅ Yes --- add to seed, needs discussion |