'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var KueScheduler = require(path.join(__dirname, '..', 'index'));

describe('KueScheduler', function() {
    it('should be a functional constructor', function(done) {
        expect(KueScheduler).to.be.a('Function');
        done();
    });

    it('should be able to shedule job in later time', function(done) {
        done();
    });

    it('should be able to execute jobs every after specific time interval', function(done) {
        done();
    });

    it('should be able to execute a job now', function(done) {
        done();
    });

    it('should be able to execute job at a given time', function(done) {
        done();
    });

});