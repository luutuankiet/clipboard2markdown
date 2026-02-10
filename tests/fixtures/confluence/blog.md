## **Your AI Agent's Brain Doesn't Belong in Its Code**

Your phone buzzes. It's the Head of eCommerce. The big Q4 **"Win-back Campaign"** just launched to re-engage lapsed customers. She's in the new Looker agent and asks a simple, urgent question:

> *"How is the Win-back Campaign performing so far?"*

The agent, powered by a state-of-the-art LLM, responds with confusion:

> *"I'm sorry, I could not find a field related to a 'Win-back Campaign.' Would you like to see overall sales?"*

The momentum is gone. The promise of instant insight is broken. The executive closes the tab.

*Without a shared context, natural business language fails to connect with the AI agent, leading to user frustration.*

**This Isn't a Technology Failure. It's an Architectural Failure.**

This scenario isn't a failure of the AI. It's a failure of the system we built around it. The core problem is a question that every data team building with GenAI must answer:

## **Where should your AI's business knowledge live?**

The naive approach is to have a developer crack open the agent's code and update its core system prompt, hard-coding a rule like: `"When a user says 'Win-back Campaign', they mean the 'returned_total_sale_price' measure."`

This creates an operational nightmare. It's a fragile, unscalable architecture that leads to a vicious cycle:

1.  **The Business Changes:** A new campaign, "Holiday Push," is launched.

2.  **The Developer Bottleneck:** The business now has to file a ticket and wait for an agent developer to update the prompt.

3.  **The Slow Redeployment:** The entire agent application must be tested and redeployed, introducing risk and downtime.

4.  **The Cycle Repeats:** The business can only move as fast as the agent's development cycle allows.

This isn't agility. It's technical debt waiting to happen.

*The naive architecture creates a developer bottleneck, where every change in business terminology requires a slow and brittle update to the agent's core code.*

## **The Vision: A Living Context Store**

Imagine a different experience. When the "Holiday Push" campaign launches, the data team gets a notification. A LookML developer opens a view file, adds a single line of code, and commits the change.

Minutes later, the Head of eCommerce asks the agent, *"Show me the Holiday Push revenue."*

The agent understands instantly.

This isn't a fantasy. It's the result of a deliberate architectural choice: **Your agent's brain doesn't belong in its code; it belongs in your semantic layer.**

At Joon Solutions, we guide our clients to build their LookML model into a dynamic, living "context store." This is the key to maximizing the ROI of your Looker investment and building a truly agile data culture. It starts with one simple but powerful parameter.

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

*This architecture enables a continuous, collaborative governance cycle, where business and data teams work together to keep the agent's knowledge current.*

This simple shift is transformative.

-   **No Redeployment.** When a campaign ends, you comment out a line. The agent's code is untouched.

-   **No Downtime.** Changes flow through your standard, zero-downtime LookML workflow.

-   **No Bottleneck.** You've empowered the data practitioners closest to the business to manage the agent's vocabulary.

You're not just fixing a bug; you're building a scalable, well-governed system.

## **From Code to Collaboration: A Governance Framework**

This architectural shift enables a powerful, collaborative governance process. It turns data modeling from a technical task into an ongoing strategic dialogue with the business.

We work with clients to embed this cadence into their operations, constantly asking:

-   **At an Initiative Kick-off:** *"As we launch this campaign, what are the 1-2 key slang terms or project names we need to add as synonyms to our core LookML measures?"*

-   **During a Quarterly Review:** *"Which projects from last quarter have ended? Let's audit our* `synonyms` *to remove outdated terms and keep the agent's knowledge fresh."*

-   **In a Cross-Functional Audit:** *"Does 'Gross Margin' have synonyms that reflect how both the Finance team (*`GM`*) and the Sales team (*`Profitability`*) refer to it?"*

This is how you build a data culture that lasts.

*This architecture enables a continuous, collaborative governance cycle, where business and data teams work together to keep the agent's knowledge current.*

## **The Takeaway**

To unlock the true potential of your Looker agent, you must treat your LookML model as its brain. By embedding business context directly into the semantic layer with tools like `synonyms`, you build a system that is not only more intelligent but also vastly more agile and maintainable.

But vocabulary is just the start.

**In our next post, we'll explore the "Context" pillar, using** `descriptions` **and** `group_labels` **to teach your agent not just** ***what*** **things are called, but** ***why*** **they matter.**