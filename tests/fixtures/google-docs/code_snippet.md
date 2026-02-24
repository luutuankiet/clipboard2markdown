Relevant code from [redacted.py](https://github.com/redacted/redacted/blob/bd039ef14578b1227bb6e45079b5b4902c0f471b/cloud-run-jobs/get-lookml-fields/utils/looker_repo.py#L1191-L1215)

```
    def run(self):
        # get explore-model relation per model via Looker API `sdk.all_lookml_models()` endpoint
        explores = self.get_explore_model_df()

        views = self.get_view_df()

        # merge to get view-explore-model relation
# THIS IS THE PARSER FAILURE POINT
        view_model = pd.merge(views, explores, on=['explore_name', 'project'], how='left')

        # get field relation per view via parsing lookml code
        field_df = self.get_field_df()
        # ... rest of the code
```