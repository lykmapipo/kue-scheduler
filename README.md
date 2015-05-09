# kue-scheduler

[![Build Status](https://travis-ci.org/lykmapipo/kue-scheduler.svg?branch=master)](https://travis-ci.org/lykmapipo/kue-scheduler)

A job scheduler for [kue](https://github.com/Automattic/kue), backed by [redis](http://redis.io) and built for [node.js](http://nodejs.org)

Scheduling API is heavily inspired and borrowed from [agenda](https://github.com/rschmukler/agenda) and others.


## Requirements
- Redis 2.8.0 or higher.

- Enabling keyspace notification using `redis-cli`
```sh
$ redis-cli config set notify-keyspace-events Ex
```

## Installation
```
$ npm install kue-scheduler
```

## Usage
Require `kue-scheduler` to be able to schedule jobs.
```js
var kue = require('kue-scheduler');
```
*Note:exported value of `kue-scheduler` is a valid kue*

Then continue with `jobs` scheduling

### Schedule a job to run every `two seconds`
```js
var kue = require('kue-scheduler');
var Queue = kue.createQueue();

//create a job instance
var job = Queue
            .createJob('every', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

//schedule it to run every 2 seconds
Queue.every('2 seconds', job);


//somewhere process your scheduled jobs
Queue.process('every', function(job, done) {
    ...
    done();
});
```

### Schedule a job to run once '2 seconds from now'
```js
var kue = require('kue-scheduler');
var Queue = kue.createQueue();

//create a job instance
var job = Queue
            .createJob('schedule', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

//schedule it to run once 2 seconds from now
Queue.schedule('2 seconds from now', job);


//somewhere process your scheduled jobs
Queue.process('shedule', function(job, done) {
    ...
    done();
});
```


### Schedule a job to run now
```js
var kue = require('kue-scheduler');
var Queue = kue.createQueue();

//create a job instance
var job = Queue
            .createJob('now', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

//schedule it to run now
Queue.now(job);


//somewhere process your scheduled jobs
Queue.process('now', function(job, done) {
    ...
    done();
});
```

## API

### every(interval, job)
Runs a given `job instance` every after a given `interval`.

`interval` can either be a [human-readable interval format](https://github.com/rschmukler/human-interval) `String` or a [cron format](https://github.com/ncb000gt/node-cron) `String`.

```js
var kue = require('kue-scheduler');
var Queue = kue.createQueue();

//create a job instance
var job = Queue
            .createJob('every', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

//schedule it to run every 2 seconds
Queue.every('2 seconds', job);


//somewhere process your scheduled jobs
Queue.process('every', function(job, done) {
    ...
    done();
});
```


### schedule(when, job)
Schedules a given `job instance` to run once at a given time. `when` can either be a `Date instance` or a [date.js String](https://github.com/matthewmueller/date) `String` such as `tomorrow at 5pm`.

```js
var kue = require('kue-scheduler');
var Queue = kue.createQueue();

//create a job instance
var job = Queue
            .createJob('schedule', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

//schedule it to run once 2 seconds from now
Queue.schedule('2 seconds from now', job);


//somewhere process your scheduled jobs
Queue.process('shedule', function(job, done) {
    ...
    done();
});
```

### now(job)
Schedules a given `job instance` to run once immediately.

```js
var kue = require('kue-scheduler');
var Queue = kue.createQueue();

//create a job instance
var job = Queue
            .createJob('now', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

//schedule it to run now
Queue.now(job);

//somewhere process your scheduled jobs
Queue.process('now', function(job, done) {
    ...
    done();
});
```

## Events
Currently the only way to interact with `kue-scheduler` is through its events. `kue-scheduler` fires `schedule error` and `schedule success` events.

### `schedule error`
Use it to interact with `kue-scheduler` to get notified when an error occur.

```js
//listen on scheduler errors
Queue.on('schedule error', function(error) {
    ...
});

var job = Queue
    .createJob('now', data)
    .attempts(3)
    .backoff(backoff)
    .priority('normal');

Queue.now(job);
```

### `schedule success`
Use it to interact with `kue-scheduler` to obtained instance of current scheduled job. 

*Note: Use this event to attach instance level job events* 

```js
//listen on success scheduling
Queue.on('schedule success', function(job) {
    ...
});

var job = Queue
    .createJob('now', data)
    .attempts(3)
    .backoff(backoff)
    .priority('normal');

Queue.now(job);
```


## Testing
* Clone this repository

* Install all development dependencies
```sh
$ npm install
```

* Then run test
```sh
$ npm test
```

## Contribute
It will be nice, if you open an issue first so that we can know what is going on, then, fork this repo and push in your ideas. Do not forget to add a bit of test(s) of what value you adding.


## License 

(The MIT License)

Copyright (c) 2011 lykmapipo && Contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.