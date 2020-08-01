"use strict";

// Helpers
const { checkJSON } = require( "../helpers/checkers" );
const sendError = require( "../helpers/sendError" );

// Databse
const { getPool } = require( "../database/pool" );
const users = require( "../database/users" );
const userMedia = require( "../database/userMedia" );

module.exports = index;

async function index( {
  headers: { signature },
  body
}, res ){
  console.log( "[ACTIVITY RESEND] Start" );

  const {
    HMAC_ALGORITHM: algorithm,
    HMAC_SECRET: secret,
    HMAC_SIGNATURE_ENCODING: encoding
  } = process.env;

  if( !checkJSON( body, signature, algorithm, secret, encoding ) ){
    console.debug( `[ACTIVITY RESEND] Invalid signature: ${signature}` );

    return sendError( res, 403, "Invalid signature" );
  }

  console.log( "[ACTIVITY RESEND] Valid signature" );

  let {
    created_from,
    created_to,
    oracle_user_id
  } = body;

  if( !Number.isInteger( created_to ) )
    created_to = Math.floor( Date.now() / 1000 );

  console.group( `[ACTIVITY RESEND] Request body:` );
  console.debug( created_from );
  console.debug( created_to );
  console.debug( oracle_user_id );
  console.groupEnd();

  if(
    !Number.isInteger( created_from ) || created_from < 0 ||
    !Number.isInteger( created_to ) || created_to < 0 ||
    created_from > created_to
  ) return sendError( res, 422, "Invalid input params" );

  console.log( "[ACTIVITY RESEND] Valid created_from && created_to" );

  try{
    const pool = getPool();

    if(
      oracle_user_id !== undefined && (
      typeof oracle_user_id !== "string" ||
      oracle_user_id === "" ||
      !( await users.check( pool, oracle_user_id ) ) )
    ){
      console.debug( `[ACTIVITY RESEND] Invalid oracle user id: ${oracle_user_id}` );

      return sendError( res, 422, "Invalid input params" );
    }

    console.log( "[ACTIVITY RESEND] Edit media for resend" );
    await userMedia.editForResend( pool, created_from, created_to, oracle_user_id );
  } catch( e ) {
    console.error( e );

    return sendError( res, 503, "Service unavailable" );
  }

  res.sendStatus( 202 );
}
