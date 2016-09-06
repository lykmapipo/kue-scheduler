'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var kue = require(path.join(__dirname, '..', '..', 'index'));
var redis = kue.redis;
var Queue;

describe('Queue#redis messages', function () {

  before(function (done) {
    Queue = kue.createQueue();
    redis = redis.createClient();
    done();
  });

  after(function (done) {
    Queue.clear(function ( /*error,results*/ ) {
      Queue.shutdown(done);
    });
  });

  it('should be able to filter unrelated redis published messages',
    function (done) {

      Queue.on('scheduler unknown job expiry key', function (message) {

        expect(Queue._isJobExpiryKey(message)).to.be.false;

        done();
      });

      redis.publish('__keyevent@0__:expired', 'message');
    });

});