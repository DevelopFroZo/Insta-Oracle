"use strict";

module.exports = index;

function index( taskTimestamp, currentTimestamp, delta ){
  return taskTimestamp + Math.max( Math.ceil( ( currentTimestamp - taskTimestamp ) / delta ), 1 ) * delta;
}
