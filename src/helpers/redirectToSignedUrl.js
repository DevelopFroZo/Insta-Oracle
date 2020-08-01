"use strict";

const makeUrl = require( "./makeUrl" );
const sign = require( "./sign" );

module.exports = {
  redirectToSignedFailureUrl,
  redirectToSignedSuccessUrl
};

function redirectToSignedFailureUrl( res, query, message ){
  const {
    DEFAULT_FAILURE_URI,
    HMAC_ALGORITHM,
    HMAC_SECRET,
    HMAC_SIGNATURE_ENCODING
  } = process.env;
  const url = makeUrl( query.failure_uri || DEFAULT_FAILURE_URI, {
    ...query,
    message
  }, {
    exclude: [ "success_uri", "failure_uri", "signature" ],
    isSort: true
  } );

  const signature = sign( url, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

  res.redirect( `${url}&signature=${signature}` );
}

function redirectToSignedSuccessUrl( res, query, data ){
  const {
    DEFAULT_SUCCESS_URI,
    HMAC_ALGORITHM,
    HMAC_SECRET,
    HMAC_SIGNATURE_ENCODING
  } = process.env;

  const url = makeUrl( query.success_uri || DEFAULT_SUCCESS_URI, {
    ...query,
    ...data
  }, {
    exclude: [ "success_uri", "failure_uri", "signature" ],
    isSort: true
  } );

  const signature = sign( url, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

  res.redirect( `${url}&signature=${signature}` );
}
