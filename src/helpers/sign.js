"use strict";

const { createHmac } = require( "crypto" );

module.exports = ( data, algorithm, secret, encoding ) => {
  return createHmac( algorithm, secret ).update( data ).digest( encoding );
};
