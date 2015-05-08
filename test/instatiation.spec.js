'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var kue = require(path.join(__dirname, '..', 'index'));
var Queue;


describe('Queue Job Scheduler & Listener', function() {

    before(function(done) {
        Queue = kue.createQueue();
        done();
    });

    it('should be able to instantiate scheduler redis client', function(done) {
        expect(Queue.scheduler).to.exist;
        done();
    });

    it('should be able to instantiate expiry key listener', function(done) {
        expect(Queue.listener).to.exist;
        done();
    });
});