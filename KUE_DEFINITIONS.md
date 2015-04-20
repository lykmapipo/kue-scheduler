## Job definition
```js
{
    id: Number,
    type: String,
    data: Object,
    result: String,
    priority: Number,
    progress: Number,
    state: String,
    error: String|Object,
    created_at: Date,
    promote_at: Date,
    updated_at: Date,
    failed_at: Date,
    duration: Number,
    delay: Number|Date,
    attempts: {
        made: Number,
        remaining: Number,
        max: Number
    }
};
```

## Events
- `enqueue` the job is now queued
- `promotion` the job is promoted from delayed state to queued
- `progress` the job's progress ranging from 0-100
- 'failed attempt' the job has failed, but has remaining attempts yet
- `failed` the job has failed and has no remaining attempts
- `complete` the job has completed
