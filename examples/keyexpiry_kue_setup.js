'use strict';

var kue = require('kue');
var redis = kue.redis;

kue.createQueue();

var pub = redis.createClient();

var sub = redis.createClient();

sub.on('message', function (channel, message) {
  console.log('channel:%s, key:%s on %s', channel, message, new Date());
  pub.set('q:abcd', '', 'PX', 2000, function () {});
});
sub.subscribe('__keyevent@0__:expired');

pub.set('q:abcd', '', 'PX', 2000, function () {});