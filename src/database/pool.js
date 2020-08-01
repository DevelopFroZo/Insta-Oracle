"use strict";

const { Pool } = require( "pg" );
const PgError = require( "./PgError" );

module.exports = { getPool, testPool };

let pool = null;

function getPool( config ){
  if( pool === null ){
    const { NODE_ENV } = process.env;

    if( !( NODE_ENV in config ) )
      throw "[POOL INIT] Fail to initialize database pool in \"{MODE}\" mode: {REASON}"
        .replace( "{MODE}", NODE_ENV )
        .replace( "{REASON}", "can't find configuration" );

    pool = new Pool( config[ NODE_ENV ] );
    pool.query_ = pool.query;
    pool.query = async ( sql, data ) => {
      try{
        const result = await pool.query_( sql, data );

        return result;
      } catch( e ) {
        throw new PgError( e );
      }
    };
  }

  return pool;
}

async function testPool(){
  if( pool === null ) throw "[POOL TEST] Not connected";

  const { NODE_ENV } = process.env;
  const errorMessage = "[POOL TEST] Error in \"{MODE}\" mode: {REASON}";
  let client;

  try{
    client = await pool.connect();
  } catch( e ) {
    throw errorMessage.replace( "{MODE}", NODE_ENV ).replace( "{REASON}", "can't connect to database" );
  }

  try{
    await client.query( "select now()" );
  } catch( e ) {
    throw errorMessage.replace( "{MODE}", NODE_ENV ).replace( "{REASON}", "can't query from database" );
  } finally {
    await client.end();
    client.release();
  }

  return "[POOL TEST] Successfully"
}
