'use strict';

/**
 * @module
 * @name kue-scheduler
 * @description A job scheduling utility for kue
 * @return {kue} a patched kue with job scheduling capabilities
 * @public
 */


//dependencies
var kue = require('kue-unique');
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
    //this refer to kue Queue instance context

    var isJobExpiryKey = this._jobExpiryKeyValidator.test(jobExpiryKey);

    return isJobExpiryKey;
};


/**
 * @description check if job exists and its ttl has not timeout
 * @param  {String}   jobExpiryKey valid job expiry key
 * @param  {Function} done         a function to invoke on success or error
 * @return {Boolean}               whether job already scheduled or not
 * @private
 */
Queue.prototype._isJobAlreadyScheduled = function(jobExpiryKey, done) {
    //this refer to kue Queue instance context

    async.parallel({

        exists: function isKeyExists(next) {
            this._scheduler.exists(jobExpiryKey, next);
        }.bind(this),

        ttl: function isKeyExpired(next) {
            this._scheduler.pttl(jobExpiryKey, next);
        }.bind(this)

    }, function(error, results) {
        if (error) {
            done(error);
        } else {
            var exists = (results.exists && results.exists === 1) ? true : false;
            var active = (results.ttl && results.ttl > 0) ? true : false;

            var alreadyScheduled = exists && active;
            done(null, alreadyScheduled);
        }
    });
};


/**
 * @description generate job uuid from job definition
 * @param  {Object} jobDefinition valid job definition
 * @return {String}               job uuid
 * @private
 */
Queue.prototype._generateJobUUID = function(jobDefinition) {
    //this refer to kue Queue instance context

    var unique = jobDefinition.data ? jobDefinition.data.unique : undefined;

    //deduce job uuid from unique key
    if (unique) {
        return _.snakeCase(unique);
    }

    //otherwise generate uuid
    else {
        return uuid.v1();
    }

};


/**
 * @function
 * @description generate job uuid from job expiry key or job data key
 * @return {String} a scheduled job uuid
 * @private
 */
