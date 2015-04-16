'use strict';

//dependencies
var kue = require('kue');
var redis = kue.redis;
var _ = require('lodash');
var async = require('async');
var datejs = require('date.js');
var uuid = require('node-uuid');
var humanInterval = require('human-interval');
var CronTime = require('cron').CronTime;
var noop = function() {};

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
        prefix: 'p',
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
    return this.options.prefix + ':scheduler:' + uuid;
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
    return this.options.prefix + ':scheduler:data:' + uuid;
};

/**
 * @function
 * @description save job data into redis backend
 * @private
 */
KueScheduler.prototype._saveJobData = function(jobDataKey, jobData, done) {
    this.scheduler.set(jobDataKey, JSON.stringify(jobData), function(error, response) {
        done(error, jobData, response);
    });
};

/**
 * @function
 * @description retrieved saved job data from redis backend
 * @private
 */
KueScheduler.prototype._readJobData = function(jobDataKey, done) {
    this.scheduler.get(jobDataKey, function(error, data) {
        done(error, JSON.parse(data));
    });
};

KueScheduler.prototype._subscribe = function() {
    var self = this;

    //listen for job key expiry
    this.listener.on('message', function(channel, jobExpiryKey) {
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
KueScheduler.prototype._computeNextRunTime = function(jobData, done) {
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


KueScheduler.prototype.every = function(interval, jobDefinition) {

    var self = this;

    //extend job definition with
    //scheduling data
    jobDefinition = _.merge(jobDefinition, {
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
 * @param  {Object}   jobDefinition valid kue job definition
 * @param  {Function} done          a callback to invoke on error or success
 * @public
 */
KueScheduler.prototype.schedule = function(when, jobDefinition, done) {
    if (arguments.length < 3) {
        done(new Error('Invalid number of parameters. See API doc.'));
    }

    var self = this;

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
 * @param  {Object}   jobDefinition a valid kue job definition
 * @param  {Function} done          a callback to invoke lon success or error
 * @public
 */
KueScheduler.prototype.now = function(jobDefinition, done) {
    var self = this;

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
 * @description build a kue job from a job definition
 * @param  {Object} jobDefinition valid kue job attributes
 * @param {Function} done a callback to invoke on error or success
 * @private
 */
KueScheduler.prototype._buildJob = function(jobDefinition, done) {
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
                        self.queue.createJob(
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
 * @description export kue scheduler
 * @type {Function}
 */
module.exports = KueScheduler;