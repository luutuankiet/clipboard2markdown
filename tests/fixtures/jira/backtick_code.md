To accurately map product groupings to SKUs - which is used by our warehouses to determine the parcel type for an order - we're applying the code as an item attribute directly on item cards in ERP System. This keeps the configuration maintainable by the Supply team and visible for the rest of the org.

I've set up an endpoint in ERP containing all item attributes associated with specific SKUs, which can be used to export the product group code associated with a specific product. It's available at `https://api.example-erp.dynamics.com/v2.0/Production/api/ACME/EL/v1.0/itemAttributes` (read only).

## Remaining tasks

- [ ] Add an `itemAttributesStream` to tap-erp-system, pointing to `/itemAttributes`
- [ ] Create a task, job and schedule for the stream in DataTool
- [ ] Push to production

For local testing, access the current ERP client secret in Secret manager.

## Endpoint schema

```
{
    "guid": "00000000-0000-0000-0000-000000000001",
    "id": 1,
    "name": "Product group",
    "valueType": "Option",
    "blocked": false,
    "unitOfMeasure": "",
    "createdDateTime": "2026-01-01T08:00:00.000Z",
    "valueGuid": "00000000-0000-0000-0000-000000000002",
    "valueId": 3,
    "valueDateType": "0001-01-01",
    "valueNumericType": 0,
    "valueTextType": "DEMO",
    "valueBlocked": false,
    "itemNumber": "SKU000001",
    "lastModifiedDateTime": "2026-01-01T09:00:00.000Z",
    "auxiliaryIndex1": 1,
    "auxiliaryIndex2": 27,
    "auxiliaryIndex3": 1
}
```

Primary key: `guid + valueGuid + SKU`
Replication key: `lastModifiedDateTime`

Note that this endpoint lists all attributes, not just "Product group".