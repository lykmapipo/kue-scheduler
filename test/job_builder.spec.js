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

    it('should be able to instantiate a job and apply all job attributes', function(done) {
        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };

        kueScheduler
            ._buildJob({
                type: 'email',
                priority: 'normal',
                attempts: 3,
                backoff: backoff,
                data: data
            }, function(error, job) {
                /*jshint camelcase:false */
                expect(job.id).to.be.undefined;
                expect(job.type).to.equal('email');
                expect(parseInt(job._max_attempts)).to.equal(3);
                expect(job.data.to).to.equal(data.to);

                expect(job._backoff).to.eql(backoff);
                expect(parseInt(job._priority)).to.equal(0);
                /*jshint camelcase:true */

                done(error, job);
            });
    });
});