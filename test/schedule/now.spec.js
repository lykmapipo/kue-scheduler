'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var kue = require('kue');
var KueScheduler = require(path.join(__dirname, '..', '..', 'index'));
var faker = require('faker');

describe('KueScheduler#now', function() {
    var kueScheduler;
    var nowQueue;

    before(function(done) {
        kueScheduler = new KueScheduler();
        nowQueue = kue.createQueue();
        done();
    });

    it('should be a function', function(done) {
        expect(kueScheduler.now).to.be.a('function');
        done();
    });

    it('should be able to schedule a job to run now', function(done) {
        var data = {
            to: faker.internet.email()
        };

        var backoff = {
            delay: 60000,
            type: 'fixed'
        };

        nowQueue.process('email', function(job, finalize) {
            /*jshint camelcase:false */
            expect(job.id).to.exist;
            expect(job.type).to.equal('email');
            expect(parseInt(job._max_attempts)).to.equal(3);
            expect(job.data.to).to.equal(data.to);
            expect(job.data.schedule).to.equal('NOW');

            expect(job._backoff).to.eql(backoff);
            expect(parseInt(job._priority)).to.equal(0);
            /*jshint camelcase:true */

            finalize();
            done();
        });


        kueScheduler.now({
            type: 'email',
            priority: 'normal',
            attempts: 3,
            backoff: backoff,
            data: data
        }, function(error, job) {
            if (error) {
                done(error);
            }
            /*jshint camelcase:false */
            expect(job.id).to.exist;
            expect(job.type).to.equal('email');
            expect(parseInt(job._max_attempts)).to.equal(3);
            expect(job.data.to).to.equal(data.to);
            expect(job.data.schedule).to.equal('NOW');

            expect(job._backoff).to.eql(backoff);
            expect(parseInt(job._priority)).to.equal(0);
            /*jshint camelcase:true */

        });
    });
});