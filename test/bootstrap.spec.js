'use strict';

//dependencies
var kue = require('kue');
var Job = kue.Job;
var async = require('async');
var _ = require('lodash');

//setup test environment
before(function(done) {
    //initializing kue for cleaning existing jobs
    kue.createQueue();

    //clean existing jobs
    async
        .waterfall(
            [
                function findJobs(next) {
                    //TODO find a proper from..to for cleaning
                    //existing jobs
                    Job.range(0, 1000000000, 'desc', next);
                },
                function prepareCleaningWork(jobs, next) {
                    next(null, _.map(jobs, function(job) {
                        return job.remove.bind(job);
                    }));
                },

                function cleanJobs(cleaningWork, next) {
                    async.parallel(cleaningWork, next);
                }
            ],
            function(error, results) {
                done(error, results);
            });
});