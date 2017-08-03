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
var uuid = require('uuid');
var humanInterval = require('human-interval');
var warlock = require('node-redis-warlock');
var CronTime = require('cron').CronTime;

//------------------------------------------------------------------------------
// constants
//------------------------------------------------------------------------------
var lockKey = 'locks';

//------------------------------------------------------------------------------
// utility helpers
//------------------------------------------------------------------------------

/**
 * @function
 * @description ensure only a single job instance
 *
 *              This is a case when working on reccur job(s) and only one instance
 *              of a job is supposed to exists and only current run history is
 *              of importance than previous running
 *
 * @param  {Job}   job  valid job instance
 * @param  {Function} done a callback to invoke on success or failure
 * @return {Job}        valid job instance
 * @private
 */
function ensureUniqueJob(job, done) {

  if (job && job.alreadyExist) {
    //check if job is complete or failed
    var isCompletedOrFailedJob =
      (job.state() === 'complete' ||
        job.state() === 'failed');
    var now = new Date();
    //assuming updated_at is in the past or now
    // updated_at is a built-in from kue.
    var timeSinceLastUpdate = now.getTime() - job.updated_at; // jshint ignore:line
    var arbitraryThreshold = job.data.ttl + (job.data.ttl/2);
    var isStaleJob =
    (job.state() === 'active' &&
        timeSinceLastUpdate > arbitraryThreshold
      );
    if (isCompletedOrFailedJob|| isStaleJob) {
      //resave job for next run
      //
      //NOTE!: We inactivate job to allow kue to queue the same job for next run.
      //This will ensure only a single job instance will be used for the next run.
      //This is the case for unique job behaviour.
      job.inactive();
      job.save(done);
    } else {
      done(null, job);
    }
  } else {
    done(null, job);
  }
}


/**
 * @function
 * @name scheduleEveryJob
 * @param  {Object}   jobDefinition valid job definition
 * @param  {String}   jobUUID       valid job uuid
 * @param  {Function} done          a callback to invoke on success or failure
 * @private
 */
function scheduleEveryJob(jobDefinition, jobUUID, done) {
  /*jshint validthis:true*/
  async.waterfall([

    function obtainLock(next) {
      //TODO expose lock duration as configurations
      this._warlock.lock(this._getJobLockKey(jobUUID), 1000, function (err, unlock) {
        if (!unlock) {
          next(new Error('Job already locked, skipping...'));
        } else {
          next(err, unlock);
        }
      });

    }.bind(this),

    function prepareNextRun(unlock, next) {

      async.parallel({
        //compute job expiry key
        jobExpiryKey: function (then) {
          then(null, this._getJobExpiryKey(jobUUID));
        }.bind(this),

        //compute job data key
        jobDataKey: function (then) {
          then(null, this._getJobDataKey(jobUUID));
        }.bind(this),

        //compute next run time of the job
        nextRunTime: function (then) {
          this._computeNextRunTime(jobDefinition, then);
        }.bind(this)

      }, function (error, results) {
        next(error, unlock, results);
      });

    }.bind(this),

    function saveJobData(unlock, results, next) {
      //compute job shedule key expiry time
      var now = new Date();
      var delay = results.nextRunTime.getTime() - now.getTime();

      //ensure job data
      jobDefinition.data = jobDefinition.data || {};

      //extend job definition with expiry key
      jobDefinition.data.expiryKey = results.jobExpiryKey;

      //extend job definition with data key
      jobDefinition.data.dataKey = results.jobDataKey;

      //save job data
      this._saveJobData(results.jobDataKey, jobDefinition, function (error) {
        next(error, unlock, delay, results.jobExpiryKey, jobDefinition);
      });

    }.bind(this),

    //schedule job for next run
    function setJobKeyExpiry(unlock, delay, jobExpiryKey, jobDefinition, next) {
      //save key if not exists and wait for it to expiry
      this._scheduler.set(jobExpiryKey, jobExpiryKey, 'PX', delay, 'NX',
        function (error) {
          next(error, unlock, jobDefinition);
        });

    }.bind(this),

    function releaseLock(unlock, jobDefinition, next) {
      unlock(function (error) {
        next(error, jobDefinition);
      });
    }

  ], function (error, results) {
    done(error, results);
  });
  /*jshint validthis:false*/
}


//------------------------------------------------------------------------------
//patch and implementations
//------------------------------------------------------------------------------

