'use strict';

//dependencies
var expect = require('chai').expect;
var path = require('path');
var kue = require('kue');
var KueScheduler = require(path.join(__dirname, '..', '..', 'index'));
// var faker = require('faker');

describe('KueScheduler#every', function() {
    var kueScheduler;
    var everyQueue;

    before(function(done) {
        kueScheduler = new KueScheduler();
        everyQueue = kue.createQueue();
        done();
    });

    after(function(done) {
        everyQueue.shutdown(done);
    });

    it('should be a function', function(done) {
        expect(kueScheduler.every).to.be.a('function');
        done();
    });

    // it('should be able to schedule a job to run every 2 seconds from now', function(done) {
    //     var data = {
    //         to: faker.internet.email()
    //     };

    //     var backoff = {
    //         delay: 60000,
    //         type: 'fixed'
    //     };

    //     everyQueue.process('email', function(job, finalize) {
    //         /*jshint camelcase:false */
    //         expect(job.id).to.exist;
    //         expect(job.type).to.equal('email');
    //         expect(parseInt(job._max_attempts)).to.equal(3);
    //         expect(job.data.to).to.equal(data.to);
    //         expect(job.data.schedule).to.equal('ONCE');

    //         expect(job._backoff).to.eql(backoff);
    //         expect(parseInt(job._priority)).to.equal(0);
    //         /*jshint camelcase:true */

    //         finalize();
    //     });

    //     everyQueue.promote(3000);

    //     kueScheduler.schedule(
    //         '2 seconds from now', {
    //             type: 'email',
    //             priority: 'normal',
    //             attempts: 3,
    //             backoff: backoff,
    //             data: data
    //         },
    //         function(error, job) {
    //             if (error) {
    //                 done(error);
    //             } else {
    //                 /*jshint camelcase:false */
    //                 expect(job.id).to.exist;
    //                 expect(job.type).to.equal('email');
    //                 expect(parseInt(job._max_attempts)).to.equal(3);
    //                 expect(job.data.to).to.equal(data.to);
    //                 expect(job.data.schedule).to.equal('ONCE');

    //                 expect(job._backoff).to.eql(backoff);
    //                 expect(parseInt(job._priority)).to.equal(0);
    //                 /*jshint camelcase:true */
    //             }
    //         });


    //     setTimeout(function() {
    //         done();
    //     }, 5000);
    // });

});