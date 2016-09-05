'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var kue = require(path.join(__dirname, '..', 'index'));
var Queue;


describe('Queue Job Scheduler & Listener', function () {

  afterEach(function (done) {
    Queue.shutdown(done);
    Queue = null;
  });

  it('should be able to instantiate kue-scheduler with custom options',
    function (done) {
      var options = {
        prefix: 'w',
        redis: {
          port: 6379,
          host: '127.0.0.1',
          db: 2
        }
      };
      Queue = kue.createQueue(options);

      //assert
      expect(Queue.options).to.eql(options);
      expect(Queue._options).to.eql(options);

      done();
    });

  it('should be able to instantiate scheduler redis client', function (done) {
    Queue = kue.createQueue();
    expect(Queue._scheduler).to.exist;
    done();
  });

  it('should be able to instantiate expiry key listener', function (done) {
    Queue = kue.createQueue();
    expect(Queue._listener).to.exist;
    done();
  });
});