'use strict';

//dependencies
var kue = require('kue');
var redis = kue.redis;
var _ = require('lodash');
var async = require('async');
var datejs = require('date.js');
var uuid = require('node-uuid');
/**
 * @constructor
 * @description A job scheduling utility for kue
 * @param {Object} options configuration options, similar to kue configuration
 *                         options
 * @public
 */
function KueScheduler(options) {
    //extend default configurations
    //with custom provided configurations
    //and reference them for later use
    this.options = _.merge({
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    }, options || {});

    //start kue queue for scheduler
    //which will also do all plumbing work 
    //on setup job redis client
    this.queue = kue.createQueue(this.options);

    //a redis client for scheduling key expiry
    this.scheduler = redis.createClientFactory(this.options);

    //a redis client to listen for key expiry 
    this.listener = redis.createClientFactory(this.options);

    //listen for job key expiry
    //and schedule kue jobs to run
    this._subscribe();
}

/**
 * @function
 * @description generate an expiration key that is used to track job scheduling
 * @private
 */
KueScheduler.prototype._getJobExpiryKey = function(uuid) {
    return 'kue:scheduler:' + uuid;
};

/**
 * @function
 * @description generate job uuid from job expiry key
 * @private
 */
KueScheduler.prototype._getJobUUID = function(jobExpiryKey) {
    return jobExpiryKey.split(':')[2];
};

/**
 * @function
 * @description generate a storage key for the scheduled job data
 * @private 
 */
KueScheduler.prototype._getJobDataKey = function(uuid) {
    return 'kue:scheduler:data:' + uuid;
};

/**
 * @function
 * @description save job data into redis backend
 * @private
 */
KueScheduler.prototype._saveJobData = function(jobDataKey, jobData, done) {
    this.scheduler.hmset(jobDataKey, jobData, function(error, response) {
        done(error, jobData, response);
    });
};

/**
 * @function
 * @description retrieved saved job data from redis backend
 * @private
 */
KueScheduler.prototype._readJobData = function(jobDataKey, done) {
    this.scheduler.hgetall(jobDataKey, function(error, data) {
        done(error, data);
    });
};

KueScheduler.prototype._subscribe = function() {
    var scheduler = this;

    //listen for job key expiry
    this.listener.on('message', function(channel, jobExpiryKey) {
        //get job uuid
        scheduler._getJobUUID(jobExpiryKey);

        //get saved job data

    });

    //subscribe to key expiration events
    this.listener.subscribe('__keyevent@0__:expired');

};


KueScheduler.prototype.every = function(interval, jobDefinition) {
    var scheduler = this;

    //extend job definition with
    //scheduling data
    jobDefinition = _.merge(jobDefinition, {
        data: {
            schedule: 'RECCUR',
            reccurInterval: interval
        }
    });

    //generate job uuid
    var jobUUID = uuid.v1();

    async
        .parallel({
            jobExpiryKey: function(next) {
                next(null, scheduler._getJobExpiryKey(jobUUID));
            },
            jobDataKey: function(next) {
                next(null, scheduler._getJobDataKey(jobUUID));
            }
        }, function finish( /*error, results*/ ) {

        });
};

/**
 * @function
 * @description schedules a job to run once at a given time. 
 *              `when` can be a `Date` or a `String` such as `tomorrow at 5pm`.
 * @param  {Date|String}   when      when should this job run
 * @param  {Object}   jobDefinition valid kue job definition
 * @param  {Function} done          a callback to invoke on error or success
 * @public
 */
KueScheduler.prototype.schedule = function(when, jobDefinition, done) {
    if (arguments.length < 3) {
        done(new Error('Invalid number of parameters. See API doc.'));
    }

    var scheduler = this;

    async
        .waterfall(
            [
                function computeDelay(next) {
                    if (when instanceof Date) {
                        next(null, when);
                    } else {
                        scheduler._parse(when, next);
                    }
                },
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
                    scheduler._buildJob(delayedJobDefinition, next);
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
                done(error, job);
            });
};

/**
 * @function
 * @description schedule a job to be executed immediatelly after being saved
 * @param  {Object}   jobDefinition a valid kue job definition
 * @param  {Function} done          a callback to invoke lon success or error
 * @public
 */
KueScheduler.prototype.now = function(jobDefinition, done) {
    var scheduler = this;

    async
        .waterfall(
            [
                function buildJob(next) {
                    scheduler._buildJob(jobDefinition, next);
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
                done(error, job);
            });
};

/**
 * @function
 * @description build a kue job from a job definition
 * @param  {Object} jobDefinition valid kue job attributes
 * @param {Function} done a callback to invoke on error or success
 * @private
 */
KueScheduler.prototype._buildJob = function(jobDefinition, done) {
    var scheduler = this;
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
                    //check must job attributes
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
                        scheduler.queue.createJob(
                            jobDefinition.type,
                            jobDefinition.data
                        );

                    //apply all job attributes into kue job instance
                    _.keys(jobDefinition).forEach(function(attr) {
                        var fn = job[attr];
                        var isFunction = !_.isUndefined(fn) && _.isFunction(fn);

                        if (isFunction) {
                            fn.call(job, jobDefinition[attr]);
                        }
                    });

                    //we are done
                    done(null, job, validations);
                }
            });
};

/**
 * @function
 * @description parse date.js valid string and return a date object
 * @param  {String}   str  a valid date.js date string
 * @param  {Date}   offset  a valid date which will be used as offset in datejs
 * @param  {Function} done a callback to invoke on error or success
 * @private
 */
KueScheduler.prototype._parse = function(str, done) {
    try {
        var date = datejs(str);
        return done(null, date);
    } catch (error) {
        return done(error);
    }
};

/**
 * kue job schema
 * {
 *       id: Number,
 *       type: String,
 *       data: Object,
 *       result: String,
 *       priority: Number,
 *       progress: Number,
 *       state: String,
 *       error: String|Object,
 *       created_at: Date,
 *       promote_at: Date,
 *       updated_at: Date,
 *       failed_at: Date,
 *       duration: Number,
 *       delay: Number|Date,
 *       attempts: {
 *           made: Number,
 *           remaining: Number,
 *           max: Number
 *       }
 *   };
 */

/**
 * kue job events
 * - `enqueue` the job is now queued
 *- `promotion` the job is promoted from delayed state to queued
 *- `progress` the job's progress ranging from 0-100
 *- 'failed attempt' the job has failed, but has remaining attempts yet
 *- `failed` the job has failed and has no remaining attempts
 *- `complete` the job has completed
 */

/**
 * @description export kue scheduler
 * @type {Function}
 */
module.exports = KueScheduler;