/**
 * @function
 * @description generate an expiration key that is used to track job scheduling
 * @return {String} a job expiry key
 * @private
 */
Queue.prototype._getJobExpiryKey = function (uuid) {
  //this refer to kue Queue instance context

  var key = this.options.prefix + ':scheduler:' + uuid;

  return key;
};


/**
 * @function
 * @description test a give key if is valid job expiry key
 * @param  {String}  jobExpiryKey a key to test
 * @return {Boolean} true if is valid job expiry key else false
 * @private
 */
Queue.prototype._isJobExpiryKey = function (jobExpiryKey) {
  //this refer to kue Queue instance context

  var isJobExpiryKey = this._jobExpiryKeyValidator.test(jobExpiryKey);

  return isJobExpiryKey;
};


/**
 * @function
 * @description check if job exists and its ttl has not timeout
 * @param  {String}   jobExpiryKey valid job expiry key
 * @param  {Function} done         a function to invoke on success or error
 * @return {Boolean}               whether job already scheduled or not
 * @private
 */
Queue.prototype._isJobAlreadyScheduled = function (jobExpiryKey, done) {
  //this refer to kue Queue instance context

  async.parallel({

    exists: function isKeyExists(next) {
      this._scheduler.exists(jobExpiryKey, next);
    }.bind(this),

    ttl: function isKeyExpired(next) {
      this._scheduler.pttl(jobExpiryKey, next);
    }.bind(this)

  }, function (error, results) {
    if (error) {
      done(error);
    } else {
      var exists =
        (results.exists && results.exists === 1) ? true : false;

      var active =
        (results.ttl && results.ttl > 0) ? true : false;

      var alreadyScheduled = exists && active;

      done(null, alreadyScheduled);

    }
  });
};


/**
 * @function
 * @description generate job uuid from job definition
 * @param  {Object} jobDefinition valid job definition
 * @return {String}               job uuid
 * @private
 */
