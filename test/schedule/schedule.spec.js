'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var kue = require('kue');
var moment = require('moment');
var kue = require(path.join(__dirname, '..', '..', 'index'));
var faker = require('faker');
var Queue;

describe('Queue#schedule', function () {

  beforeEach(function (done) {
    Queue = kue.createQueue();
    Queue.clear(done);
  });

  afterEach(function (done) {
    Queue.clear(function ( /*error,results*/ ) {
      Queue.shutdown(done);
    });
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

  it(
    'should be able to schedule a non unique job to run after 2 seconds from now',
    function (done) {
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

      Queue.schedule('2 seconds from now', job);


      setTimeout(function () {
        done();
      }, 4000);
    });

  it(
    'should be able to schedule a unique job to run after 2 seconds from now',
    function (done) {
      var data = {
        to: faker.internet.email()
      };

      var backoff = {
        delay: 60000,
        type: 'fixed'
      };
      var runCount = 0;
      var processedJob;
      var existJob;

      Queue.process('unique_schedule', function (job, finalize) {
        //increament run counts
        runCount++;

        /*jshint camelcase:false*/
        expect(job.id).to.exist;
        expect(job.type).to.equal('unique_schedule');
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
        if (job.type === 'unique_schedule') {
          //collect jobs
          processedJob = job;

          /*jshint camelcase:false */
          expect(job.id).to.exist;
          expect(job.type).to.equal('unique_schedule');
          expect(parseInt(job._max_attempts)).to.equal(3);
          expect(job.data.to).to.equal(data.to);
          expect(job.data.schedule).to.equal('ONCE');

          expect(job._backoff).to.eql(backoff);
          expect(parseInt(job._priority)).to.equal(0);
          /*jshint camelcase:true */
        }
      });

      //listen for already scheduled jobs
      Queue.on('already scheduled', function (job) {

        if (job.type === 'unique_schedule') {

          existJob = job;

          /*jshint camelcase:false */
          expect(job.id).to.exist;
          expect(job.type).to.equal('unique_schedule');
          expect(parseInt(job._max_attempts)).to.equal(3);
          expect(job.data.to).to.equal(data.to);
          expect(job.data.schedule).to.equal('ONCE');

          expect(job._backoff).to.eql(backoff);
          expect(parseInt(job._priority)).to.equal(0);
          /*jshint camelcase:true */
        }
      });

      var job = Queue
        .createJob('unique_schedule', data)
        .attempts(3)
        .backoff(backoff)
        .priority('normal')
        .unique('mail_schedule');

      //fire job at first
      Queue.schedule('2 seconds from now', job);

      //try fire it again
      setTimeout(function () {
        Queue.schedule('2 seconds from now', job);
      }, 1000);


      //wait for some seconds jobs to be runned
      setTimeout(function () {

        expect(runCount).to.equal(1);
        //expect(existJob.id).to.equal(processedJob.id);

        done();
      }, 5000);
    });

  it(
    'should be able to emit `schedule error` if schedule or job is not given',
    function (done) {

      Queue.once('schedule error', function (error) {

        expect(error.message).to.be.equal(
          'Missing Schedule Interval');

        done();
      });

      Queue.schedule(undefined, undefined);

    });

  it(
    'should be able to emit `schedule error` if job is not given',
    function (done) {

      Queue.once('schedule error', function (error) {

        expect(error.message).to.be.equal(
          'Invalid Job Instance');

        done();
      });

      Queue.schedule('2 seconds from now', undefined);

    });

});