'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var kue = require(path.join(__dirname, '..', '..', 'index'));
var faker = require('faker');
var Queue;
var redis = require('redis').createClient();

describe('Queue#redisFilter', function () {
    this.timeout(15000);

    before(function (done) {
        redis.flushall(function () {
            Queue = kue.createQueue();
            done();
        });
    });

    after(function (done) {
        Queue.shutdown(function () {
            redis.flushall(done);
        });
    });

    it('should be a function', function (done) {
        expect(Queue.every).to.be.a('function');
        done();
    });

    it('should be able to filter unrelated to kue messages', function (done) {

        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };
        var runCount = 0;

        Queue.process('every', function (job, finalize) {
            //increament run counts
            runCount++;

            /*jshint camelcase:false */
            expect(job.id).to.exist;
            expect(job.type).to.equal('every');
            expect(parseInt(job._max_attempts)).to.equal(3);
            expect(job.data.to).to.equal(data.to);
            expect(job.data.schedule).to.equal('RECCUR');

            expect(job._backoff).to.eql(backoff);
            expect(parseInt(job._priority)).to.equal(0);
            /*jshint camelcase:true */

            finalize();
        });

        //listen on success scheduling
        Queue.on('schedule success', function (job) {
            if (job.type === 'every') {
                /*jshint camelcase:false */
                expect(job.id).to.exist;
                expect(job.type).to.equal('every');
                expect(parseInt(job._max_attempts)).to.equal(3);
                expect(job.data.to).to.equal(data.to);
                expect(job.data.schedule).to.equal('RECCUR');

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

        Queue.every('6 seconds', job);

        redis.publish('__keyevent@0__:expired', 'message', function () {

            //wait for two jobs to be runned
            setTimeout(function () {
                expect(runCount).to.equal(1);
                done();
            }, 9000);
        });
    });

    it('should be able to pass related to kue messages', function (done) {

        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };
        var runCount = 0;

        Queue.process('every', function (job, finalize) {
            //increament run counts
            runCount++;

            /*jshint camelcase:false */
            expect(job.id).to.exist;
            expect(job.type).to.equal('every');
            expect(parseInt(job._max_attempts)).to.equal(3);
            expect(job.data.to).to.equal(data.to);
            expect(job.data.schedule).to.equal('RECCUR');

            expect(job._backoff).to.eql(backoff);
            expect(parseInt(job._priority)).to.equal(0);
            /*jshint camelcase:true */

            finalize();
        });

        //listen on success scheduling
        Queue.on('schedule error', function (err) {
            expect(err).to.match(/Invalid jobData/);
            done();
        });

        var job = Queue
            .createJob('every', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

        Queue.every('5 seconds', job);

        redis.publish('__keyevent@0__:expired', 'q:message', function () {
        });
    });

});