Queue.prototype._generateJobUUID = function (jobDefinition) {
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
Queue.prototype._getJobUUID = function (key) {
  //this refer to kue Queue instance context
  var uuid;

  var splits = key.split(':');

  splits = _.filter(splits, function(o) { return o !== ''; });
  if(splits.length > 0){
    uuid = splits[splits.length - 1];
  }

  return uuid;

};


/**
 * @function
 * @description generate a storage key for the scheduled job data
 * @return {String} a key to retrieve a scheduled job data
 * @private
 */
Queue.prototype._getJobDataKey = function (uuid) {
  //this refer to kue Queue instance context
  var key = this.options.prefix + ':scheduler:data:' + uuid;

  return key;
};


/**
 * @function
 * @description generate a lock for the scheduling of a job
 * @return {String} a key to lock on based on the UUID
 * @private
 */
Queue.prototype._getJobLockKey = function (uuid) {
  //this refer to kue Queue instance context
  var key = this.options.prefix + ':scheduler:' + lockKey + ':' + uuid;

  return key;
};


/**
 * @function
 * @description save scheduled job data into redis backend
 * @param {String} jobDataKey valid job data key
 * @param {Object} jobData valid job data
 * @param {Function} done a callback to invoke on success or failure
 * @private
 */
Queue.prototype._saveJobData = function (jobDataKey, jobData, done) {
  //this refer to kue Queue instance context

  //TODO make use of redis hash i.e redis.hmset(<key>, <data>);
  this
    ._scheduler
    .set(jobDataKey, JSON.stringify(jobData), function (error /*, response*/ ) {
      done(error, jobData);
    });
};


/**
 * @function
 * @description retrieved saved scheduled job data from redis backend
 * @param {String} jobDataKey valid job data key
 * @param {Function} done a callback to invoke on success or failure
 * @return {Object} job data if found else error
 * @private
 */
Queue.prototype._readJobData = function (jobDataKey, done) {
  //this refer to kue Queue instance context

  //TODO make use of redis hash i.e redis.hgetall(<key>);
  this
    ._scheduler
    .get(jobDataKey, function (error, data) {
      done(error, JSON.parse(data));
    });
};


/**
 * @function
 * @description Enable redis expiry keys notifications
 * @public
 */
Queue.prototype.enableExpiryNotifications = function () {
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
Queue.prototype._parse = function (str, done) {
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
Queue.prototype._buildJob = function (jobDefinition, done) {
  //this refer to kue Queue instance context

  async.parallel({
      isDefined: function (next) {
        //is job definition provided
        var isObject = _.isPlainObject(jobDefinition);
        if (!isObject) {
          next(new Error('Invalid job definition'));
        } else {
          next(null, true);
        }
      },
      isValid: function (next) {
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
        // except for `progress` and `error`
        _.without(_.keys(jobDefinition), 'progress', 'error')
          .forEach(function (attribute) {
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
 * @param {Object} jobData valid job data
 * @param {Function} done a callback to invoke on success or failure
 * @private
 */
Queue.prototype._computeNextRunTime = function (jobData, done) {
  //this refer to kue Queue instance context

  if (!jobData) {
    return done(new Error('Invalid job data'));
  }

  //grab job reccur interval
  var interval = jobData.reccurInterval;
  var timezone = jobData.data ? jobData.data.timezone : undefined;

  async.parallel({
    //compute next run from cron interval
    cron: function (after) {
      try {
        //last run of the job is now if not exist
        var lastRun =
          jobData.lastRun ? new Date(jobData.lastRun) : new Date();

        //compute next date from the cron interval
        var cronTime = new CronTime(interval, timezone);
        var nextRun = cronTime._getNextDateFrom(lastRun);

        // Handle cronTime giving back the same date
        // for the next run time
        if (nextRun.valueOf() === lastRun.valueOf()) {
          nextRun =
            cronTime._getNextDateFrom(new Date(lastRun.valueOf() + 1000));
        }

        //return computed time
        after(null, nextRun.toDate());

      } catch (ex) {
        //to allow parallel run with other interval parser
        after(null, null);
      }
    },

    //compute next run from human interval
    human: function (after) {
      try {
        //last run of the job is now if not exist
        var lastRun =
          jobData.lastRun ? new Date(jobData.lastRun) : new Date();

        var nextRun =
          new Date(lastRun.valueOf() + humanInterval(interval));

        //return computed time

        if (isNaN(nextRun.getTime())) {
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
 * @function
 * @description respond to job key expiry events
 * @param  {String} jobExpiryKey valid job expiry key
 * @private
 */
Queue.prototype._onJobKeyExpiry = function (jobExpiryKey) {
  //this refer to kue Queue instance context

  //TODO refactor

  //generate lock key for specific job
  var jobLockKey = this._getJobLockKey(this._getJobUUID(jobExpiryKey));


  //obtain lock to ensure only one worker process expiry event
  //TODO add specs to test for lock lifetime
  this._warlock.lock(jobLockKey, 1000, function (err, unlock) {
    //handle lock error
    if (err) {
      //notity error to queue instance
      this.emit('lock error', err);
    }

    //continue to process event
    else if (unlock) {

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
              ._computeNextRunTime(jobData, function (error,
                nextRunTime) {
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
              .set(jobExpiryKey, '', 'PX', delay, function (error) {
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
            job.save(function (error, existJob) {
              next(error, existJob || job);
            });
          },

          function ensureSingleUniqueJob(job, next) {
            ensureUniqueJob(job, next);
          }
        ],
        function (error, job) {
          if (unlock) {
            unlock(function (err) {
              if (err) {
                // couldn't talk to redis to unlock the lock,
                // which will release at the 1s ttl.
                //
                //notity error to queue instance
                this.emit('unlock error', error);
              }
            });
          }
          if (error) {
            this.emit('schedule error', error);
          } else if (job.alreadyExist) {
            this.emit('already scheduled', job);
          } else {
            this.emit('schedule success', job);
          }
        }.bind(this));
    }

  }.bind(this)); // end warlock
};


/**
 * @function
 * @description subscribe to key expiry events
 * @private
 */
Queue.prototype._subscribe = function () {
  //this refer to kue Queue instance context

  //listen for job key expiry
  this
    ._listener
    .on('message', function (channel, jobExpiryKey) {
      //test if the event key is job expiry key
      //and emit `scheduler unknown job expiry key` if not
      if (!this._isJobExpiryKey(jobExpiryKey)) {
        this.emit('scheduler unknown job expiry key', jobExpiryKey);
        return;
      }

      this._onJobKeyExpiry(jobExpiryKey);

    }.bind(this));

  //subscribe to key expiration events
  this._listener.subscribe(this._getExpiredSubscribeKey());

};


/**
 * @function
 * @description get a key to subscribe on for expired events
 * @return {String} key for expired events
 * @private
 */
Queue.prototype._getExpiredSubscribeKey = function () {
  // default redis db
  var redisDb = 0;
  if (Queue.prototype.options.redis.db) {
    //works for node-redis
    redisDb = Queue.prototype.options.redis.db;
  } else if (this._listener.options.db) {
    //works for ioredis
    redisDb = this._listener.options.db;
  }

  // key to subscribe on
  return '__keyevent@' + redisDb + '__:expired';
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
 * @param {Function} [done] a callback to invoke on success or failure
 * @example
 *     1. create non-unique job
 *     var job = Queue
 *            .createJob('every', data)
 *            .attempts(3)
 *            .priority('normal');
 *
 *      Queue.every('2 seconds', job, done);
 *
 *      2. create unique job
 *      var job = Queue
 *              .create('every', data)
 *              .attempts(3)
 *              .priority('normal')
 *              .unique(<unique_key>);
 *
 *      Queue.every('2 seconds', job, done);
 * @public
 */
Queue.prototype.every = function (interval, job, done) {
  //this refer to kue Queue instance context

  async.waterfall([

    function ensureInterval(next) {
      if (!interval && _.isEmpty(interval) && !_.isString(interval)) {
        next(new Error('Missing Schedule Interval'));
      } else {
        next(null, interval, job);
      }
    },

    function ensureJobInstance(interval, job, next) {
      if (!job && !(job instanceof Job)) {
        next(new Error('Invalid Job Instance'));
      } else {
        next(null, interval, job);
      }
    },

    function prepareJobDefinition(interval, job, next) {
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

      //continue
      next(null, jobDefinition, jobUUID);

    }.bind(this),

    function checkIfJobAlreadyScheduled(jobDefinition, jobUUID, next) {
      this._isJobAlreadyScheduled(
        this._getJobExpiryKey(jobUUID),
        function (error, isAlreadyScheduled) {
          next(error, jobDefinition, jobUUID, isAlreadyScheduled);
        });
    }.bind(this),

    function scheduleJob(jobDefinition, jobUUID, isAlreadyScheduled, next) {
      if (!isAlreadyScheduled) {
        scheduleEveryJob.call(this, jobDefinition, jobUUID, function (
          error) {
          next(error, job);
        });
      } else {
        next(null, job);
      }
    }.bind(this)

  ], function (error, job) {
    //fire schedule error event
    if (error) {
      this.emit('schedule error', error);
    }

    //fire already schedule event
    else if (job.alreadyExist) {
      this.emit('already scheduled', job);
    }

    //fire schedule success event
    else {
      this.emit('schedule success', job);
    }

    //invoke callback if provided
    if (done && _.isFunction(done)) {
      done(error, job);
    }

  }.bind(this));

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
 * @param {Fuction} [done] a callback to invoke on success or error
 * @example
 *     1. create non-unique job
 *     var job = Queue
 *            .createJob('schedule', data)
 *            .attempts(3)
 *            .priority('normal');
 *
 *      Queue.schedule('2 seconds from now', job, done);
 *
 *      2. create unique job
 *      var job = Queue
 *              .create('schedule', data)
 *              .attempts(3)
 *              .priority('normal')
 *              .unique(<unique_key>);
 *
 *      Queue.schedule('2 seconds from now', job, done);
 * @public
 */
Queue.prototype.schedule = function (when, job, done) {
  //this refer to kue Queue instance context

  async.waterfall([
    function ensureInterval(next) {
      if (!when && !(_.isString(when) || _.isDate(when))) {
        next(new Error('Missing Schedule Interval'));
      } else {
        next(null, when, job);
      }
    },

    function ensureJobInstance(when, job, next) {
      if (!job && !(job instanceof Job)) {
        next(new Error('Invalid Job Instance'));
      } else {
        next(null, when, job);
      }
    },

    function prepareJobDefinition(when, job, next) {
      var jobDefinition = _.extend(job.toJSON(), {
        backoff: job._backoff
      });

      next(null, when, job, jobDefinition);
    },

    function computeDelay(when, job, jobDefinition, next) {
      //when is date instance
      if (when instanceof Date) {
        next(null, jobDefinition, when);
      }

      //otherwise parse as date.js string
      else {
        this._parse(when, function (error, scheduledDate) {
          next(error, jobDefinition, scheduledDate);
        });
      }
    }.bind(this),

    //set job delay
    function setDelay(jobDefinition, scheduledDate, next) {
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
      job.save(function (error, existJob) {
        next(error, existJob || job);
      });
    },

    function ensureSingleUniqueJob(job, next) {
      ensureUniqueJob(job, next);
    }

  ], function (error, job) {
    //fire schedule error event
    if (error) {
      this.emit('schedule error', error);
    }

    //fire already schedule event
    else if (job.alreadyExist) {
      this.emit('already scheduled', job);
    }

    //fire schedule success event
    else {
      this.emit('schedule success', job);
    }

    //invoke callback if provided
    if (done && _.isFunction(done)) {
      done(error, job);
    }

  }.bind(this));

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
 * @param  {Function}  [done] a callback to invoke on success or failure
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
 * @public
 */
Queue.prototype.now = function (job, done) {
  //this refer to kue Queue instance context

  async.waterfall([

    function ensureJobInstance(next) {
      if (!job || !(job instanceof Job)) {
        next(new Error('Invalid job type'));
      } else {
        next(null, job);
      }
    },

    function buildJob(job, next) {
      //obtain job definition
      //TODO use job instance directly than recreating it
      var jobDefinition = _.extend(job.toJSON(), {
        backoff: job._backoff
      });

      this._buildJob(jobDefinition, next);
    }.bind(this),

    function saveJob(job, validations, next) {
      job.save(function (error, existJob) {
        next(error, existJob || job);
      });
    },

    function ensureSingleUniqueJob(job, next) {
      ensureUniqueJob(job, next);
    }

  ], function (error, job) {
    //fire schedule error event
    if (error) {
      this.emit('schedule error', error);
    }

    //fire already schedule event
    else if (job.alreadyExist) {
      this.emit('already scheduled', job);
    }

    //fire schedule success event
    else {
      this.emit('schedule success', job);
    }

    //invoke callback if provided
    if (done && _.isFunction(done)) {
      done(error, job);
    }

  }.bind(this));

};


//patch Queue shutdown to allow
//for scheduler resource cleanups
//
var shutdown = Queue.prototype.shutdown;
//
//
/**
 * @function
 * @description graceful shutdown
 * @param {Function} fn callback
 * @return {Queue} for chaining
 * @api public
 */
Queue.prototype.shutdown = function ( /*fn, timeout, type*/ ) {
  //this refer to kue Queue instance context

  //TODO ensure all client shutdown with waiting delay
  //TODO remove all listeners

  //stop processing new expiry messages
  if (this._listener) {
    this._listener.removeAllListeners('message');

    //unsubscribe to key expiry events
    this._listener.unsubscribe(this._getExpiredSubscribeKey());
    this._listener.quit();
  }

  //close _scheduler, and _cli redis connctions
  this._scheduler.quit();
  if (this._cli) {
    this._cli.quit();
  }

  //then call previous Queue shutdown
  return shutdown.apply(this, arguments);
};


//patch kue createQueue to allow options
//to be stored in the Queue instance
//and setup scheduler resources
var createQueue = kue.createQueue;
kue.createQueue = function (options) {

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
    },
    restore: false,
    worker: true,
  }, options || {});

  //store passed options into Queue
  Queue.prototype.options = options;

  //instatiate kue
  var queue = createQueue.call(kue, options);

  //TODO ensure only one queue instance exists
  //TODO ensure one time listener and setup

  //create job expiry key RegEx validator
  queue._jobExpiryKeyValidator =
    new RegExp('^' + queue.options.prefix + ':scheduler:(?!' + lockKey + ')');

  //a redis client for scheduling key expiry
  queue._scheduler = redis.createClient();

  queue._warlock = warlock(queue._scheduler);

  // If this was done manually
  if (!options.skipConfig) {
    //redis client to allow configurations commands
    queue._cli = redis.createClient();

    //auto enable key expiry notifications
    queue.enableExpiryNotifications();
  }

  //allow job expiry notification processing
  //and make this queue instance operate as a worker too
  if (options.worker) {
    //a redis client to listen for key expiry
    queue._listener = redis.createClient();

    //listen for job key expiry
    //and schedule kue jobs to run
    queue._subscribe();
  }

  //restore job schedules
  if (options.restore) {
    queue.restore(function (error) {

      //fire restore error event
      if (error) {
        this.emit('restore error', error);
      }

      //fire restore error success
      else {
        this.emit('restore success');
      }

    });
  }

  //return patched queue
  return queue;
};


/**
 * @function
 * @description remove existing job and its schedule
 * @param  {Number|Job|Object}   criteria a job id, job instance or criteria
 *                                        to be used
 * @param  {Function} [done]   a callback to invoke on success or error
 * @public
 */
Queue.prototype.remove = Queue.prototype.removeJob = function (criteria, done) {
  //normalize callback
  done = done || function noop() {};

  //compute criteria and job instance
  async.parallel({

    fromJobInstance: function (next) {
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

    fromJobId: function (next) {
      if (_.isNumber(criteria)) {

        Job.get(criteria, function (error, job) {
          if (error) {
            return next(null, null, null);
          } else {
            var _criteria = _.pick(job.data, ['expiryKey',
              'dataKey'
            ]);
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

    fromHashCriteria: function (next) {
      if (_.isPlainObject(criteria)) {
        var uuid;

        if (criteria.unique) {
          uuid = this._generateJobUUID({ data: criteria });

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

      removedExpiryKey: function (next) {
        if (criteria.expiryKey) {
          this._scheduler.del(criteria.expiryKey, next);
        } else {
          next(null, null);
        }
      }.bind(this),

      removedJobData: function (next) {
        if (criteria.dataKey) {
          this._scheduler.del(criteria.dataKey, next);
        } else {
          next(null, null);
        }
      }.bind(this),

      removedJobInstance: function (next) {
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
 * @function
 * @description cleanup and reset current kue and kue-scheduler states
 * @param  {Function} done a callback to invoke on success or failure
 * @public
 */
Queue.prototype.clear =
  Queue.prototype.cleanup =
  Queue.prototype.clean = function (done) {
    //this refer to kue Queue instance context

    //obtain redis client
    //@see https://github.com/Automattic/kue/blob/master/lib/kue.js#L98
    this.client = this.client || redis.createClient();

    //obtain cleanup key pattern
    var keyPattern = [this.options.prefix, '*'].join('');

    //obtain all kue & kue-scheduler keys
    this.client.keys(keyPattern, function (error, keys) {
      //back-off in case of error
      if (error) {
        done(error);
      }

      //continue with cleanup
      else {
        //obtain multi to ensure atomicity on cleanup
        var client = this.client.multi();

        //queue delete commands
        _.forEach(keys, function (key) {
          client.del(key);
        });

        //execute delete command
        client.exec(done);
      }
    }.bind(this));

  };


/**
 * @function
 * @description obtain all previous schedule job data
 * @param  {Function} done a callback to invoke on sucess or failure
 * @return {[Object]}      collection of all job data
 * @since  0.7.0
 */
Queue.prototype._getAllJobData = function (done) {
  //key pattern to obtain all job data keys
  var keyPattern = [this.options.prefix, ':scheduler:data*'].join('');

  //obtain redis client
  //@see https://github.com/Automattic/kue/blob/master/lib/kue.js#L98
  this.client = this.client || redis.createClient();

  //fetch all job data using multi
  this.client.keys(keyPattern, function (error, keys) {
    //back-off in case of error
    if (error) {
      done(error);
    }

    //return empty data if no keys found
    else if (!keys || _.isEmpty(keys)) {
      done(null, []);
    }

    //continue with fetching job data
    else {
      //obtain multi to ensure atomicity on cleanup
      var client = this.client.multi();

      //queue get commands
      _.forEach(keys, function (key) {
        client.get(key);
      });

      //execute get commands
      client.exec(function (error, data) {
        //parse data to json
        if (data) {
          try {
            data = _.map(data, JSON.parse);
          } catch (e) {
            data = [];
          }
        }
        done(error, data);
      });

    }

  }.bind(this));

};


/**
 * @function
 * @description restore scheduled works
 * @since 0.7.0
 */
Queue.prototype.restore = function (done) {
  //ensure callback
  done = _.isFunction(done) ? done : function () {};

  //fetch all job data
  this._getAllJobData(function (error, data) {
    //backoff if error throw
    if (error) {
      done(error);
    }

    //restore job schedules
    else {
      //prepare schedules
      var schedules = _.map(data, function (schedule) {

        return function (next) {
          scheduleEveryJob.call(this, schedule, this._generateJobUUID(schedule), next);
        }.bind(this);

      }.bind(this));

      schedules = _.compact(schedules);

      //re-schedule in parallel
      async.parallel(schedules, done.bind(this));

    }

  }.bind(this));

};


/**
 * @description export kue with scheduler attached
 * @type {Function}
 */
module.exports = kue;
