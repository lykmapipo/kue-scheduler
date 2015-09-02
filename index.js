'use strict';

/**
 * @module
 * @name kue-scheduler
 * @description A job scheduling utility for kue
 * @return {kue} a patched kue with job scheduling capability
 * @public
 */


//dependencies
var kue = require('kue');
var Job = kue.Job;
var Queue = kue;
//
//make use of kue redis factories
//for establishing redis connections
//
var redis = kue.redis;
var _ = require('lodash');
var async = require('async');
var datejs = require('date.js');
var uuid = require('node-uuid');
var humanInterval = require('human-interval');
var CronTime = require('cron').CronTime;


/**
 * @function
 * @description generate an expiration key that is used to track job scheduling
 * @return {String} a job expiry key
 * @private
 */
Queue.prototype._getJobExpiryKey = function(uuid) {
    //this refer to kue Queue instance context
    return this.options.prefix + ':scheduler:' + uuid;
};


/**
 * @function
 * @description test a give key if is valid job expiry key
 * @param  {String}  jobExpiryKey a key to test
 * @return {Boolean} true if is valid job expiry key else false
 * @private
 */
Queue.prototype._isJobExpiryKey = function(jobExpiryKey) {
    //test if key provide is valid job expiry key 
    var isJobExpiryKey =
        new RegExp('^' + this.options.prefix + ':scheduler:').test(jobExpiryKey);

    return isJobExpiryKey;
};


/**
 * @function
 * @description generate job uuid from job expiry key
 * @return {String} a scheduled job uuid
 * @private
 */
Queue.prototype._getJobUUID = function(jobExpiryKey) {
    //this refer to kue Queue instance context
    return jobExpiryKey.split(':')[2];
};


/**
 * @function
 * @description generate a storage key for the scheduled job data
 * @return {String} a key to retrieve a scheduled job data
 * @private 
 */
Queue.prototype._getJobDataKey = function(uuid) {
    //this refer to kue Queue instance context
    return this.options.prefix + ':scheduler:data:' + uuid;
};


/**
 * @function
 * @description save scheduled job data into redis backend
 * @private
 */
Queue.prototype._saveJobData = function(jobDataKey, jobData, done) {
    //this refer to kue Queue instance context

    this
        ._scheduler
        .set(
            jobDataKey,
            JSON.stringify(jobData),
            function(error /*, response*/ ) {
                done(error, jobData);
            });
};


/**
 * @function
 * @description retrieved saved scheduled job data from redis backend
 * @private
 */
Queue.prototype._readJobData = function(jobDataKey, done) {
    //this refer to kue Queue instance context

    this
        ._scheduler
        .get(jobDataKey, function(error, data) {
            done(error, JSON.parse(data));
        });
};


/**
 * @description Enable redis expiry keys notifications
 * @public
 */
Queue.prototype.enableExpiryNotifications = function() {
    //this refer to Queue instance context

    //enable 
    //Keyevent events, published with __keyevent@<db>__ prefix
    //
    //Expired events (events generated every time a key expires)
    this._cli.config('SET', 'notify-keyspace-events', 'Ex');
};


/**
 * @function
 * @description parse date.js valid string and return a date object
 * @param  {String}   str  a valid date.js date string
 * @param  {Date}   offset  a valid date which will be used as offset in datejs
 * @param  {Function} done a callback to invoke on error or success
 * @private
 */
Queue.prototype._parse = function(str, done) {
    //this refer to kue Queue instance context

    try {
        var date = datejs(str);
        return done(null, date);
    } catch (error) {
        return done(error);
    }
};


/**
 * @function
 * @description instantiate a kue job from a job definition hash
 * @param  {Object} jobDefinition valid kue job attributes
 * @param {Function} done a callback to invoke on error or success
 * @private
 */
