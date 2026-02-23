=== Thread 27064 ===

*[27064] User - January 27, 2026 at 12:50 PM*

Hi @user1 / @user2 (Anna) ,
I've done the first stab exploring task #1 confirming the grain and transformation needed to pull in transaction_cost from `fct_transactions`, and reached a point needing **alignment how we should handle the possible fan-out issue** due to grain mismatch (`int_shopify_margins` at line item level <> `fct_tranasctions` at order level) .

Please find the [debrief doc here](https://docs.google.com/document/d/tmp/edit?usp=sharing). The challenge is that **a single transaction cost applies to an entire order,** and we need a consistent way to allocate it to the individual items in that order.

Could you please take a look and share your recommendation?

*[27065 ↩ 27064] user1 - January 27, 2026 at 1:23 PM (edited)*

@User Hey, we can keep the [existing logic](https://github.com/demorepo/demo/blob/461fb602fc8f1e9ecbd12270086cddc714bbe49a/models/intermediate/int_shopify_margins.sql#L310-L325) for splitting order level costs across the order's line items, it's using an even split across all products but taking line item quantity into account as well.

Edit: This applies to all order level cost components, so `packaging_cost` and `last_mile_cost` as well.

*[27939 ↩ 27064] User - February 5, 2026 at 3:36 PM*

@user1 hi user1 the PR draft is up - we have one question [in this comment section](https://github.com/demorepo/demo/pull/849#discussion_r2768908100) for you. Let us know if you need anything else!