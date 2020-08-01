"use strict";

// Libs
const { Router } = require( "express" );
const fetch = require( "node-fetch" );

// Helpers
const sendError = require( "../helpers/sendError" );
const {
  redirectToSignedFailureUrl,
  redirectToSignedSuccessUrl
} = require( "../helpers/redirectToSignedUrl" );
const {
  getShortAccessTokenUrl,
  getLongAccessTokenUrl,
  getMeUrl
} = require( "../helpers/urlFactory" );
const makeUrl = require( "../helpers/makeUrl" );
const sign = require( "../helpers/sign" );

// Cron
const { get: getCron } = require( "../cron/getCron" );

// Database
const { getPool } = require( "../database/pool" );
const Transaction = require( "../database/transaction" );
const cache = require( "../database/cache" );
const users = require( "../database/users" );
const PgError = require( "../database/PgError" );

const router = Router();

module.exports = router;

router.get( "/auth", async ( {
  query: { code, state }
}, res ) => {
  console.log( "[AUTH] Start" );
  console.debug( `[AUTH] Code: ${code}` );
  console.debug( `[AUTH] State: ${state}` );

  if(
    typeof code !== "string" || code === "" ||
    typeof state !== "string" || state === ""
  ) return sendError( res, 403, "Invalid code or state from instagram" );

  console.log( `[AUTH] Valid code && state` );

  code = code.replace( "#_", "" );

  let [ oracleId, terraUserId, signature ] = state.split( "_" );

  if(
    typeof oracleId !== "string" || oracleId === "" ||
    typeof terraUserId !== "string" || terraUserId === "" ||
    typeof signature !== "string" || signature === ""
  ) return sendError( res, 403, "Invalid state from instagram" );

  console.log( `[AUTH] Valid state` );

  const {
    DEFAULT_SUCCESS_URI,
    DEFAULT_FAILURE_URI,
    HMAC_ALGORITHM,
    HMAC_SECRET,
    HMAC_SIGNATURE_ENCODING,
    CRON_SCRAP_PERIOD_SUCCESS,
    CRON_SCRAP_PERIOD_ERROR
  } = process.env;

  const signature_ = sign( `${oracleId}_${terraUserId}`, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

  if( signature !== signature_ ) return sendError( res, 403, "Invalid signature of state" );

  console.log( "[AUTH] Valid signature" );

  const pool = getPool();
  let query2;
  let oracleUserId;

  try{
    console.log( "[AUTH] Get cache" );
    query2 = await cache.remove( pool, oracleId, terraUserId );

    if( query2 === null ) return sendError( res, 403, "Invalid state from instagram" );

    console.log( `[AUTH] Get short access token` );

    let result = await fetch( getShortAccessTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `client_id=${process.env.INST_APP_ID}` +
        `&client_secret=${process.env.INST_SECRET}` +
        `&code=${code}` +
        "&grant_type=authorization_code" +
        `&redirect_uri=${process.env.INST_REDIRECT_URI}`
    } );

    if( !result.ok ){
      console.debug( result );

      return redirectToSignedFailureUrl( res, query2, "502 Bad gateway" );
    }

    let jsn = await result.json();

    console.log( "[AUTH] Get long access token" );
    result = await fetch( getLongAccessTokenUrl( process.env.INST_SECRET, jsn.access_token ) );

    if( !result.ok ){
      console.debug( result );

      return redirectToSignedFailureUrl( res, query2, "502 Bad gateway" );
    }

    let { access_token, expires_in } = await result.json();
    let t = new Date();

    t = Math.floor( ( new Date( t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes() ) ).getTime() / 1000 );
    expires_in = t + Math.floor( expires_in / 60 / 60 / 24 ) * 24 * 60 * 60;
    console.log( "[AUTH] Get account info" );
    result = await fetch( getMeUrl( access_token ) );

    if( !result.ok ){
      console.debug( result );

      return redirectToSignedFailureUrl( res, query2, "502 Bad gateway" );
    }

    const { id: oracleUserId_, username } = await result.json();

    oracleUserId = oracleUserId_;
    console.log( "[AUTH] Get task id" );

    let taskId = await users.getTaskId( pool, { oracle_id: oracleId, terra_user_id: terraUserId } );

    const cron = getCron();
    const client = new Transaction( pool );

    if( taskId ){
      console.log( `[AUTH] Delete task (${taskId})` );
      await cron.delete( taskId, client );
    }

    console.log( "[AUTH] Add task" );

    taskId = await cron.add( "scrap", {
      settings: {
        success: { timeModifierSettings: [ "basic", CRON_SCRAP_PERIOD_SUCCESS ] },
        error: { timeModifierSettings: [ "basic", CRON_SCRAP_PERIOD_ERROR ] },
        onExpires: "update"
      },
      params: { oracleUserId }
    }, client );

    console.debug( `[AUTH] Id of created task: ${taskId}` );
    console.log( `[AUTH] Create user` );
    result = await users.create( client, oracleId, terraUserId, oracleUserId, username, access_token, expires_in, t, t, taskId );
    await client.end();
  } catch( e ) {
    console.error( e );

    if( e instanceof PgError ){
      if( query2 ) redirectToSignedFailureUrl( res, query2, "503 Service unavailable" );
      else sendError( res, 503, "Service unavailable" );
    } else {
      if( query2 ) redirectToSignedFailureUrl( res, query2, "500 Internal server error" );
      else sendError( res, 500, "Internal server error" );
    }

    return;
  }

  redirectToSignedSuccessUrl( res, query2, { oracle_user_id: oracleUserId } );
} );
