'use strict';

//dependencies
var expect = require('chai').expect;
var _ = require('lodash');
var path = require('path');
var kue = require(path.join(__dirname, '..', '..', 'index'));
var faker = require('faker');
var Queue;

describe('Queue#every', function() {

    beforeEach(function(done) {
        Queue = kue.createQueue();
        done();
    });

    afterEach(function(done) {
        Queue.shutdown(done);
    });

    it('should be a function', function(done) {
        expect(Queue.every).to.be.a('function');
        done();
    });

    it('should be able to schedule a non unique job to run every 2 seconds from now', function(done) {

        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };
        var runCount = 0;
        var jobs = [];

        Queue.process('every', function(job, finalize) {
            //increament run counts
            runCount++;

            jobs.push(job);

            /*jshint camelcase:false */
            expect(job.id).to.exist;
            expect(job.type).to.equal('every');
            expect(parseInt(job._max_attempts)).to.equal(3);
            expect(job.data.to).to.equal(data.to);
            expect(job.data.schedule).to.equal('RECCUR');
            expect(job.data.expiryKey).to.exist;
            expect(job.data.dataKey).to.exist;

            expect(job._backoff).to.eql(backoff);
            expect(parseInt(job._priority)).to.equal(0);
            /*jshint camelcase:true */

            finalize();
        });

        //listen on success scheduling
        Queue.on('schedule success', function(job) {
            if (job.type === 'every') {
                /*jshint camelcase:false */
                expect(job.id).to.exist;
                expect(job.type).to.equal('every');
                expect(parseInt(job._max_attempts)).to.equal(3);
                expect(job.data.to).to.equal(data.to);
                expect(job.data.schedule).to.equal('RECCUR');
                expect(job.data.expiryKey).to.exist;
                expect(job.data.dataKey).to.exist;

                expect(job._backoff).to.eql(backoff);
                expect(parseInt(job._priority)).to.equal(0);
                /*jshint camelcase:true */
            }
        });

        var job = Queue
            .createJob('every', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

        Queue.every('2 seconds', job);

        //wait for two jobs to be runned
        setTimeout(function() {
            expect(runCount).to.equal(2);
            var ids = _.map(jobs, 'id');
            expect(ids[0]).to.not.equal(ids[1]);

            done();
        }, 6000);
    });

    it('should be able to schedule a unique job to run every 2 seconds from now', function(done) {

        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };
        var runCount = 0;
        var jobs = [];

        Queue.process('unique_every', function(job, finalize) {
            //increament run counts
            runCount++;

            jobs.push(job);

            /*jshint camelcase:false */
            expect(job.id).to.exist;
            expect(job.type).to.equal('unique_every');
            expect(parseInt(job._max_attempts)).to.equal(3);
            expect(job.data.to).to.equal(data.to);
            expect(job.data.schedule).to.equal('RECCUR');
            expect(job.data.expiryKey).to.equal('q:scheduler:every_mail');
            expect(job.data.dataKey).to.equal('q:scheduler:data:every_mail');

            expect(job._backoff).to.eql(backoff);
            expect(parseInt(job._priority)).to.equal(0);
            /*jshint camelcase:true */

            finalize();
        });

        //listen on success scheduling
        Queue.on('schedule success', function(job) {
            if (job.type === 'unique_every') {
                /*jshint camelcase:false */
                expect(job.id).to.exist;
                expect(job.type).to.equal('unique_every');
                expect(parseInt(job._max_attempts)).to.equal(3);
                expect(job.data.to).to.equal(data.to);
                expect(job.data.schedule).to.equal('RECCUR');
                expect(job.data.expiryKey).to.equal('q:scheduler:every_mail');
                expect(job.data.dataKey).to.equal('q:scheduler:data:every_mail');

                expect(job._backoff).to.eql(backoff);
                expect(parseInt(job._priority)).to.equal(0);
                /*jshint camelcase:true */
            }
        });

        var job = Queue
            .createJob('unique_every', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal')
            .unique('every_mail');

        Queue.every('2 seconds', job);

        //wait for two jobs to be runned
        setTimeout(function() {
            expect(runCount).to.equal(2);
            var ids = _.map(jobs, 'id');
            expect(ids[0]).to.equal(ids[1]);
            Queue.remove({ unique: 'every_mail' }, done);
        }, 6000);
    });

    it('should be able to remove scheduled unique job', function(done) {

        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };
        var runCount = 0;
        var jobs = [];

        Queue.process('removed_every', function(job, finalize) {

            //remove scheduled job after first run
            if (runCount === 1) {
                Queue.remove(job, function(error, response) {
                    expect(error).to.not.exist;
                    expect(response.removedExpiryKey).to.equal(1);
                    expect(response.removedJobData).to.equal(1);
                    expect(response.removedJobInstance).to.exist;
                });

                finalize();
            } else {
                jobs.push(job);

                /*jshint camelcase:false */
                expect(job.id).to.exist;
                expect(job.type).to.equal('removed_every');
                expect(parseInt(job._max_attempts)).to.equal(3);
                expect(job.data.to).to.equal(data.to);
                expect(job.data.schedule).to.equal('RECCUR');
                expect(job.data.expiryKey).to.equal('q:scheduler:removed_email');
                expect(job.data.dataKey).to.equal('q:scheduler:data:removed_email');

                expect(job._backoff).to.eql(backoff);
                expect(parseInt(job._priority)).to.equal(0);
                /*jshint camelcase:true */

                //increament run counts
                runCount++;

                finalize();
            }
        });

        //listen on success scheduling
        Queue.on('schedule success', function(job) {
            if (job.type === 'removed_every') {
                /*jshint camelcase:false */
                expect(job.id).to.exist;
                expect(job.type).to.equal('removed_every');
                expect(parseInt(job._max_attempts)).to.equal(3);
                expect(job.data.to).to.equal(data.to);
                expect(job.data.schedule).to.equal('RECCUR');
                expect(job.data.expiryKey).to.equal('q:scheduler:removed_email');
                expect(job.data.dataKey).to.equal('q:scheduler:data:removed_email');

                expect(job._backoff).to.eql(backoff);
                expect(parseInt(job._priority)).to.equal(0);
                /*jshint camelcase:true */
            }
        });

        var job = Queue
            .createJob('removed_every', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal')
            .unique('removed_email');

        Queue.every('2 seconds', job);

        //wait for two jobs to be runned
        setTimeout(function() {
            expect(runCount).to.equal(1);
            expect(_.map(jobs, 'id')).to.have.length(1);
            Queue.remove({ unique: 'removed_email' }, done);
        }, 6000);
    });

    it('should be able to emit `schedule error` if schedule or job is not given', function(done) {

        Queue.once('schedule error', function(error) {

            expect(error.message).to.be.equal('Invalid number of parameters');

            done();
        });

        Queue.every('2 seconds', undefined);

    });

    it('should be able to emit `schedule error` if job is not an instance of Job', function(done) {

        Queue.once('schedule error', function(error) {

            expect(error.message).to.be.equal('Invalid job type');

            done();
        });

        Queue.every('2 seconds', {
            name: faker.name.firstName()
        });

    });

});
