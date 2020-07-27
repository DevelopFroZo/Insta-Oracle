"use strict";

const { Router } = require( "express" );
const fetch = require( "node-fetch" );
const {
  getShortAccessTokenUrl,
  getLongAccessTokenUrl,
  getMeUrl
} = require( "../helpers/urlFactory" );
const makeUrl = require( "../helpers/makeUrl" );
const sign = require( "../helpers/sign" );
const { get: getCron } = require( "../cron/getCron" );

const { getPool } = require( "../database/pool" );
const Transaction = require( "../database/transaction" );
const cache = require( "../database/cache" );
const users = require( "../database/users" );

const router = Router();

module.exports = router;

router.get( "/auth", async ( {
  query: { code, state }
}, res ) => {
  console.log( "[AUTH] START" );

  if(
    typeof code !== "string" || code === "" ||
    typeof state !== "string" || state === ""
  ) return res.end( "403 Invalid code or state from Instagram" );

  console.log( "[AUTH] CODE && STATE NOT EMPTY (OK)" );

  code = code.replace( "#_", "" );

  let [ oracleId, terraUserId, signature ] = state.split( "_" );

  if(
    typeof oracleId !== "string" || oracleId === "" ||
    typeof terraUserId !== "string" || terraUserId === "" ||
    typeof signature !== "string" || signature === ""
  ) return res.end( "403 Invalid state from Instagram" );

  console.log( "[AUTH] VALID STATE (OK)" );

  const {
    DEFAULT_SUCCESS_URI: defaultSuccessUri,
    HMAC_ALGORITHM: algorithm,
    HMAC_SECRET: secret,
    HMAC_SIGNATURE_ENCODING: encoding
  } = process.env;

  const signature_ = sign( `${oracleId}_${terraUserId}`, algorithm, secret, encoding );

  if( signature !== signature_ )
    return res.end( "403 Invalid signature of state" );

  console.log( "[AUTH] SIGNATURE IS OK" );

  const client = new Transaction( getPool() );
  const query2 = await cache.removeOne( client, oracleId, terraUserId );

  if( query2 === null ){
    await client.end( false );

    return res.end( "403 Invalid state from Instagram" );
  }

  console.log( "[AUTH] VALID CACHE (OK)" );

  let result;

  try{
    result = await fetch( getShortAccessTokenUrl(), {
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
  } catch( e ) {
    console.log( "[AUTH] FAIL TO FETCH (GET SHORT ACCESS TOKEN)" );
    console.log( e );

    await client.end();

    const redirectUrl = makeUrl( query2.failure_uri || defaultFailureUri, {
      ...query2,
      message: "500 Internal Server Error"
    }, {
      exclude: [ "success_uri", "failure_uri", "signature" ],
      isSort: true
    } );

    signature = sign( redirectUrl, algorithm, secret, encoding );

    return res.redirect( `${redirectUrl}&signature=${signature}` );
  }

  if( !result.ok ){
    console.log( "[AUTH] BAD RESPONSE FROM INSTAGRAM (GET SHORT ACCESS TOKEN)" );
    console.log( result );

    await client.end();

    const redirectUrl = makeUrl( query2.failure_uri || defaultFailureUri, {
      ...query2,
      message: "502 Bad Gateway"
    }, {
      exclude: [ "success_uri", "failure_uri", "signature" ],
      isSort: true
    } );

    signature = sign( redirectUrl, algorithm, secret, encoding );

    return res.redirect( `${redirectUrl}&signature=${signature}` );
  }

  console.log( "[AUTH] SUCCESS GET SHORT ACCESS TOKEN" );

  let jsn = await result.json();
  const { user_id } = jsn;

  try{
    result = await fetch( getLongAccessTokenUrl( process.env.INST_SECRET, jsn.access_token ) );
  } catch( e ) {
    console.log( "[AUTH] FAIL TO FETCH (GET LONG ACCESS TOKEN)" );
    console.log( e );

    await client.end();

    const redirectUrl = makeUrl( query2.failure_uri || defaultFailureUri, {
      ...query2,
      message: "500 Internal Server Error"
    }, {
      exclude: [ "success_uri", "failure_uri", "signature" ],
      isSort: true
    } );

    signature = sign( redirectUrl, algorithm, secret, encoding );

    return res.redirect( `${redirectUrl}&signature=${signature}` );
  }

  if( !result.ok ){
    console.log( "[AUTH] BAD RESPONSE FROM INSTAGRAM (GET LONG ACCESS TOKEN)" );
    console.log( result );

    await client.end();

    const redirectUrl = makeUrl( query2.failure_uri || defaultFailureUri, {
      ...query2,
      message: "502 Bad Gateway"
    }, {
      exclude: [ "success_uri", "failure_uri", "signature" ],
      isSort: true
    } );

    signature = sign( redirectUrl, algorithm, secret, encoding );

    return res.redirect( `${redirectUrl}&signature=${signature}` );
  }

  console.log( "[AUTH] SUCCESS GET LONG ACCESS TOKEN" );

  let { access_token, expires_in } = await result.json();
  let t = new Date();

  t = Math.floor( ( new Date( t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes() ) ).getTime() / 1000 );
  expires_in = t + Math.floor( expires_in / 60 / 60 / 24 ) * 24 * 60 * 60;
  result = await fetch( getMeUrl( access_token ) );

  const { username } = await result.json();
  const taskId = await users.removeOneByOracleIdTerraUserIdOrOracleUserId( client, oracleId, terraUserId, user_id );
  const cron = getCron();

  const id = await cron.add( "scrap", {
    settings: {
      // #fix set to 24h
      success: { timeModifierSettings: [ "basic", 5 * 60/*24 * 60 * 60*/ ] },
      error: { timeModifierSettings: [ "basic", 5 * 60/*24 * 60 * 60*/ ] },
      onExpires: "update"
    },
    params: { oracleUserId: user_id }
  } );

  console.log( `[AUTH] SCRAP TASK (${id}) ADDED FOR "${user_id}" USER` );

  await users.createOne( client, oracleId, terraUserId, user_id, username, access_token, expires_in, t, t, id );
  await client.end();

  console.log( "[AUTH] ADDED TO USERS" );
  console.log( `[AUTH] TASK ID TO DELETE ${taskId}` );

  if( taskId ) await cron.delete( taskId );

  const redirectUrl = makeUrl( query2.success_uri || defaultSuccessUri, {
    ...query2,
    oracle_user_id: user_id
  }, {
    exclude: [ "success_uri", "failure_uri", "signature" ],
    isSort: true
  } );

  signature = sign( redirectUrl, algorithm, secret, encoding );

  return res.redirect( `${redirectUrl}&signature=${signature}` );
} );
