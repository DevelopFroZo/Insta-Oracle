"use strict";

const { checkJSON } = require( "../helpers/checkers" );
const { getPool } = require( "../database/pool" );
const users = require( "../database/users" );
const userMedia = require( "../database/userMedia" );

module.exports = index;

async function index( {
  headers: { signature },
  body
}, res ){
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

  let {
    created_from,
    created_to,
    oracle_user_id
  } = body;

  if( !Number.isInteger( created_to ) )
    created_to = Math.floor( Date.now() / 1000 );

  if(
    !Number.isInteger( created_from ) || created_from < 0 ||
    !Number.isInteger( created_to ) || created_to < 0 ||
    created_from > created_to
  ) return res.status( 422 ).json( { error: {
    code: 422,
    message: "Invalid input params."
  } } );

  const pool = getPool();

  if(
    oracle_user_id !== undefined && (
    typeof oracle_user_id !== "string" ||
    oracle_user_id === "" ||
    !( await users.checkByOracleUserId( pool, oracle_user_id ) ) )
  ) return res.status( 422 ).json( { error: {
    code: 422,
    message: "Invalid input params."
  } } );

  const media = await userMedia.editForResend( pool, created_from, created_to, oracle_user_id );

  res.sendStatus( 202 );
}
