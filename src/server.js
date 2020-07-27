"use strict";

// Requires
const express = require( "express" );
const { getPool, testPool } = require( "./database/pool" );
const { init: initCron } = require( "./cron/getCron" );
const helmet = require( "helmet" );
const bodyParser = require( "body-parser" );
const addRoutes = require( "./routes" );
const pgDriver = require( "./cron/drivers/pg" );

// Configs
require( "./configs/env" );
const databaseConfig = require( "./configs/database" );

// Very critical error
function exit( error ){
  console.log( error );

  process.exit( -1 );
}

// Init & test database pool
try{
  getPool( databaseConfig );
} catch( e ) {
  exit( e );
}

testPool().catch( exit );

// Consts
const PORT = process.env.PORT || process.env.DEFAULT_PORT;
const server = express();

server.use(
  helmet(),
  bodyParser.json(),
  bodyParser.urlencoded( {
    extended: true
  } ),
);

// Add routes
addRoutes( server );
initCron( pgDriver( getPool() ) );

// Listen
server.listen( PORT, err => {
  if( err )
    return console.log( err );

  console.log( `Server listen on port ${PORT}` );
} );
