'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var moment = require('moment');
var kue = require(path.join(__dirname, '..', '..', 'index'));
var faker = require('faker');
var Queue;

describe('Queue#schedule', function () {

    before(function (done) {
        Queue = kue.createQueue();
        var redis = kue.redis.createClient();
        redis.send_command('FLUSHALL', [], function () {
            done();
        });
    });

    after(function (done) {
        Queue.shutdown(done);
    });

    it('should be a function', function (done) {
        expect(Queue.schedule).to.be.a('function');
        done();
    });

    it('should be able to parse date.js valid string', function (done) {
        var tenMinutesFromNow = moment().add(10, 'minutes').toDate();
        Queue
            ._parse('10 minutes from now', function (error, date) {
                expect(date.getMinutes()).to.eql(tenMinutesFromNow.getMinutes());
                done(error, date);
            });
    });

    it('should be able to schedule a job to run after 2 seconds from now', function (done) {
        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };

        Queue.process('schedule', function (job, finalize) {
            /*jshint camelcase:false */
            expect(job.id).to.exist;
            expect(job.type).to.equal('schedule');
            expect(parseInt(job._max_attempts)).to.equal(3);
            expect(job.data.to).to.equal(data.to);
            expect(job.data.schedule).to.equal('ONCE');

            expect(job._backoff).to.eql(backoff);
            expect(parseInt(job._priority)).to.equal(0);
            /*jshint camelcase:true */

            finalize();
        });

        //listen on success scheduling
        Queue.on('schedule success', function (job) {
            if (job.type === 'schedule') {

                /*jshint camelcase:false */
                expect(job.id).to.exist;
                expect(job.type).to.equal('schedule');
                expect(parseInt(job._max_attempts)).to.equal(3);
                expect(job.data.to).to.equal(data.to);
                expect(job.data.schedule).to.equal('ONCE');

                expect(job._backoff).to.eql(backoff);
                expect(parseInt(job._priority)).to.equal(0);
                /*jshint camelcase:true */
            }

            Queue._checkJobAlreadyDelayed('schedule', null, function () {
                setTimeout(function () {
                    done();
                }, 9000);
            });
        });

        /**
         * @deprecated
         */
        // Queue.promote(3000);

        var job = Queue
            .createJob('schedule', data)
            .attempts(3)
            .backoff(backoff)
            .priority('normal');

        Queue.schedule('8 seconds from now', job);
    });

});
