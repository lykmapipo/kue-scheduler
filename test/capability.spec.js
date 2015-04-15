'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var uuid = require('node-uuid');
var later = require('later');
var KueScheduler = require(path.join(__dirname, '..', 'index'));

describe('KueScheduler#Capability', function() {
    var kueScheduler;

    before(function(done) {
        kueScheduler = new KueScheduler();
        done();
    });

    it('should be a functional constructor', function(done) {
        expect(KueScheduler).to.be.a('function');
        done();
    });

    it('should be able to shedule job in later time', function(done) {
        expect(kueScheduler).to.respondTo('schedule');
        done();
    });

    it('should be able to execute jobs every after specific time interval', function(done) {
        expect(kueScheduler).to.respondTo('every');
        done();
    });

    it('should be able to execute a job now', function(done) {
        expect(kueScheduler).to.respondTo('now');
        done();
    });

    it('should be able to generate job expriration key', function(done) {
        var jobuuid = uuid.v1();

        expect(kueScheduler._getJobExpiryKey(jobuuid))
            .to.be.equal('kue:scheduler:' + jobuuid);

        done();
    });

    it('should be able to generate job data storage key', function(done) {
        var jobuuid = uuid.v1();

        expect(kueScheduler._getJobDataKey(jobuuid))
            .to.be.equal('kue:scheduler:data:' + jobuuid);

        done();
    });

    it('should be able to generate job uuid from job expriration key', function(done) {
        var jobuuid = uuid.v1();
        var jobEpiryKey = kueScheduler._getJobExpiryKey(jobuuid);

        expect(kueScheduler._getJobUUID(jobEpiryKey))
            .to.be.equal(jobuuid);

        done();
    });

    describe('KueScheduler#Capability#CRUD', function() {
        var jobuuid;
        var jobDataKey;
        var jobData;

        before(function(done) {
            jobuuid = uuid.v1();
            jobDataKey = kueScheduler._getJobDataKey(jobuuid);
            jobData = {
                uuid: jobuuid
            };

            done();
        });

        it('should be able to save job data', function(done) {
            kueScheduler
                ._saveJobData(jobDataKey, jobData, function(error, _jobData) {
                    expect(_jobData.uuid).to.equal(jobData.uuid);
                    done(error, _jobData);
                });
        });

        it('should be able to read job data', function(done) {
            kueScheduler
                ._readJobData(jobDataKey, function(error, _jobData) {
                    expect(_jobData.uuid).to.equal(jobData.uuid);
                    done(error, _jobData);
                });
        });

    });

    describe('KueScheduler#Capability#nextRun', function() {
        var lastRun = new Date();
        lastRun.setSeconds(0);

        it('should be able to compute next run from human interval', function(done) {
            var expectedNextRunTime = new Date(lastRun.valueOf());
            expectedNextRunTime.setMinutes(expectedNextRunTime.getMinutes() + 5);

            kueScheduler._computeNextRunTime({
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

        it('should be able to compute next run from later interval', function(done) {
            var schedules = later.parse.text('every 5 minutes', true);
            var nextRuns = later.schedule(schedules).next(5, lastRun);

            kueScheduler._computeNextRunTime({
                reccurInterval: 'every 5 minutes',
                lastRun: lastRun
            }, function(error, nextRun) {
                if (error) {
                    done(error);
                } else {
                    expect(nextRuns.toString()).to.contain(nextRun);
                    done();
                }

            });
        });

        it('should throw `Invalid reccur interval` if interval is not human interval or cron interval', function(done) {
            kueScheduler._computeNextRunTime({
                reccurInterval: 'abcd'
            }, function(error, nextRun) {
                expect(error.message).to.equal('Invalid reccur interval');
                done(null, nextRun);
            });
        });

    });

});