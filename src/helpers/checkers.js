"use strict";

const { toInt } = require( "./converters" );
const makeUrl = require( "./makeUrl" );
const sign = require( "./sign" );

module.exports = {
  checkUrl,
  checkJSON
};

function checkUrl( url, query, algorithm, secret, encoding ){
  const expires = toInt( query.expires ) * 1000;

  if( expires === null || Date.now() >= expires )
    return false;

  const { signature } = query;

  if( typeof signature !== "string" || signature === "" )
    return false;

  const data = makeUrl( url, query, {
    exclude: [ "signature" ],
    isSort: true
  } );

  const signature_ = sign( data, algorithm, secret, encoding );

  return signature === signature_;
}

function checkJSON( data, signature, algorithm, secret, encoding ){
  return typeof signature === "string" &&
    signature !== "" &&
    signature === sign( JSON.stringify( data ), algorithm, secret, encoding );
}
