"use strict";

const bind = require( "./bind" );
const inst = require( "./inst" );
const activityResend = require( "./activityResend" );

module.exports = server => {
  server.use( process.env.BIND_URI, bind );
  server.use( "/inst", inst );
  server.post( process.env.ACTIVITY_RESEND, activityResend );
};
