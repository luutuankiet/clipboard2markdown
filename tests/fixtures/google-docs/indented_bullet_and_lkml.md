# Updated troubleshooting report

### 1. Local LookML Structure

#### View Definition

-   The `redacted` **view** is defined in the viewfile:
    -   `03_redacted/02_redacted/redacted.view.lkml`

```
view: redacted {
  sql_table_name: `@{bq_project}@{bq_business}.redacted`;;
}
```

#### Explore Inclusions

This view is included by two explores:

1.  `redacted` **Explore:**

-   File: `02_Models/SPC_redacted.explore.lkml`

```
explore: redacted {
  view_name: redacted
}
```

1.  `redacted` **(Test Explore):**

-   File: `99_Tests/Common_SPC_Tests.model.lkml`

**Note:** All LookML under the `99_Tests` directory **is ignored by the** `looker_repo` **parser**. This explore is irrelevant for the report onwards.

```
explore: redacted{
  view_name: redacted
  hidden: yes
  fields: [redacted.PK_FK_Columns*]
}
```

#### Model Inclusions

The `redacted` explore (from step 1) is then included by two models:

`space yield spoke` **Model:**

-   File: `02_Models/SpaceYield_Spoke.model.lkml`

`include:` `"/02_Models/SPC_redacted.explore.lkml"`

`restricted space yield spoke` **Model (Refinement):**

-   File: `02_Models/01_Restricted/redactedRestricted.model.lkml`
-   This model **refines** the explore:

```
explore: +redacted {
  hidden: yes
}
```

-   It is important to note from the raw lkml code above
    -   Our looker_repo parser **does not have the direct context view_name** as this parameter is not explicitly defined here.

[This patch](https://github.com/redacted/redacted/pull/49) failed to extract `view_name`  in this refined explore as **the explore name is different from its base view name** , `redacted`.