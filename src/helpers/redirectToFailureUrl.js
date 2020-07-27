"use strict";

const sign = require( "./sign" );

module.exports = redirectToFailureUrl;

// #fix USE!!!
function redirectToFailureUrl( res, query, defaultFailureUri, message, algorithm, secret, encoding ){
  const { failure_uri } = query;

  const redirectUrl = makeUrl( failure_uri, {
    ...query,
    message
  }, {
    exclude: [ "success_uri", "failure_uri", "signature" ],
    isSort: true
  } );

  const signature = sign( redirectUrl, algorithm, secret, encoding );

  res.redirect( `${redirectUrl}&signature=${signature}` );
}