Queue.prototype._buildJob = function(jobDefinition, done) {
    //this refer to kue Queue instance context
    var self = this;


    async
    .parallel({
            isDefined: function(next) {
                //is job definition provided
                var isObject = _.isPlainObject(jobDefinition);
                if (!isObject) {
                    next(new Error('Invalid job definition'));
                } else {
                    next(null, true);
                }
            },
            isValid: function(next) {
                //check must job for required attributes
                //
                //a valid job must have a type and
                //associated data
                var isValidJob = _.has(jobDefinition, 'type') &&
                    (
                        _.has(jobDefinition, 'data') &&
                        _.isPlainObject(jobDefinition.data)
                    );

                if (!isValidJob) {
                    next(new Error('Missing job type or data'));
                } else {
                    next(null, true);
                }
            }
        },
        function finish(error, validations) {
            //is not well formatted job
            //back-off
            if (error) {
                done(error);
            }

            //otherwise create a job
            //from job definition
            else {
                //extend default job options with
                //custom job definition
                var jobDefaults = {
                    data: {
                        schedule: 'NOW'
                    }
                };
                jobDefinition = _.merge(jobDefaults, jobDefinition);

                //instantiate kue job
                var job =
                    self.createJob(
                        jobDefinition.type,
                        jobDefinition.data
                    );

                //apply all job attributes into kue job instance
                _.keys(jobDefinition).forEach(function(attribute) {
                    //if given job definition attribute
                    //is one of job instance method
                    //apply it
                    var fn = job[attribute];
                    var isFunction = !_.isUndefined(fn) && _.isFunction(fn);

                    if (isFunction) {
                        fn.call(job, jobDefinition[attribute]);
                    }
                });

                //re attach max attempts
                //if we failed in above

                //re attach max attempts from attempts hash
                if (jobDefinition.attempts) {
                    job.attempts(jobDefinition.attempts.max);
                }

                //re attach max attempts from _max_attempts
                /*jshint camelcase:false*/
                if (jobDefinition._max_attempts) {
                    job.attempts(jobDefinition._max_attempts);
                }
                /*jshint camelcase:true*/

                //we are done
                done(null, job, validations);
            }
        });
};



/**
 * @function
 * @description compute next run time of the given job data
 * @private
 */
Queue.prototype._computeNextRunTime = function(jobData, done) {
    //this refer to kue Queue instance context

    //grab job reccur interval
    var interval = jobData.reccurInterval;


    async
    .parallel({
        //compute next run from cron interval
        cron: function(after) {
            try {
                //last run of the job is now if not exist
                var lastRun =
                    jobData.lastRun ? new Date(jobData.lastRun) : new Date();

                //compute next date from the cron interval
                var cronTime = new CronTime(interval);
                var nextRun = cronTime._getNextDateFrom(lastRun);

                // Handle cronTime giving back the same date 
                // for the next run time
                if (nextRun.valueOf() === lastRun.valueOf()) {
                    nextRun =
                        cronTime._getNextDateFrom(
                            new Date(lastRun.valueOf() + 1000)
                        );
                }

                //return computed time
                after(null, nextRun.toDate());

            } catch (ex) {
                //to allow parallel run with other interval parser
                after(null, null);
            }
        },

        //compute next run from human interval
        human: function(after) {
            try {
                //last run of the job is now if not exist
                var lastRun =
                    jobData.lastRun ? new Date(jobData.lastRun) : new Date();

                var nextRun =
                    new Date(lastRun.valueOf() + humanInterval(interval));

                //return computed time
                after(null, nextRun);
            } catch (ex) {
                //to allow parallel run with other interval parser
                after(null, null);
            }
        }
    }, function finish(error, results) {
        //was parsed as cron interval?
        if (!_.isNull(results.cron)) {
            return done(null, results.cron);
        }

        //was parsed as human interval?
        else if (!_.isNull(results.human)) {
            return done(null, results.human);
        }

        //all parser failed
        else {
            return done(new Error('Invalid reccur interval'));
        }
    });
};


/**
 * @function
 * @description subscribe to key expiry events
 * @private
 */
