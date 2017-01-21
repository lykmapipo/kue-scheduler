'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var uuid = require('uuid');
var kue = require(path.join(__dirname, '..', 'index'));
var Queue;

describe('Queue Schedules Restore', function () {
  var jobuuid;
  var jobDataKey;
  var jobData;
  var interval = '10 seconds';

  before(function (done) {
    Queue = kue.createQueue();
    done();
  });


  before(function (done) {
    jobuuid = uuid.v1();
    jobDataKey = Queue._getJobDataKey(jobuuid);
    jobData = {
      uuid: jobuuid,
      reccurInterval: interval
    };

    Queue._saveJobData(jobDataKey, jobData, done);

  });

  after(function (done) {
    Queue.clear(function ( /*error,results*/ ) {
      Queue.shutdown(done);
    });
  });

  it('should be able to restore previous schedules', function () {
    expect(Queue).to.respondTo('restore');
  });


  it('should be able to get all schedules', function (done) {

    Queue._getAllJobData(function (error, schedules) {

      expect(error).to.not.exist;
      expect(schedules).to.exist;
      expect(Array.isArray(schedules)).to.be.true;

      var schedule = schedules[0];
      expect(schedule).to.not.be.null;
      expect(schedule.uuid).to.exist;
      expect(schedule.uuid).to.be.equal(jobuuid);

      expect(schedule.reccurInterval).to.exist;
      expect(schedule.reccurInterval).to.be.equal(interval);

      done(error, schedules);

    });

  });

  it('should be able to restore schedules', function (done) {

    Queue.restore(function (error, schedules) {
      if (error) {
        done(error);
      }

      expect(error).to.not.exist;
      expect(schedules).to.exist;
      expect(Array.isArray(schedules)).to.be.true;

      var schedule = schedules[0];
      expect(schedule).to.not.be.null;
      expect(schedule.uuid).to.exist;
      expect(schedule.uuid).to.be.equal(jobuuid);

      expect(schedule.reccurInterval).to.exist;
      expect(schedule.reccurInterval).to.be.equal(interval);

      expect(schedule.data).to.exist;
      expect(schedule.data.expiryKey).to.exist;
      expect(schedule.data.dataKey).to.exist;

      //check expiry key for existance
      Queue.client.get(schedule.data.expiryKey, function (error,
        expiryKey) {
        expect(expiryKey).to.exist;
        expect(expiryKey).to.be.equal(schedule.data.expiryKey);
        done(error, schedules);
      });

    });

  });

});
