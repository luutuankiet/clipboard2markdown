### Paradigm 1: Physical Layer Joins (The "Flattening" Approach)

Before Tableau version 2020.2, this was the *only* way to join data. Today, it still occurs when a Tableau developer double-clicks a table in the UI to force a hard database join.

**The Concept:**

Physical Joins execute exactly like a standard SQL `JOIN`. They merge tables into a single, massive, flattened denormalized table *before* analysis begins.

```
flowchart LR
    subgraph Database Execution
        O[orders] -->|INNER JOIN <br>orders.id = order_items.order_id| OI[order_items]
        OI -->|Produces| F[Single Flattened Table]
    end
    subgraph Analysis
        F --> Viz(Dashboard queries <br> the flattened table)
    end

    style F fill:#E67C73,stroke:#fff,color:#fff
```

![image-20260228-082048.png](blob:https://joonsolutions.atlassian.net/6fcbc05d-2c9a-46ae-8d3a-7989f73463af#media-blob-url=true&id=d92286d3-34c1-4062-89ca-fb357da2a3a1&collection=contentId-1505886209&contextId=1505886209&mimeType=image%2Fpng&name=image-20260228-082048.png&size=68307&width=1051&height=148&alt=image-20260228-082048.png)

**The XML Signature:**

When parsing the `.twb`, look inside the `<datasource>` block for `<relation type='join'>`. It reads almost exactly like a SQL statement.

```
<!-- Parsing the Physical Join from .twb -->
<datasource caption='Orders and Items' name='federated.123'>
  <connection>
    <!-- 1. The Join Declaration -->
    <relation type='join'>
      <clause type='join' />
      <!-- 2. The Tables -->
      <relation name='orders' table='[dbo].[orders]' type='table' />
      <relation name='order_items' table='[dbo].[order_items]' type='table' />
      <!-- 3. The ON Clause -->
      <cols>
        <col joining-fields='[orders].[id]' name='[order_items].[order_id]' />
      </cols>
      <!-- 4. The Join Type -->
      <join type='inner' />
    </relation>
  </connection>
</datasource>

```

**How to migrate this to LookML:**

This maps 1:1 with a standard LookML join. However, there is a massive "Gotcha" here.

Because Tableau Physical Joins flatten the data, joining `orders` to `order_items` causes row duplication (fan-out). To fix this, the Tableau developer likely wrote complex Level of Detail (LOD) formulas (e.g., `{FIXED [Order ID] : MIN([Order Revenue])}`) to force the revenue to aggregate correctly.

**LookML Translation:**

```
explore: orders {
  join: order_items {
    type: inner
    sql_on: ${orders.id} = ${order_items.order_id} ;;

    # TEACHER'S NOTE: Because you define 'one_to_many' here,
    # Looker's Symmetric Aggregates will automatically prevent the fan-out.
    # Therefore, DO NOT migrate the client's complex LOD formulas!
    # Just use standard LookML measures.
    relationship: one_to_many
  }
}

```

---