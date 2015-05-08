'use strict';

/**
 * @module
 * @description A job scheduling utility for kue
 * @public
 */

//dependencies
var kue = require('kue');
var Queue = kue;
var redis = kue.redis;
var _ = require('lodash');
var async = require('async');
var datejs = require('date.js');
var uuid = require('node-uuid');
var humanInterval = require('human-interval');
var CronTime = require('cron').CronTime;
var noop = function() {};

/**
 * @function
 * @description generate an expiration key that is used to track job scheduling
 * @private
 */
Queue.prototype._getJobExpiryKey = function(uuid) {
    //this refer to kue Queue instance context
    return this.options.prefix + ':scheduler:' + uuid;
};


/**
 * @function
 * @description generate job uuid from job expiry key
 * @private
 */
Queue.prototype._getJobUUID = function(jobExpiryKey) {
    //this refer to kue Queue instance context
    return jobExpiryKey.split(':')[2];
};


/**
 * @function
 * @description generate a storage key for the scheduled job data
 * @private 
 */
Queue.prototype._getJobDataKey = function(uuid) {
    //this refer to kue Queue instance context
    return this.options.prefix + ':scheduler:data:' + uuid;
};


/**
 * @function
 * @description save job data into redis backend
 * @private
 */
Queue.prototype._saveJobData = function(jobDataKey, jobData, done) {
    //this refer to kue Queue instance context

    this
        .scheduler
        .set(
            jobDataKey,
            JSON.stringify(jobData),
            function(error, response) {
                done(error, jobData, response);
            });
};


/**
 * @function
 * @description retrieved saved job data from redis backend
 * @private
 */
Queue.prototype._readJobData = function(jobDataKey, done) {
    //this refer to kue Queue instance context

    this
        .scheduler
        .get(jobDataKey, function(error, data) {
            done(error, JSON.parse(data));
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
        .listener
        .on('message', function(channel, jobExpiryKey) {
            var jobDefinition;

            async
                .waterfall(
                    [
                        //get job data
                        function(next) {
                            //get job uuid
                            var jobUUID = self._getJobUUID(jobExpiryKey);

                            //get saved job data
                            self._readJobData(self._getJobDataKey(jobUUID), next);
                        },
                        //compute next run time
                        function(jobData, next) {
                            jobDefinition = jobData;
                            self._computeNextRunTime(jobData, next);
                        },
                        //resave the key to rerun this job again
                        function(nextRunTime, next) {
                            var now = new Date();
                            var delay = nextRunTime.getTime() - now.getTime();

                            self.scheduler.set(jobExpiryKey, '', 'PX', delay, next);
                        },
                        //create kue NOW job
                        function(response, next) {
                            self.now(jobDefinition, next);
                        },
                        //TODO use event emitter to emit any error
                    ], noop);
        });

    //subscribe to key expiration events
    this.listener.subscribe('__keyevent@0__:expired');

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
                    //last run of the job is now
                    var lastRun = jobData.lastRun || new Date();

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

                    after(null, nextRun.toDate());

                } catch (ex) {
                    //to allow parallel run with other interval parser
                    after(null, null);
                }
            },
            //compute next run from human interval
            human: function(after) {
                try {
                    //last run of the job is now
                    var lastRun = jobData.lastRun || new Date();

                    var nextRun =
                        new Date(lastRun.valueOf() + humanInterval(interval));

                    after(null, nextRun);
                } catch (ex) {
                    //to allow parallel run with other interval parser
                    after(null, null);
                }
            }
        }, function finish(error, results) {
            //parsed as later cron interval
            if (!_.isNull(results.cron)) {
                return done(null, results.cron);
            }

            //parsed as human interval
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
 * @description schedule a job to run every after a specified interval
 * @param  {String} interval      scheduled interval in or human interval or 
 *                                cron format
 * @param  {Job} job valid kue job instance which has not been saved
 * @private
 */
Queue.prototype.every = function(interval, job) {
    //this refer to kue Queue instance context
    //
    if (arguments.length < 2) {
        throw new Error('Invalid number of parameters. See API doc.');
    }

    var self = this;

    //extend job definition with
    //scheduling data
    var jobDefinition = _.merge(job.toJSON(), {
        reccurInterval: interval,
        data: {
            schedule: 'RECCUR'
        }
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

            //save job data
            self._saveJobData(results.jobDataKey, jobDefinition, noop);

            //save key an wait for it to expiry
            self.scheduler.set(results.jobExpiryKey, '', 'PX', delay, noop);
        });
};

/**
 * @function
 * @description schedules a job to run once at a given time. 
 *              `when` can be a `Date` or a `String` such as `tomorrow at 5pm`.
 * @param  {Date|String}   when      when should this job run
 * @param  {Job}   jobDefinition valid kue job instance which has not been saved
 * @param  {Function} done          a callback to invoke on error or success
 * @public
 */
Queue.prototype.schedule = function(when, job, done) {
    //this refer to kue Queue instance context
    //
    if (arguments.length < 3) {
        done(new Error('Invalid number of parameters. See API doc.'));
    }

    var self = this;

    var jobDefinition = _.extend(job.toJSON(), {
        backoff: job._backoff
    });

    async
        .waterfall(
            [
                function computeDelay(next) {
                    if (when instanceof Date) {
                        next(null, when);
                    } else {
                        self._parse(when, next);
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
                done(error, job);
            });
};


/**
 * @function
 * @description schedule a job to be executed immediatelly after being saved
 * @param  {Job}   job a valid kue job instance which has not been saved
 * @param  {Function} done          a callback to invoke lon success or error
 * @public
 */
Queue.prototype.now = function(job, done) {
    //this refer to kue Queue instance context
    //
    if (arguments.length < 2) {
        done(new Error('Invalid number of parameters. See API doc.'));
    }

    var self = this;

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
                done(error, job);
            });
};


/**
 * @function
 * @description build a kue job from a job definition hash
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
                        self.createJob(
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

                    //attach max attempts
                    if (jobDefinition.attempts) {
                        job.attempts(jobDefinition.attempts.max);
                    }

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
 * @description parse date.js valid string and return a date object
 * @param  {String}   str  a valid date.js date string
 * @param  {Date}   offset  a valid date which will be used as offset in datejs
 * @param  {Function} done a callback to invoke on error or success
 * @private
 */
Queue.prototype._parse = function(str, done) {
    try {
        var date = datejs(str);
        return done(null, date);
    } catch (error) {
        return done(error);
    }
};

//patch kue createQueue to allow options
//to be stored in the kue
//and setup of scheduler
var createQueue = kue.createQueue;
kue.createQueue = function(options) {
    options = _.merge({
        prefix: 'q',
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    }, options || {});

    //reference options
    Queue.prototype.options = options;

    var queue = createQueue.call(kue, options);

    //a redis client for scheduling key expiry
    queue.scheduler = redis.createClientFactory(options);

    //a redis client to listen for key expiry 
    queue.listener = redis.createClientFactory(options);

    //listen for job key expiry
    //and schedule kue jobs to run
    queue._subscribe();

    return queue;
};


/**
 * @description export kue with scheduler attached
 * @type {Function}
 */
module.exports = kue;