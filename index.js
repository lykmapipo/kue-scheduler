'use strict';

//dependencies
var kue = require('kue');
var redis = kue.redis;
var _ = require('lodash');

/**
 * @description A job scheduling utility for kue
 * @param {Object} options configuration options, similar to kue configuration
 *                         options
 */
function KueScheduler(options) {
    //extend default configurations
    //with custom provided configurations
    //and reference them for later use
    this.options = _.extend({
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    }, options || {});

    //kue queue for scheduler
    this.queue = kue.createQueue(this.options);

    //a redis client for scheduling key expiry
    this.scheduler = redis.createClientFactory(this.options);

    //a redis client to listen for key expiry 
    this.listener = redis.createClientFactory(this.options);

}

KueScheduler.prototype.every = function( /*interval, jobDefinition*/ ) {
    // body...
};


KueScheduler.prototype.schedule = function( /*schedule, jobDefinition*/ ) {
    // body...
};

KueScheduler.prototype.at = function( /*time, jobDefinition*/ ) {
    // body...
};

KueScheduler.prototype.now = function( /*jobDefinition*/ ) {
    // body...
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