import * as Kue from 'kue-unique'; // eslint-disable-line import/no-extraneous-dependencies

declare class Scheduler extends Kue.Queue {
  static createQueue(options: {
    prefix?: string;
    redis?: {
      port: number;
      host: string;
      [key: string]: any; // see https://github.com/NodeRedis/node_redis#rediscreateclient
    };
    restore?: boolean;
    worker?: boolean;
    skipConfig?: boolean;
  }): Scheduler;

  /**
   * @function
   * @description generate an expiration key that is used to track job scheduling
   * @return {String} a job expiry key
   * @private
   */
  _getJobExpiryKey(uuid: string): string;
  /**
   * @function
   * @description check if job exists and its ttl has not timeout
   * @param  {String}   jobExpiryKey valid job expiry key
   * @param  {Function} done         a function to invoke on success or error
   * @return {Boolean}               whether job already scheduled or not
   * @private
   */
  _isJobExpiryKey(uuid: string): boolean;

  /**
   * @function
   * @description check if job exists and its ttl has not timeout
   * @param  {String}   jobExpiryKey valid job expiry key
   * @param  {Function} done         a function to invoke on success or error
   * @return {Boolean}               whether job already scheduled or not
   * @private
   */
  _isJobAlreadyScheduled(jobExpiryKey: string, done?: Function): boolean;

  /**
   * @function
   * @description generate job uuid from job definition
   * @param  {Object} jobDefinition valid job definition
   * @return {String}               job uuid
   * @private
   */
  _generateJobUUID(jobDefinition: object): string;

  /**
   * @function
   * @description generate job uuid from job expiry key or job data key
   * @return {String} a scheduled job uuid
   * @private
   */
  _getJobUUID(key: string): string;

  /**
   * @function
   * @description generate a storage key for the scheduled job data
   * @return {String} a key to retrieve a scheduled job data
   * @private
   */
  _getJobDataKey(uuid: string): string;
  /**
   * @function
   * @description generate a lock for the scheduling of a job
   * @return {String} a key to lock on based on the UUID
   * @private
   */
  _getJobLockKey(uuid: string): string;

  /**
   * @function
   * @description save scheduled job data into redis backend
   * @param {String} jobDataKey valid job data key
   * @param {Object} jobData valid job data
   * @param {Function} done a callback to invoke on success or failure
   * @private
   */
  _saveJobData(jobDataKey: string, jobData: object, done?: Function);
  /**
   * @function
   * @description retrieved saved scheduled job data from redis backend
   * @param {String} jobDataKey valid job data key
   * @param {Function} done a callback to invoke on success or failure
   * @return {Object} job data if found else error
   * @private
   */
  _readJobData(jobDataKey: string, done?: Function): object;

  /**
   * @function
   * @description Enable redis expiry keys notifications
   * @public
   */
  enableExpiryNotifications();

  /**
   * @function
   * @description parse date.js valid string and return a date object
   * @param  {String}   str  a valid date.js date string
   * @param  {Function} done a callback to invoke on error or success
   * @private
   */
  _parse(str: string, done?: Function);

  /**
   * @function
   * @description instantiate a kue job from a job definition hash
   * @param  {Object} jobDefinition valid kue job attributes
   * @param {Function} done a callback to invoke on error or success
   * @private
   */
  _buildJob(jobDefinition: object, done?: Function);

  /**
   * @function
   * @description compute next run time of the given job data
   * @param {Object} jobData valid job data
   * @param {Function} done a callback to invoke on success or failure
   * @private
   */
  _computeNextRunTime(jobData: object, done?: Function);

  /**
   * @function
   * @description respond to job key expiry events
   * @param  {String} jobExpiryKey valid job expiry key
   * @private
   */
  onJobKeyExpiry(jobExpiryKey: string);

  /**
   * @function
   * @description subscribe to key expiry events
   * @private
   */
  _subscribe();

  /**
   * @function
   * @description get a key to subscribe on for expired events
   * @return {String} key for expired events
   * @private
   */
  _getExpiredSubscribeKey(): string;

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
   *      Queue.every('2 seconds', job, done?);
   *
   *      2. create unique job
   *      var job = Queue
   *              .create('every', data)
   *              .attempts(3)
   *              .priority('normal')
   *              .unique(<unique_key>);
   *
   *      Queue.every('2 seconds', job, done?);
   * @public
   */
  every(interval: string, job: Kue.Job, done?: Function);

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
   *      Queue.schedule('2 seconds from now', job, done?);
   *
   *      2. create unique job
   *      var job = Queue
   *              .create('schedule', data)
   *              .attempts(3)
   *              .priority('normal')
   *              .unique(<unique_key>);
   *
   *      Queue.schedule('2 seconds from now', job, done?);
   * @public
   */
  schedule(when: Date | string, job: Kue.Job, done?: Function);

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
  now(job: Kue.Job, done?: Function);

  /**
   * @function
   * @description graceful shutdown
   * @return {this} for chaining
   * @api public
   */
  shutdown(): this;

  /**
   * @function
   * @description remove existing job and its schedule
   * @param  {Number|Job|Object}   criteria a job id, job instance or criteria
   *                                        to be used
   * @param  {Function} [done]   a callback to invoke on success or error
   * @public
   */
  removeJob(criteria: number | Kue.Job | object, done?: Function);

  /**
   * @function
   * @description cleanup and reset current kue and kue-scheduler states
   * @param  {Function} done a callback to invoke on success or failure
   * @public
   */
  clear(done?: Function);

  /**
   * @function
   * @description obtain all previous schedule job data
   * @param  {Function} done a callback to invoke on sucess or failure
   * @return {[Object]}      collection of all job data
   * @since  0.7.0
   */
  _getAllJobData(done?: Function);

  /**
   * @function
   * @description restore scheduled works
   * @since 0.7.0
   */
  restore(done?: Function);

  create(type: string, data: Object): Kue.Job;
  createJob(type: string, data: Object): Kue.Job;
  promote(ms?: number): void;
  setupTimer(): void;
  checkJobPromotion(ms: number): void;
  checkActiveJobTtl(ttlOptions: Object): void;
  watchStuckJobs(ms: number): void;
  setting(name: string, fn: Function): Scheduler;
  process(type: string, n?: number | Kue.ProcessCallback, fn?: Kue.ProcessCallback): void;
  shutdown(timeout: number, fn: Function): Scheduler;
  shutdown(timeout: number, type: string, fn: Function): Scheduler;
  types(fn: Function): Scheduler;
  state(string: string, fn: Function): Scheduler;
  workTime(fn: Function): Scheduler;
  cardByType(type: string, state: string, fn: Function): Scheduler;
  card(state: string, fn: Function): Scheduler;
  complete(fn: Function): Scheduler;
  failed(fn: Function): Scheduler;
  inactive(fn: Function): Scheduler;
  active(fn: Function): Scheduler;
  delayed(fn: Function): Scheduler;
  completeCount(type: string, fn: Function): Scheduler;
  failedCount(type: string, fn: Function): Scheduler;
  inactiveCount(type: string, fn: Function): Scheduler;
  activeCount(type: string, fn: Function): Scheduler;
  delayedCount(type: string, fn: Function): Scheduler;
}
export = Scheduler;
