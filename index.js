'use strict';

//dependencies
// var kue = require('kue');
// var redis = kue.redis;

/**
 * @description A job scheduling utility for kue
 * @param {Object} options configuration options, similar to kue configuration
 *                         options
 */
function KueScheduler() {
    //counter check configurations
    //and reference them for later use
    this.options = arguments[0] || {};

    // //kue queue for scheduler
    // this.queue = kue.createQueue(this.options);

    // //a redis client for scheduling key expiry
    // this.scheduler = redis.createClientFactory(this.options);

    // //a redis client to listen for key expiry 
    // this.listener = redis.createClientFactory(this.options);
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
 * @description export kue scheduler
 * @type {Function}
 */
module.exports = KueScheduler;