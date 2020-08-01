"use strict";

// Libs
const { Router } = require( "express" );

// Helpers
const { checkUrl, checkJSON } = require( "../helpers/checkers" );
const { redirectToSignedFailureUrl } = require( "../helpers/redirectToSignedUrl" );
const makeUrl = require( "../helpers/makeUrl" );
const sign = require( "../helpers/sign" );
const sendError = require( "../helpers/sendError" );

// Cron
const { get: getCron } = require( "../cron/getCron" );

// Database
const { getPool } = require( "../database/pool" );
const Transaction = require( "../database/transaction" );
const cache = require( "../database/cache" );
const users = require( "../database/users" );

const router = Router();

module.exports = router;

router.get( "/", async ( { query }, res ) => {
  console.log( "[BIND] Start" );

  const {
    SELF_URL,
    BIND_URI,
    HMAC_ALGORITHM,
    HMAC_SECRET,
    HMAC_SIGNATURE_ENCODING,
    CACHE_LIFETIME,
    INST_AUTHORIZE_URL,
    INST_APP_ID,
    INST_REDIRECT_URI
  } = process.env;

  const { oracle_id, terra_user_id } = query;
  const check = checkUrl( `${SELF_URL}${BIND_URI}`, query, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

  if( !check ){
    console.debug( `[BIND] Invalid signature (${query.signature})` );

    return redirectToSignedFailureUrl( res, query, "403 invalid signature" );
  }

  console.log( "[BIND] Valid signature" );

  try{
    await cache.create( getPool(), oracle_id, terra_user_id, query, Math.floor( Date.now() / 1000 ) + CACHE_LIFETIME );

    console.log( `[BIND] Cache created` );
  } catch( e ) {
    console.error( e );

    return redirectToSignedFailureUrl( res, query, "503 service unavailable" );
  }

  const state = `${oracle_id}_${terra_user_id}`;
  const signature = sign( state, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

  const redirectUrl = makeUrl( INST_AUTHORIZE_URL, {
    client_id: INST_APP_ID,
    redirect_uri: INST_REDIRECT_URI,
    scope: "user_profile,user_media",
    response_type: "code",
    state: `${state}_${signature}`
  } );

  res.redirect( redirectUrl );
} );

router.delete( "/", async ( {
  headers: { signature },
  body: { oracle_user_id }
}, res ) => {
  console.log( "[UNBIND] Start" );

  const {
    HMAC_ALGORITHM,
    HMAC_SECRET,
    HMAC_SIGNATURE_ENCODING
  } = process.env;

  const check = !checkJSON( { oracle_user_id }, signature, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

  if( !check ){
    console.debug( `[UNBIND] Invalid signature (${signature})` );

    return sendError( res, 403, "Invalid signature" );
  }

  console.log( "[UNBIND] Valid signature" );

  if( typeof oracle_user_id !== "string" || oracle_user_id === "" ){
    console.debug( `[UNBIND] Oracle user id: ${oracle_user_id}` );

    return sendError( res, 422, "Invalid input params" );
  }

  try{
    console.log( "[UNBIND] Get task id" );

    const taskId = await users.getTaskId( getPool(), { oracle_user_id } );

    console.debug( `[UNBIND] Task id: ${taskId}` );

    if( taskId === null ) return sendError( res, 422, "Invalid input params" );

    console.log( "[UNBIND] Delete cron task" );
    await getCron().delete( taskId );
  } catch( e ) {
    console.error( e );

    return sendError( res, 503, "Service unavailable" );
  }

  res.sendStatus( 204 );
} );
