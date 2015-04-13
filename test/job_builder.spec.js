'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var KueScheduler = require(path.join(__dirname, '..', 'index'));
var faker = require('faker');

describe('KueScheduler#JobBuilder', function() {
    var kueScheduler;
    before(function(done) {
        kueScheduler = new KueScheduler();
        done();
    });

    it('should be a function', function(done) {
        expect(kueScheduler._buildJob).to.be.a('function');
        done();
    });

    it('should throw `Invalid job definition` if no job definiton provided', function(done) {
        kueScheduler
            ._buildJob('a', function(error, job) {
                expect(error.message).to.equal('Invalid job definition');
                done(null, job);
            });
    });

    it('should throw `Missing job type or data` if no job type provided', function(done) {
        kueScheduler
            ._buildJob({
                data: {
                    to: faker.internet.email()
                }
            }, function(error, job) {
                expect(error.message).to.equal('Missing job type or data');
                done(null, job);
            });
    });

    it('should throw `Missing job type or data` if no job data provided', function(done) {
        kueScheduler
            ._buildJob({
                type: 'mail'
            }, function(error, job) {
                expect(error.message).to.equal('Missing job type or data');
                done(null, job);
            });
    });
});