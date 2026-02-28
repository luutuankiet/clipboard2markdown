## **The Fix: Decoupling Context from Code with** `synonyms`

The `synonyms` parameter in LookML is your primary tool for building this agile context store. It allows you to decouple fleeting business terminology from your agent's core application logic.

Instead of cluttering a system prompt, you enrich the semantic model itself:

```
# In your order_items.view.lkml file...

measure: returned_total_sale_price {
  type: sum
  label: "Returned Customer Revenue"
  description: "Total revenue from customers who have previously purchased but had no activity for over 90 days."

  # The context lives here, in the model, where it belongs:
  synonyms: ["win-back revenue", "winback sales", "re-engagement revenue"]
}

```

![image-20251116-092912.png](https://media-cdn.atlassian.com/file/619c9111-f5dd-4b9d-a92c-707203a4a1bd/image/cdn?allowAnimated=true&client=a1ab72a3-58cb-458b-9f89-664a4cc5eb54&collection=contentId-1384611841&height=125&max-age=2592000&mode=full-fit&source=mediaCard&token=eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhMWFiNzJhMy01OGNiLTQ1OGItOWY4OS02NjRhNGNjNWViNTQiLCJhY2Nlc3MiOnsidXJuOmZpbGVzdG9yZTpjb2xsZWN0aW9uOmNvbnRlbnRJZC0xMzg0NjExODQxIjpbInJlYWQiXX0sImV4cCI6MTc3MjI3MTc0NSwibmJmIjoxNzcyMjY4ODY1LCJhYUlkIjoiNzEyMDIwOjM0MTE3ZGZjLTIxYWYtNGJlYi1hYzdhLTY5Yzg2MGU5M2RmMyIsImh0dHBzOi8vaWQuYXRsYXNzaWFuLmNvbS9hcHBBY2NyZWRpdGVkIjpmYWxzZX0.07NOEtxvfq6XQ2gHsb3K-7IzuZcUy-c6XDhpLwurR5k&width=374)

*This architecture enables a continuous, collaborative governance cycle, where business and data teams work together to keep the agent's knowledge current.*

This simple shift is transformative.

-   **No Redeployment.** When a campaign ends, you comment out a line. The agent's code is untouched.

-   **No Downtime.** Changes flow through your standard, zero-downtime LookML workflow.

-   **No Bottleneck.** You've empowered the data practitioners closest to the business to manage the agent's vocabulary.

You're not just fixing a bug; you're building a scalable, well-governed system.