Queue.prototype._getJobUUID = function(key) {
    //this refer to kue Queue instance context
    var uuid;

    var splits = key.split(':');

    //deduce job uuid from job expiry key
    //kue:scheduler:<jobExpirykey>
    if (splits.length === 3) {
        uuid = splits[2];
    }

    //deduce job uuid from job data key
    //kue:scheduler:data:<jobExpirykey>
    if (splits.length === 4) {
        uuid = splits[3];
    }

    return uuid;

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
        .set(jobDataKey, JSON.stringify(jobData), function(error /*, response*/ ) {
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
 * @function
 * @description Enable redis expiry keys notifications
 * @public
 */
Queue.prototype.enableExpiryNotifications = function() {
    //this refer to Queue instance context

    //enable expired events (events generated every time a key expires)
    this._cli.config('SET', 'notify-keyspace-events', 'Ex');
};


/**
 * @function
 * @description parse date.js valid string and return a date object
 * @param  {String}   str  a valid date.js date string
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

    async.parallel({
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
                //check job for required attributes
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
                jobDefinition = _.merge({}, jobDefaults, jobDefinition);

                //instantiate kue job
                var job =
                    this.createJob(jobDefinition.type, jobDefinition.data);

                //apply all job attributes into kue job instance
                // except for `progress`
                _.without(_.keys(jobDefinition), 'progress')
                    .forEach(function(attribute) {
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
        }.bind(this));
};



/**
 * @function
 * @description compute next run time of the given job data
 * @private
 */
Queue.prototype._computeNextRunTime = function(jobData, done) {
    //this refer to kue Queue instance context

    if (!jobData) {
        return done(new Error('Invalid job data'));
    }

    //grab job reccur interval
    var interval = jobData.reccurInterval;


    async.parallel({
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

                if (nextRun == 'Invalid Date'){
                  nextRun = null;
                }
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
 * @description respond to job key expiry events
 * @param  {String} jobExpiryKey valid job expiry key
 */
Queue.prototype._onJobKeyExpiry = function(jobExpiryKey) {
    //this refer to kue Queue instance context

    async.waterfall(
        [
            //get job data
            function getJobData(next) {
                //get job uuid
                var jobUUID = this._getJobUUID(jobExpiryKey);

                //get saved job data
                this._readJobData(this._getJobDataKey(jobUUID), next);
            }.bind(this),

            //compute next run time
            function computeNextRun(jobData, next) {
                this
                    ._computeNextRunTime(jobData, function(error, nextRunTime) {
                        if (error) {
                            next(error);
                        } else {
                            next(null, jobData, nextRunTime);
                        }
                    });
            }.bind(this),

            //resave the key to rerun this job again
            function resaveJobKey(jobData, nextRunTime, next) {

                //compute delay
                var now = new Date();
                var delay = nextRunTime.getTime() - now.getTime();

                this
                    ._scheduler
                    .set(jobExpiryKey, '', 'PX', delay, function(error) {
                        if (error) {
                            next(error);
                        } else {
                            next(null, jobData);
                        }
                    });
            }.bind(this),

            function buildJob(jobDefinition, next) {
                this._buildJob(jobDefinition, next);
            }.bind(this),

            function runJob(job, validations, next) {
                job.save(function(error, existJob) {
                    if (error) {
                        next(error);
                    } else {
                        //ensure unique job
                        if (existJob && existJob.alreadyExist) {
                            //inactivate to signal next run
                            existJob.inactive();
                        }

                        next(null, existJob || job);
                    }
                });
            }
        ],
        function(error, job) {
            if (error) {
                this.emit('schedule error', error);
            } else if (job.alreadyExist) {
                this.emit('already scheduled', job);
            } else {
                this.emit('schedule success', job);
            }
        }.bind(this));
};


/**
 * @function
 * @description subscribe to key expiry events
 * @private
 */
Queue.prototype._subscribe = function() {
    //this refer to kue Queue instance context

    //listen for job key expiry
    this
        ._listener
        .on('message', function(channel, jobExpiryKey) {

            //test if the event key is job expiry key
            //and emit `scheduler unknown job expiry key` if not
            if (!this._isJobExpiryKey(jobExpiryKey)) {
                this.emit('scheduler unknown job expiry key', jobExpiryKey);
                return;
            }

            this._onJobKeyExpiry(jobExpiryKey);

        }.bind(this));

    //subscribe to key expiration events
    this._listener.subscribe('__keyevent@0__:expired');

};


/**
 * @function
 * @description schedule a job to run every after a specified interval
 *
 *              If an error occur, it will be emitted using `schedule error` key
 *              with error passed as first parameter on event.
 *
 *              If job schedule successfully, it will be emitted using
 *              `schedule success` key with job instance passed as a first parameter
 *              on event.
 *
 * @param  {String} interval      scheduled interval in either human interval or
 *                                cron format
 * @param  {Job} job valid kue job instance which has not been saved
 * @example
 *     1. create non-unique job
 *     var job = Queue
 *            .createJob('every', data)
 *            .attempts(3)
 *            .priority('normal');
 *
 *      Queue.every('2 seconds', job);
 *
 *      2. create unique job
 *      var job = Queue
 *              .create('every', data)
 *              .attempts(3)
 *              .priority('normal')
 *              .unique(<unique_key>);
 *
 *      Queue.every('2 seconds', job);
 * @private
 */
Queue.prototype.every = function(interval, job) {
    //this refer to kue Queue instance context

    //back-off if no interval and job
    if (!interval || !job) {
        this.emit(
            'schedule error',
            new Error('Invalid number of parameters')
        );
    }

    //check for job instance
    else if (!(job instanceof Job)) {
        this.emit(
            'schedule error',
            new Error('Invalid job type')
        );
    }

    //continue with processing job
    else {

        //extend job definition with
        //scheduling data
        var jobDefinition = _.merge({}, job.toJSON(), {
            reccurInterval: interval,
            data: {
                schedule: 'RECCUR'
            },
            backoff: job._backoff
        });

        //generate job uuid
        var jobUUID = this._generateJobUUID(jobDefinition);

        //check if job already scheduled
        this._isJobAlreadyScheduled(this._getJobExpiryKey(jobUUID), function(error, isAlreadyScheduled) {
            if (error) {
                this.emit('schedule error', error);
            }

            if (!isAlreadyScheduled) {
                async.parallel({

                    jobExpiryKey: function(next) {
                        next(null, this._getJobExpiryKey(jobUUID));
                    }.bind(this),

                    jobDataKey: function(next) {
                        next(null, this._getJobDataKey(jobUUID));
                    }.bind(this),

                    nextRunTime: function(next) {
                        this._computeNextRunTime(jobDefinition, next);
                    }.bind(this)

                }, function finish(error, results) {
                    if (error) {
                        this.emit('schedule error', error);
                    } else {

                        var now = new Date();
                        var delay = results.nextRunTime.getTime() - now.getTime();

                        async
                        .waterfall([

                            function saveJobData(next) {
                                //extend job definition with expiry key
                                jobDefinition.data.expiryKey = results.jobExpiryKey;

                                //extend job definition with data key
                                jobDefinition.data.dataKey = results.jobDataKey;

                                //save job data
                                this._saveJobData(results.jobDataKey, jobDefinition, next);

                            }.bind(this),

                            function setJobKeyExpiry(jobData, next) {
                                //save key an wait for it to expiry
                                this._scheduler.set(results.jobExpiryKey, '', 'PX', delay, next);

                            }.bind(this)

                        ], function(error) {
                            if (error) {
                                this.emit('schedule error', error);
                            }
                        }.bind(this));
                    }

                }.bind(this));
            }
        }.bind(this));

    }

};


/**
 * @function
 * @description schedules a job to run once at a given time.
 *              `when` can be a `Date` or a valid `date.js string`
 *              such as `tomorrow at 5pm`.
 *
 *              If an error occur, it will be emitted using `schedule error` key
 *              with error passed as first parameter on event.
 *
 *              If job schedule successfully, it will be emitted using
 *              `schedule success` key with job instance passed as a first parameter
 *              on event.
 *
 * @param  {Date|String}   when      when should this job run
 * @param  {Job}   jobDefinition valid kue job instance which has not been saved
 * @example
 *     1. create non-unique job
 *     var job = Queue
 *            .createJob('schedule', data)
 *            .attempts(3)
 *            .priority('normal');
 *
 *      Queue.schedule('2 seconds from now', job);
 *
 *      2. create unique job
 *      var job = Queue
 *              .create('schedule', data)
 *              .attempts(3)
 *              .priority('normal')
 *              .unique(<unique_key>);
 *
 *      Queue.schedule('2 seconds from now', job);
 * @private
 */
Queue.prototype.schedule = function(when, job) {
    //this refer to kue Queue instance context

    //back-off if no interval and job
    if (!when || !job) {
        this.emit(
            'schedule error',
            new Error('Invalid number of parameters')
        );
    }

    //check for job instance
    else if (!(job instanceof Job)) {
        this.emit(
            'schedule error',
            new Error('Invalid job type')
        );
    }

    //continue with processing job
    else {

        var jobDefinition = _.extend(job.toJSON(), {
            backoff: job._backoff
        });

        async.waterfall(
            [
                function computeDelay(next) {
                    //when is date instance
                    if (when instanceof Date) {
                        next(null, when);
                    }

                    //otherwise parse as date.js string
                    else {
                        this._parse(when, next);
                    }
                }.bind(this),

                //set job delay
                function setDelay(scheduledDate, next) {
                    next(
                        null,
                        _.merge({}, jobDefinition, {
                            delay: scheduledDate,
                            data: {
                                schedule: 'ONCE'
                            }
                        })
                    );
                },

                function buildJob(delayedJobDefinition, next) {
                    this._buildJob(delayedJobDefinition, next);
                }.bind(this),

                function saveJob(job, validations, next) {
                    job.save(function(error, existJob) {
                        if (error) {
                            next(error);
                        } else {
                            //ensure unique job
                            if (existJob && existJob.alreadyExist) {
                                //inactivate to signal next run
                                existJob.inactive();
                            }

                            next(null, existJob || job);
                        }
                    });
                }
            ],
            function finish(error, job) {
                if (error) {
                    this.emit('schedule error', error);
                } else if (job.alreadyExist) {
                    this.emit('already scheduled', job);
                } else {
                    this.emit('schedule success', job);
                }
            }.bind(this));
    }
};


/**
 * @function
 * @description schedule a job to be executed immediatelly after being saved.
 *
 *              If an error occur, it will be emitted using `schedule error` key
 *              with error passed as first parameter on event.
 *
 *              If job schedule successfully, it will be emitted using
 *              `schedule success` key with job instance passed as a first parameter
 *              on event.
 *
 * @param  {Job}   job a valid kue job instance which has not been saved
 * @example
 *     1. create non-unique job
 *     var job = Queue
 *            .createJob('now', data)
 *            .attempts(3)
 *            .priority('normal');
 *
 *      Queue.now(job);
 *
 *      2. create unique job
 *      var job = Queue
 *              .create('now', data)
 *              .attempts(3)
 *              .priority('normal')
 *              .unique(<unique_key>);
 *
 *      Queue.now(job);
 * @private
 */
Queue.prototype.now = function(job) {
    //this refer to kue Queue instance context

    if (!job || !(job instanceof Job)) {
        this.emit('schedule error', new Error('Invalid job type'));
    } else {

        var jobDefinition = _.extend(job.toJSON(), {
            backoff: job._backoff
        });

        async.waterfall(
            [
                function buildJob(next) {
                    this._buildJob(jobDefinition, next);
                }.bind(this),

                function saveJob(job, validations, next) {
                    job.save(function(error, existJob) {
                        if (error) {
                            next(error);
                        } else {
                            //ensure unique job
                            if (existJob && existJob.alreadyExist) {
                                //inactivate to signal next run
                                existJob.inactive();
                            }

                            next(null, existJob || job);
                        }
                    });
                }
            ],
            function finish(error, job) {
                //TODO fire already scheduled events
                if (error) {
                    this.emit('schedule error', error);
                } else if (job.alreadyExist) {
                    this.emit('already scheduled', job);
                } else {
                    this.emit('schedule success', job);
                }
            }.bind(this));
    }
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
    this._listener.quit();
    this._scheduler.quit();
    if (this._cli) {
        this._cli.quit();
    }

    //then call previous Queue shutdown
    shutdown.apply(this, arguments);
};


//patch kue createQueue to allow options
//to be stored in the Queue instance
//and setup scheduler resources
var createQueue = kue.createQueue;
kue.createQueue = function(options) {

    //ensure only one instance of kue exists
    //per process
    if (Queue.singleton) {
        return Queue.singleton;
    }

    options = _.merge({}, {
        prefix: 'q',
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    }, options || {});

    //store passed options into Queue
    Queue.prototype.options = options;

    //instatiate kue
    var queue = createQueue.call(kue, options);

    //create job expiry key RegEx validator
    queue._jobExpiryKeyValidator =
        new RegExp('^' + queue.options.prefix + ':scheduler:');

    //a redis client for scheduling key expiry
    queue._scheduler = redis.createClient();

    //a redis client to listen for key expiry
    queue._listener = redis.createClient();

    // If this was done manually
    if (!options.skipConfig) {
        //redis client to allow configurations commands
        queue._cli = redis.createClient();

        //auto enable key expiry notifications
        queue.enableExpiryNotifications();
    }

    //listen for job key expiry
    //and schedule kue jobs to run
    queue._subscribe();

    //return patched queue
    return queue;
};


/**
 * @description remove existing job and its schedule
 * @param  {Number|Job|Object}   criteria a job id, job instance or criteria
 *                                        to be used
 * @param  {Function} [done]   a callback to invoke on success or error
 */
Queue.prototype.remove = Queue.prototype.removeJob = function(criteria, done) {
    //normalize callback
    done = done || function noop() {};

    //compute criteria and job instance
    async.parallel({

        fromJobInstance: function(next) {
            var isJobInstance = criteria && (criteria instanceof Job);

            if (isJobInstance) {
                var job = criteria;
                var _criteria = _.pick(job.data, ['expiryKey', 'dataKey']);
                return next(null, {
                    job: job,
                    criteria: _criteria
                });

            } else {
                return next(null, {
                    job: null,
                    criteria: null
                });
            }
        },

        fromJobId: function(next) {
            if (_.isNumber(criteria)) {

                Job.get(criteria, function(error, job) {
                    if (error) {
                        return next(null, null, null);
                    } else {
                        var _criteria = _.pick(job.data, ['expiryKey', 'dataKey']);
                        return next(null, {
                            job: job,
                            criteria: _criteria
                        });
                    }
                });

            } else {
                return next(null, {
                    job: null,
                    criteria: null
                });
            }
        },

        fromHashCriteria: function(next) {
            if (_.isPlainObject(criteria)) {
                var uuid;

                if (criteria.unique) {
                    uuid = this._generateJobUUID({data: criteria});

                    criteria.expiryKey = this._getJobExpiryKey(uuid);
                    criteria.dataKey = this._getJobDataKey(uuid);

                } else {

                    criteria.expiryKey = criteria.jobExpiryKey || criteria.expiryKey;
                    criteria.dataKey = criteria.jobDataKey || criteria.dataKey;

                }

                //normalize criteria
                if (criteria.expiryKey && !criteria.dataKey) {
                    uuid = this._getJobUUID(criteria.expiryKey);
                    criteria.dataKey = this._getJobDataKey(uuid);
                }

                if (!criteria.expiryKey && criteria.dataKey) {
                    uuid = this._getJobUUID(criteria.dataKey);
                    criteria.expiryKey = this._getJobExpiryKey(uuid);
                }

                criteria = _.pick(criteria, ['expiryKey', 'dataKey']);

                return next(null, {
                    job: null,
                    criteria: criteria
                });

            } else {
                return next(null, {
                    job: null,
                    criteria: null
                });
            }
        }.bind(this)

    }, function finish(error, results) {
        //obtain criteria
        var criteria =
            results.fromJobInstance.criteria ||
            results.fromJobId.criteria ||
            results.fromHashCriteria.criteria;

        //obtain job instance
        var job = results.fromJobInstance.job ||
            results.fromJobId.job ||
            results.fromHashCriteria.job;

        //remove job expiry key, data and its instance if exists
        async.parallel({

            removedExpiryKey: function(next) {
                if (criteria.expiryKey) {
                    this._scheduler.del(criteria.expiryKey, next);
                } else {
                    next(null, null);
                }
            }.bind(this),

            removedJobData: function(next) {
                if (criteria.dataKey) {
                    this._scheduler.del(criteria.dataKey, next);
                } else {
                    next(null, null);
                }
            }.bind(this),

            removedJobInstance: function(next) {
                if (job) {
                    return job.remove(next);
                } else {
                    return next(null, null);
                }
            }
        }, function finish(error, results) {
            done(error, results);
        }.bind(this));

    }.bind(this));
};


/**
 * @description export kue with scheduler attached
 * @type {Function}
 */
module.exports = kue;
