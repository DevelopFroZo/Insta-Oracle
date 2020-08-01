"use strict";

// Database
const { getPool } = require( "../../database/pool" );
const cache = require( "../../database/cache" );

module.exports = run;

async function run(){
  try{
    console.log( "[TASK CLEAR CACHE] Clear cache" );
    await cache.clearExpires( getPool(), Math.floor( Date.now() / 1000 ) );
  } catch( e ) {
    console.error( e );

    return false;
  }
}
