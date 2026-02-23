=== Root Chat 1 ===

*[root 1] Keith (external) - 3:26 PM*

hi @Annie @User
I am looking at the GCS storage of our system activity data. but seems the last modified is much later then the created date.
could I kindly check what cause the modification itself?
thank you

![](https://chat.google.com/u/0/api/get_attachment_url?tmp)

in the above example it is for `dashboard` object. the snapshot date is for `2026-02-05` ingested at `2026-02-06` but the last modified date is on `2026-02-21`

*[reply 1 to root 1] You - 5:35 PM*

Hi Keith! This is weird **I don't think any of our pipeline job has logic to update these object**s🤔
My hunch is some housekeeping policy we have on gcs that updated the object class from `hot` layer to `archive` layer as the parent bucket's default class is standard (hot) per screenshot. The modifiedtime bumps when the object metadata gets updated.
Impact wise the object lifecycle ends as soon as the content gets loaded to BQ in the same pipeline run so **modified time > 15d should not affect the integrity of BQ tables.**
That said think I can trace the logs to find the smoking gun, should take ~1h to collect and chain the events together. Let me know if you want to pursue this!

![](https://chat.google.com/u/0/api/get_attachment_url?tmp)

*[reply 2 to root 1] Keith (external) - 5:39 PM*

ah I see. that makes sense!
seems the other data also have the same update date after certain period.
thank you for catching that!

*[reply 3 to root 1] You - 5:39 PM*

awesome glad to help!