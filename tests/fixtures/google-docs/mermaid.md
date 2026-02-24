### Architectural Implications for Our Parser

The key takeaway from this blueprint is that **the link between a Model and an Explore is established by the Looker** ***compiler*****, not by a simple directive within an** `.explore.lkml` **file itself.** This architectural reality is the root cause of the divergence. Our parser, by operating on static files, cannot replicate the compiler's final state for shared Explores, leading directly to the mapping issue.

*Reference:* [](https://cloud.google.com/looker/docs/reference/api-and-integration/api-reference/v4.0/lookml_model_explore)

-   [*Looker API Reference - LookML Objects*](https://cloud.google.com/looker/docs/reference/api-and-integration/api-reference/v4.0/lookml_model_explore)

-   [*Looker explore uniqueness*](https://discuss.google.dev/t/can-i-have-models-with-the-same-name-in-different-projects-on-the-same-instance/121141)

#### Example: The case of model `redacted`, `redacted_restricted` and resulting explore `redacted`

![embedded image omitted (base64 payload removed)](mermaid-image-placeholder)

```
graph TD
    %% --- SHARED SOURCE ---
    SharedExplore["EXPLORE AR_History.explore.lkml<br/><i>(base 'redacted')</i>"]:::shared

    subgraph "AR spoke lkml"
        direction LR
        Model1["MODEL redacted.model.lkml"]:::modelA
        Model1 -- "includes" --> SharedExplore
        Final1((":redacted<br/>(Visible)")):::resultA
        Model1 -- "Compiles to" --> Final1
    end

    subgraph "AR spoke restricted lkml"
        direction LR
        Model2["MODEL redacted_restricted.model.lkml"]:::modelB
        RefineExplore["EXPLORE +redacted.explore.lkml<br/><i>(Adds 'hidden: yes')</i>"]:::refine
        Model2 -- "includes" --> RefineExplore
        SharedExplore -- "refines" --> RefineExplore
        Final2((":redacted<br/>(Hidden)")):::resultB
        Model2 -- "Compiles to" --> Final2
    end

    %% --- FINAL API-LEVEL VIEW ---
    subgraph "Result: The Ground Truth resolved by Looker"
      API_A["EXPLORE <b>redacted::redacted</b><br/>(visible: true)"]:::resultA
      API_B["EXPLORE <b>redacted_restricted::redacted</b><br/>(visible: false)"]:::resultB
    end

    Final1 --> API_A
    Final2 --> API_B

    %% --- STYLING ---
    classDef shared fill:#f7f9f9,stroke:#5f6a6a,stroke-width:2px,stroke-dasharray: 5 5
    classDef modelA fill:#eaf2f8,stroke:#2980b9,stroke-width:2px
    classDef modelB fill:#fdedec,stroke:#c0392b,stroke-width:2px
    classDef refine fill:#fcf3cf,stroke:#f1c40f,stroke-width:1.5px
    classDef resultA fill:#e8f8f5,stroke:#16a085
    classDef resultB fill:#fadbd8,stroke:#943126
```

The above diagram provides a concrete, step-by-step illustration of the Looker Engine's compilation process, which is the "ground truth" our parser must account for. This example visualizes how a single base `explore` definition can result in two distinct, model-specific outputs, which is the root cause of the data duplication discussed in this report.