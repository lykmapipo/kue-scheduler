'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var uuid = require('node-uuid');
var KueScheduler = require(path.join(__dirname, '..', 'index'));

describe('KueScheduler#Capability', function() {
    var kueScheduler;

    before(function(done) {
        kueScheduler = new KueScheduler();
        done();
    });

    it('should be a functional constructor', function(done) {
        expect(KueScheduler).to.be.a('function');
        done();
    });

    it('should be able to shedule job in later time', function(done) {
        expect(kueScheduler).to.respondTo('schedule');
        done();
    });

    it('should be able to execute jobs every after specific time interval', function(done) {
        expect(kueScheduler).to.respondTo('every');
        done();
    });

    it('should be able to execute a job now', function(done) {
        expect(kueScheduler).to.respondTo('now');
        done();
    });

    it('should be able to generate job expriration key', function(done) {
        var jobuuid = uuid.v1();

        expect(kueScheduler._getJobExpiryKey(jobuuid))
            .to.be.equal('kue:scheduler:' + jobuuid);

        done();
    });

    it('should be able to generate job data storage key', function(done) {
        var jobuuid = uuid.v1();

        expect(kueScheduler._getJobDataKey(jobuuid))
            .to.be.equal('kue:scheduler:data:' + jobuuid);

        done();
    });

});