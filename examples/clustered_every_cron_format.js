'use strict';

const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  // Fork workers.

  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  var path = require('path');
  //require('kue-scheduler') here
  var kue = require(path.join(__dirname, '..', 'index'));
  var Queue = kue.createQueue();

  //prepare a job to perform
  //dont save it
  //without Unique, we need to limit the every creation to a single worker, using master for that

  var job = Queue
    .createJob('every', {
        to: 'any'
    })
    .attempts(3)
    .backoff({
        delay: 60000,
        type: 'fixed'
    })
    .priority('normal');


  //schedule a job then
  Queue.every('*/3 * * * * *', job);


  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });

} else {


    /**
    * @description example of scheduling jobs to run every after specified interval
    */

    //dependencies
    var path = require('path');

    //require('kue-scheduler') here
    var kue = require(path.join(__dirname, '..', 'index'));
    var Queue = kue.createQueue();


    //processing jobs
    Queue.process('every', function(job, done) {
      console.log('\nChild Worker %s is Processing job with id %s at %s', cluster.worker.id, job.id, new Date());
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


}
