'use strict';

var kue = require('kue');
var q = kue.createQueue();

var job = q.create('email', {
    title: 'welcome email for tj',
    to: 'tj@learnboost.com',
    template: 'welcome-email'
});

console.log(job.toJSON());