Queue.prototype._subscribe = function() {
    //this refer to kue Queue instance context
    var self = this;

    //listen for job key expiry
    this
        ._listener
        .on('message', function(channel, jobExpiryKey) {

            //test if the event key is job expiry key 
            if (!self._isJobExpiryKey(jobExpiryKey)) {
                return;
            }

            async
            .waterfall(
                [
                    //get job data
                    function getJobData(next) {
                        //get job uuid
                        var jobUUID = self._getJobUUID(jobExpiryKey);

                        //get saved job data
                        self._readJobData(self._getJobDataKey(jobUUID), next);
                    },
                    //compute next run time
                    function computeNextRun(jobData, next) {
                        self
                            ._computeNextRunTime(jobData, function(error, nextRunTime) {
                                if (error) {
                                    next(error);
                                } else {
                                    next(null, jobData, nextRunTime);
                                }
                            });
                    },
                    //resave the key to rerun this job again
                    function resaveJobKey(jobData, nextRunTime, next) {

                        //compute delay
                        var now = new Date();
                        var delay = nextRunTime.getTime() - now.getTime();

                        self
                            ._scheduler
                            .set(jobExpiryKey, '', 'PX', delay, function(error) {
                                if (error) {
                                    next(error);
                                } else {
                                    next(null, jobData);
                                }
                            });
                    },
                    function buildJob(jobDefinition, next) {
                        self._buildJob(jobDefinition, next);
                    }
                ],
                function(error, job) {
                    if (error) {
                        self.emit('schedule error', error);
                    } else {
                        //run job immediately
                        self.now(job);
                    }
                });
        });

    //subscribe to key expiration events
    self._listener.subscribe('__keyevent@0__:expired');

};


/**
 * @function
 * @description schedule a job to run every after a specified interval
 * 
 *              If an error occur, it will be emitted using `schedule error` key
 *              with error passed as first parameter on event.
 *              If job schedule successfully, it will be emitted using
 *              `schedule success` key with job instance passed as a first parameter
 *              on event.
 *              
 * @param  {String} interval      scheduled interval in either human interval or 
 *                                cron format
 * @param  {Job} job valid kue job instance which has not been saved
 * @private
 */
Queue.prototype.every = function(interval, job) {
    //this refer to kue Queue instance context
    var self = this;

    if (arguments.length !== 2) {
        self.emit(
            'schedule error',
            new Error('Invalid number of parameters. See API doc.')
        );
    }

    //extend job definition with
    //scheduling data
    var jobDefinition = _.merge(job.toJSON(), {
        reccurInterval: interval,
        data: {
            schedule: 'RECCUR'
        },
        backoff: job._backoff
    });

    //generate job uuid
    var jobUUID = uuid.v1();

    async
    .parallel({
        jobExpiryKey: function(next) {
            next(null, self._getJobExpiryKey(jobUUID));
        },
        jobDataKey: function(next) {
            next(null, self._getJobDataKey(jobUUID));
        },
        nextRunTime: function(next) {
            self._computeNextRunTime(jobDefinition, next);
        }
    }, function finish(error, results) {

        var now = new Date();
        var delay = results.nextRunTime.getTime() - now.getTime();

        async
        .waterfall([
            function saveJobData(next) {
                //save job data
                self._saveJobData(results.jobDataKey, jobDefinition, next);
            },
            function setJobKeyExpiry(jobData, next) {
                //save key an wait for it to expiry
                self._scheduler.set(results.jobExpiryKey, '', 'PX', delay, next);
            }
        ], function(error) {
            if (error) {
                self.emit('schedule error', error);
            }
        });

    });
};


/**
 * @function
 * @description schedules a job to run once at a given time. 
 *              `when` can be a `Date` or a valid `date.js string` 
 *              such as `tomorrow at 5pm`.
 *              
 *              If an error occur, it will be emitted using `schedule error` key
 *              with error passed as first parameter on event.
 *              If job schedule successfully, it will be emitted using
 *              `schedule success` key with job instance passed as a first parameter
 *              on event.
 *              
 * @param  {Date|String}   when      when should this job run
 * @param  {Job}   jobDefinition valid kue job instance which has not been saved
 * @private
 */
