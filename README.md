# kue-scheduler (WIP)

[![Build Status](https://travis-ci.org/lykmapipo/kue-scheduler.svg?branch=master)](https://travis-ci.org/lykmapipo/kue-scheduler)

A job scheduler for [kue](https://github.com/Automattic/kue) backed by [redis](http://redis.io), built for [node.js](http://nodejs.org)

## Requirements
- Redis 2.8.0 or higher.

- Enabling keyspace notification using `redis-cli`
```sh
$ redis-cli config set notify-keyspace-events KEAxe
```

## Installation
```
$ npm install kue-scheduler
```

## Usage
Require `kue-scheduler` after `kue` to be able to schedule jobs.
```js
var kue = require('kue');
require('kue-scheduler')

Or just simply
```js
var kue = require('kue-scheduler');
```

Then continue with `jobs` scheduling

- Schedule a job to run every `two seconds`
```js
var kue = require('kue-scheduler');
var Queue = kue.createQueue();

//create a job instance
var job = Queue
            .createJob('every', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

//schedule it to run every 4 seconds
Queue.every('2 seconds', job);


//somewhere process your scheduled jobs
Queue.process('every', function(job, finalize) {
    ...
});
```

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