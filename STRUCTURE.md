# Data Structure

## Kue Job
```js
{
    id: Number,
    type: String,
    _ttl: Number,
    _delay: Number,
    priority: Number,
    _progress: Number,
    _attempts: Number,
    _max_attempts: Number,
    _state: Object,
    _error: Object,
    created_at: Date,
    promote_at: Date,
    updated_at: Date,
    failed_at: Date,
    started_at: Date,
    duration: Number
    workerId: Object,
    _removeOnComplete: Boolen,
    data: Object,
    result: Object,
    progress_data: Object
}
```