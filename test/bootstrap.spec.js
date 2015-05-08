'use strict';

//dependencies
var kue = require('kue');
var async = require('async');

//redis client for database cleanups
var redis = kue.redis.createClientFactory({
    redis: {}
});

/**
 * @description clean up a database
 */
function cleanup(callback) {
    redis
        .keys('q*', function(error, rows) {
            if (error) {
                callback(error);
            } else {
                async
                    .each(
                        rows,
                        function(row, next) {
                            redis.del(row, next);
                        },
                        callback);
            }
        });
}


before(function(done) {
    //clean any previous data
    //if any
    cleanup(done);
});


after(function(done) {
    //clean all data
    //introduced with these specs
    cleanup(done);
});