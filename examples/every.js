'use strict';

/**
 * @description example of scheduling jobs to run every after specified interval
 */

//dependencies
var path = require('path');

//require kue-scheduler here
var kue = require(path.join(__dirname, '..', 'index'));

Queue.process('every', function(job, finalize) {
    //increament run counts
    runCount++;

    /*jshint camelcase:false */
    expect(job.id).to.exist;
    expect(job.type).to.equal('every');
    expect(parseInt(job._max_attempts)).to.equal(3);
    expect(job.data.to).to.equal(data.to);
    expect(job.data.schedule).to.equal('RECCUR');

    expect(job._backoff).to.eql(backoff);
    expect(parseInt(job._priority)).to.equal(0);
    /*jshint camelcase:true */

    finalize();
});

//listen on success scheduling
Queue.on('schedule success', function(job) {
    if (job.type === 'every') {
        /*jshint camelcase:false */
        expect(job.id).to.exist;
        expect(job.type).to.equal('every');
        expect(parseInt(job._max_attempts)).to.equal(3);
        expect(job.data.to).to.equal(data.to);
        expect(job.data.schedule).to.equal('RECCUR');

        expect(job._backoff).to.eql(backoff);
        expect(parseInt(job._priority)).to.equal(0);
        /*jshint camelcase:true */
    }
});

var job = Queue
    .createJob('every', data)
    .attempts(3)
    .backoff(backoff)
    .priority('normal');

Queue.every('2 seconds', job);