### Hierarchy & Cardinality Model

The Looker Engine resolves and relates entities in a strict, unalterable order. Understanding the relationships and unique identifiers at each level is critical to understanding the parsing challenge.

*(For full context, please see Appendix: "Reproducing the Ground Truth". The* `sdk` *methods referenced are from Looker's official Python library.)*

*![embedded image omitted (base64 payload removed)](mermaid-image-placeholder)*

```
graph TD
    subgraph "Looker Entity Hierarchy"
        %% Define Node Shapes & Text
        A(Project):::root;
        B(Model):::container;
        C(Explore):::query;
        D(View):::definition;
        E(Field):::definition;

        %% Define Relationships & Cardinality
        A -- "Contains 1..*" --> B;
        B -- "Exposes 1..*" --> C;
        C -- "Joins 1..*" --> D;
        D -- "Contains 1..*" --> E;

        %% Styling Classes
        classDef root fill:#d4e6f1,stroke:#2980b9,stroke-width:2px,font-weight:bold;
        classDef container fill:#e8f8f5,stroke:#16a085,stroke-width:2px;
        classDef query fill:#fcf3cf,stroke:#f1c40f,stroke-width:2px;
        classDef definition fill:#fdedec,stroke:#c0392b,stroke-width:1px;
    end
```