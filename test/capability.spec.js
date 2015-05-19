'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var uuid = require('node-uuid');
var kue = require(path.join(__dirname, '..', 'index'));
var Queue;
var options = {
    prefix: 'q'
};

describe('Queue Scheduling Capabilities', function() {

    before(function(done) {
        Queue = kue.createQueue();
        done();
    });

    after(function(done) {
        Queue.shutdown(done);
    });


    it('should be able to shedule job in later time', function(done) {
        expect(Queue).to.respondTo('schedule');
        done();
    });

    it('should be able to execute jobs every after specific time interval', function(done) {
        expect(Queue).to.respondTo('every');
        done();
    });

    it('should be able to execute a job now', function(done) {
        expect(Queue).to.respondTo('now');
        done();
    });

    it('should be able to generate job expriration key', function(done) {
        var jobuuid = uuid.v1();

        expect(Queue._getJobExpiryKey(jobuuid))
            .to.be.equal(options.prefix + ':scheduler:' + jobuuid);

        done();
    });

    it('should be able to generate job data storage key', function(done) {
        var jobuuid = uuid.v1();

        expect(Queue._getJobDataKey(jobuuid))
            .to.be.equal(options.prefix + ':scheduler:data:' + jobuuid);

        done();
    });

    it('should be able to generate job uuid from job expriration key', function(done) {
        var jobuuid = uuid.v1();
        var jobEpiryKey = Queue._getJobExpiryKey(jobuuid);

        expect(Queue._getJobUUID(jobEpiryKey))
            .to.be.equal(jobuuid);

        done();
    });

    describe('Queue CRUD Capabilities', function() {
        var jobuuid;
        var jobDataKey;
        var jobData;

        before(function(done) {
            jobuuid = uuid.v1();
            jobDataKey = Queue._getJobDataKey(jobuuid);
            jobData = {
                uuid: jobuuid
            };

            done();
        });

        it('should be able to save job data', function(done) {
            Queue
                ._saveJobData(jobDataKey, jobData, function(error, _jobData) {
                    expect(_jobData.uuid).to.equal(jobData.uuid);
                    done(error, _jobData);
                });
        });

        it('should be able to read job data', function(done) {
            Queue
                ._readJobData(jobDataKey, function(error, _jobData) {
                    expect(_jobData.uuid).to.equal(jobData.uuid);
                    done(error, _jobData);
                });
        });

    });

    describe('Queue `nextRun` Capabilities', function() {
        var lastRun = new Date();
        lastRun.setSeconds(0);

        it('should be able to compute next run from human interval', function(done) {
            var expectedNextRunTime = new Date(lastRun.valueOf());
            expectedNextRunTime.setMinutes(expectedNextRunTime.getMinutes() + 5);

            Queue._computeNextRunTime({
                reccurInterval: '5 minutes',
                lastRun: lastRun
            }, function(error, nextRun) {
                if (error) {
                    done(error);
                } else {
                    expect(nextRun).to.eql(expectedNextRunTime);
                    done();
                }

            });

        });

        it('should be able to compute next run from cron interval', function(done) {
            var lastRun = new Date();
            lastRun.setSeconds(0);

            Queue._computeNextRunTime({
                reccurInterval: '* * * * * *',
                lastRun: lastRun
            }, function(error, nextRun) {
                if (error) {
                    done(error);
                } else {
                    expect(nextRun.getSeconds()).to.equal(lastRun.getSeconds() + 1);
                    done();
                }

            });
        });

        it('should throw `Invalid reccur interval` if interval is not human interval or cron interval', function(done) {
            Queue._computeNextRunTime({
                reccurInterval: 'abcd'
            }, function(error, nextRun) {
                expect(error.message).to.equal('Invalid reccur interval');
                done(null, nextRun);
            });
        });

    });

    it('should be able to enable key expriration notifications', function(done) {
        Queue.enableExpiryNotifications();

        Queue
            ._cli
            .config('GET', 'notify-keyspace-events', function(error, results) {

                expect(error).to.be.null;
                expect(results).to.not.be.null;

                expect(results[1].indexOf('E')).to.be.above(-1);
                expect(results[1].indexOf('x')).to.be.above(-1);

                done(error, results);
            });
    });

});