'use strict';

/**
 * @description A job scheduling utility for kue
 * @param {Object} options configuration options 
 */
function KueScheduler(/*options*/) {}

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
exports = module.exports = KueScheduler;