Queue.prototype.schedule = function(when, job) {
    //this refer to kue Queue instance context
    var self = this;

    if (arguments.length !== 2) {
        self.emit(
            'schedule error',
            new Error('Invalid number of parameters. See API doc.')
        );
    }

    var jobDefinition = _.extend(job.toJSON(), {
        backoff: job._backoff
    });

    async
    .waterfall(
        [
            function computeDelay(next) {
                //when is date instance
                if (when instanceof Date) {
                    next(null, when);
                }

                //otherwise parse as date.js string
                else {
                    self._parse(when, next);
                }
            },
            //set job delay
            function setDelay(scheduledDate, next) {
                next(
                    null,
                    _.merge(jobDefinition, {
                        delay: scheduledDate,
                        data: {
                            schedule: 'ONCE'
                        }
                    })
                );
            },
            function buildJob(delayedJobDefinition, next) {
                self._buildJob(delayedJobDefinition, next);
            },
            function saveJob(job, validations, next) {
                job.save(function(error) {
                    if (error) {
                        next(error);
                    } else {
                        next(null, job);
                    }
                });
            }
        ],
        function finish(error, job) {
            if (error) {
                self.emit('schedule error', error);
            } else {
                self.emit('schedule success', job);
            }
        });
};


/**
 * @function
 * @description schedule a job to be executed immediatelly after being saved.
 *              If an error occur, it will be emitted using `schedule error` key
 *              with error passed as first parameter on event.
 *              If job schedule successfully, it will be emitted using
 *              `schedule success` key with job instance passed as a first parameter
 *              on event.
 * @param  {Job}   job a valid kue job instance which has not been saved
 * @private
 */
Queue.prototype.now = function(job) {
    //this refer to kue Queue instance context
    var self = this;

    if (arguments.length === 0 && !(job instanceof Job)) {
        self.emit('schedule error', new Error('Invalid job. See API doc.'));
    }

    var jobDefinition = _.extend(job.toJSON(), {
        backoff: job._backoff
    });

    async
    .waterfall(
        [
            function buildJob(next) {
                self._buildJob(jobDefinition, next);
            },
            function saveJob(job, validations, next) {
                job.save(function(error) {
                    if (error) {
                        next(error);
                    } else {
                        next(null, job);
                    }
                });
            }
        ],
        function finish(error, job) {
            if (error) {
                self.emit('schedule error', error);
            } else {
                self.emit('schedule success', job);
            }
        });
};


//patch Queue shutdown to allow
//for scheduler resource cleanups
//
var shutdown = Queue.prototype.shutdown;
//
//
/**
 * Graceful shutdown
 *
 * @param {Function} fn callback
 * @return {Queue} for chaining
 * @api public
 */
Queue.prototype.shutdown = function( /*fn, timeout, type*/ ) {
    //this refer to kue Queue instance context

    //unsubscribe to key expiry events
    this._listener.unsubscribe('__keyevent@0__:expired');

    //close _scheduler,
    // _lister and
    // _cli redis connctions
    this._listener.end();
    this._scheduler.end();
    this._cli.end();

    //then call previous Queue shutdown
    shutdown.apply(this, arguments);
};


//patch kue createQueue to allow options
//to be stored in the Queue instance
//and setup scheduler resources
var createQueue = kue.createQueue;
kue.createQueue = function(options) {
    options = _.merge({
        prefix: 'q',
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    }, options || {});

    //store passed options into Queue
    Queue.prototype.options = options;

    //instatiare kue
    var queue = createQueue.call(kue, options);

    //a redis client for scheduling key expiry
    // queue.scheduler = redis.createClientFactory(options);
    queue._scheduler = redis.createClient();

    //a redis client to listen for key expiry 
    queue._listener = redis.createClient();

    //redis client to allow configurations commands
    queue._cli = redis.createClient();

    //auto enable key expiry notifications
    queue.enableExpiryNotifications();

    //listen for job key expiry
    //and schedule kue jobs to run
    queue._subscribe();

    //return patched queue
    return queue;
};


/**
 * @description export kue with scheduler attached
 * @type {Function}
 */
module.exports = kue;