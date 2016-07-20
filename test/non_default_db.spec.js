'use strict';

//dependencies
var expect = require('chai').expect;
var _ = require('lodash');
var path = require('path');
var kue = require(path.join(__dirname, '..', 'index'));
var faker = require('faker');
var async = require('async');
var Queue;
var redisPublishClient;

//TODO: Clean up the cleanup.

//redis client for database cleanups
var redisCleanUpClient = kue.redis.createClientFactory({
  redis: {
    db: 2
  }
});

function cleanup(callback) {
    redisCleanUpClient
        .keys('q*', function(error, rows) {
            if (error) {
                callback(error);
            } else {
                async.each(rows, function(row, next) {
                    redisCleanUpClient.del(row, next);
                }, callback);
            }
        });
}

describe('Queue non-default database', function() {

    beforeEach(function(done) {
        Queue = kue.createQueue({
          redis: {
            db: 2 // custom db
          }
        });
        redisPublishClient = kue.redis.createClient();
        done();
    });

    afterEach(function(done) {
        Queue.shutdown(function(){
            cleanup(done);
        });
    });

    it('should be able to filter unrelated redis published messages', function(done) {

        Queue.on('scheduler unknown job expiry key', function(message) {

            expect(Queue._isJobExpiryKey(message)).to.be.false;

            done();
        });
        //send expired event on db 2
        redisPublishClient.publish('__keyevent@2__:expired', 'message');
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
            finalize();
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
});
