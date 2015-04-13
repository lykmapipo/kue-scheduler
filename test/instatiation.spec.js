'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var KueScheduler = require(path.join(__dirname, '..', 'index'));


describe('KueScheduler#Instatiation', function() {
    var kueScheduler;

    before(function(done) {
        kueScheduler = new KueScheduler();
        done();
    });

    it('should be able to set default redis options', function(done) {
        expect(kueScheduler.options.redis.port).to.be.equal(6379);
        expect(kueScheduler.options.redis.host).to.be.equal('127.0.0.1');
        done();
    });

    it('should be able to instantiate internal kue queue', function(done) {
        expect(kueScheduler.queue).to.exist;
        done();
    });

    it('should be able to instantiate scheduler redis client', function(done) {
        expect(kueScheduler.scheduler).to.exist;
        done();
    });

    it('should be able to instantiate expiry key listener', function(done) {
        expect(kueScheduler.listener).to.exist;
        done();
    });
});