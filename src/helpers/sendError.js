"use strict";

module.exports = sendError;

function sendError( res, code, message ){
  res.status( code ).json( { error: { code, message } } );
}
