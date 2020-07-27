"use strict";

const { Router } = require( "express" );
const { checkUrl, checkJSON } = require( "../helpers/checkers" );
const makeUrl = require( "../helpers/makeUrl" );
const sign = require( "../helpers/sign" );
const { getAuthUrl } = require( "../helpers/urlFactory" );
const { get: getCron } = require( "../cron/getCron" );

const { getPool } = require( "../database/pool" );
const cache = require( "../database/cache" );
const users = require( "../database/users" );

const router = Router();

module.exports = router;

router.get( "/", async ( { query }, res ) => {
  console.log( "[BIND] START BINDING" );
  const {
    SELF_URL: url,
    BIND_URI: bindUri,
    DEFAULT_FAILURE_URI: defaultFailureUri,
    HMAC_ALGORITHM: algorithm,
    HMAC_SECRET: secret,
    HMAC_SIGNATURE_ENCODING: encoding,
    INST_AUTHORIZE_URL,
    INST_APP_ID,
    INST_REDIRECT_URI
  } = process.env;

  const { success_uri, failure_uri, oracle_id, terra_user_id } = query;
  const url_ = `${url}${bindUri}`;
  const check = checkUrl( url_, query, algorithm, secret, encoding );

  if( !check ){
    const message = "403 Invalid signature";

    const redirectUrl = makeUrl( failure_uri || defaultFailureUri, {
      ...query,
      message
    }, {
      exclude: [ "success_uri", "failure_uri", "signature" ],
      isSort: true
    } );

    const signature = sign( redirectUrl, algorithm, secret, encoding );

    return res.redirect( `${redirectUrl}&signature=${signature}` );
  }

  console.log( "[BIND] SIGN OK" );
  await cache.create( getPool(), oracle_id, terra_user_id, query, Math.floor( Date.now() / 1000 ) + 600 );

  const state = `${oracle_id}_${terra_user_id}`;
  const signature = sign( state, algorithm, secret, encoding );

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
  body
}, res ) => {
  const {
    HMAC_ALGORITHM: algorithm,
    HMAC_SECRET: secret,
    HMAC_SIGNATURE_ENCODING: encoding
  } = process.env;

  if( !checkJSON( body, signature, algorithm, secret, encoding ) )
    return res.status( 403 ).json( { error: {
      code: 403,
      message: "Invalid signature."
    } } );

  const { oracle_user_id } = body;
  const pool = getPool();

  if( typeof oracle_user_id !== "string" || oracle_user_id === "" )
    return res.status( 422 ).json( { error: {
      code: 422,
      message: "Invalid input params."
    } } );

  const taskId = await users.removeOneByOracleUserId( pool, oracle_user_id );

  console.log( `[UNBIND] task ID: ${taskId}` );

  if( !taskId )
    return res.status( 422 ).json( { error: {
      code: 422,
      message: "Invalid input params."
    } } );

  await getCron().delete( taskId );
  console.log( "[UNBIND] CRON TASK DELETED" );

  res.sendStatus( 204 );
} );
