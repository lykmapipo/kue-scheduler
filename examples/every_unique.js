'use strict';

/**
 * @description example of scheduling a unique jobs to run every after specified interval
 */

//dependencies
var path = require('path');

//require('kue-scheduler') here
var kue = require(path.join(__dirname, '..', 'index'));
var Queue = kue.createQueue();


//processing jobs
Queue.process('unique_every', function(job, done) {
    console.log('\nProcessing job with id %s at %s', job.id, new Date());
    done(null, {
        deliveredAt: new Date()
    });
});


//listen on scheduler errors
Queue.on('schedule error', function(error) {
    //handle all scheduling errors here
    console.log(error);
});


//listen on success scheduling
Queue.on('schedule success', function(job) {
    //a highly recommended place to attach
    //job instance level events listeners

    job.on('complete', function(result) {
        console.log('Job completed with data ', result);

    }).on('failed attempt', function(errorMessage, doneAttempts) {
        console.log('Job failed');

    }).on('failed', function(errorMessage) {
        console.log('Job failed');

    }).on('progress', function(progress, data) {
        console.log('\r  job #' + job.id + ' ' + progress + '% complete with data ', data);

    });

});
Queue.on('already scheduled', function(job){
  console.log('job already scheduled' + job.id);
});

/*Queue.on('job complete', function(id, result){
  console.log('Job completed with data ', result);

});*/


//prepare a job to perform
//dont save it
var job = Queue
    .createJob('unique_every', {
        to: 'any'
    })
    .attempts(3)
    .backoff({
        delay: 60000,
        type: 'fixed'
    })
    .priority('normal')
    .unique('unique_every');


//schedule a job then
Queue.every('2 seconds', job);
