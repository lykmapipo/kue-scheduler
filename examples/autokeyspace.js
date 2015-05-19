'use strict';

var kue = require('kue');
var redis = kue.redis;

kue.createQueue();

var client = redis.createClient();

client.config('GET', 'notify-keyspace-events', function(err, data) {
    //reference configurations
    var config = '';

    //grab existing keyspace notification configuration
    //from redis
    if (data) {
        config = data[1];
    }

    //enable 
    //Keyevent events, published with __keyevent@<db>__ prefix
    if (config.indexOf('E') === -1) {
        config += 'E';
    }

    //enable
    //Expired events (events generated every time a key expires)
    if (config.indexOf('x') === -1) {
        config += 'x';
    }

    console.log(config);
    //set configurations
    // client.config('SET', 'notify-keyspace-events', config);
});