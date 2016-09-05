'use strict';

//dependencies
var path = require('path');
var _ = require('lodash');
var expect = require('chai').expect;
var kue = require(path.join(__dirname, '..', '..', 'index'));
var Job = kue.Job;
var faker = require('faker');
var Queue;

describe('Queue#now', function () {

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
    expect(Queue.now).to.be.a('function');
    done();
  });

  it(
    'should be able to schedule a non unique job to run now',
    function (done) {
      var data = {
        to: faker.internet.email()
      };

      var backoff = {
        delay: 60000,
        type: 'fixed'
      };


      Queue.process('now', function (job, finalize) {

        /*jshint camelcase:false */
        expect(job.id).to.exist;
        expect(job.type).to.equal('now');
        expect(parseInt(job._max_attempts)).to.equal(3);
        expect(job.data.to).to.equal(data.to);
        expect(job.data.schedule).to.equal('NOW');

        expect(job._backoff).to.eql(backoff);
        expect(parseInt(job._priority)).to.equal(0);
        /*jshint camelcase:true */

        finalize();

      });

      //listen on success scheduling
      Queue.on('schedule success', function (job) {
        if (job.type === 'now') {

          /*jshint camelcase:false */
          expect(job.id).to.exist;
          expect(job.type).to.equal('now');
          expect(parseInt(job._max_attempts)).to.equal(3);
          expect(job.data.to).to.equal(data.to);
          expect(job.data.schedule).to.equal('NOW');

          expect(job._backoff).to.eql(backoff);
          expect(parseInt(job._priority)).to.equal(0);
          /*jshint camelcase:true */
        }
      });

      var job = Queue
        .createJob('now', data)
        .attempts(3)
        .backoff(backoff)
        .priority('normal');

      //finalize was not always completing before done();
      Queue.on('job complete', function () {
        if (job.type === 'now') {
          setTimeout(function () { done(); }, 3000);
        }
      });


      Queue.now(job);
    });

  it(
    'should be able to schedule a unique job to run now',
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
      var ids = [];


      Queue.process('unique_now', function (job, finalize) {
        //increament run counts
        runCount++;
        ids.push(job.id);

        /*jshint camelcase:false */
        expect(job.id).to.exist;
        expect(job.type).to.equal('unique_now');
        expect(parseInt(job._max_attempts)).to.equal(3);
        expect(job.data.to).to.equal(data.to);
        expect(job.data.schedule).to.equal('NOW');

        expect(job._backoff).to.eql(backoff);
        expect(parseInt(job._priority)).to.equal(0);
        /*jshint camelcase:true */

        finalize();
      });

      //listen on success scheduling
      Queue.on('schedule success', function (job) {

        if (job.type === 'unique_now') {
          //collect jobs
          processedJob = job;

          /*jshint camelcase:false */
          expect(job.id).to.exist;
          expect(job.type).to.equal('unique_now');
          expect(parseInt(job._max_attempts)).to.equal(3);
          expect(job.data.to).to.equal(data.to);
          expect(job.data.schedule).to.equal('NOW');

          expect(job._backoff).to.eql(backoff);
          expect(parseInt(job._priority)).to.equal(0);
          /*jshint camelcase:true */
        }
      });

      //listen for already scheduled jobs
      Queue.on('already scheduled', function (job) {

        if (job.type === 'unique_now') {

          existJob = job;

          /*jshint camelcase:false */
          expect(job.id).to.exist;
          expect(job.type).to.equal('unique_now');
          expect(parseInt(job._max_attempts)).to.equal(3);
          expect(job.data.to).to.equal(data.to);
          expect(job.data.schedule).to.equal('NOW');

          expect(job._backoff).to.eql(backoff);
          expect(parseInt(job._priority)).to.equal(0);
          /*jshint camelcase:true */
        }
      });

      Queue.on('schedule error', function (error) {
        done(error);
      });


      var job = Queue
        .createJob('unique_now', data)
        .attempts(3)
        .backoff(backoff)
        .priority('normal')
        .unique('mail_now');

      //fire job at first
      Queue.now(job);

      //try fire it again
      setTimeout(function () {
        Queue.now(job);
      }, 1000);


      //wait for some seconds jobs to be runned
      setTimeout(function () {

        Job.getUniqueJobsData(function (error, uniqueJobs) {
          expect(error).to.not.exist;

          expect(_.keys(uniqueJobs))
            .to.include.members([
              'mail_now'
            ]);

          expect(_.values(uniqueJobs))
            .to.include.members([String(ids[0])]);

          expect(runCount).to.equal(2);
          expect(ids[0]).to.be.equal(ids[1]);
          expect(existJob.id).to.equal(processedJob.id);

          done(error, uniqueJobs);
        });

      }, 5000);
    });


  it(
    'should be able to emit `schedule error` if job is not an instance of Job',
    function (done) {

      Queue.once('schedule error', function (error) {

        expect(error.message).to.be.equal('Invalid job type');

        done();
      });

      Queue.now({
        name: faker.name.firstName()
      });

    });
});