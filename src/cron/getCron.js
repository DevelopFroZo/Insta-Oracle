"use strict";

const { getPool } = require( "../database/pool" );
const Cron = require( "./index" );
let cron;

module.exports = { init, get };

async function init( driver ){
  if( !cron ){
    const {
      CRON_UPDATE_DELAY,
      CRON_UPDATE_LIMIT,
      CRON_CLEAR_CACHE_PERIOD,
      CRON_UPDATE_STATUS_PERIOD
    } = process.env;
    /*const c = await getPool().connect();

    await c.query( "begin" );
    await c.query( "delete from cache" );
    await c.query( "delete from tasks" );
    await c.query( "alter sequence tasks_id_seq restart" );
    await c.query( "delete from user_media" );
    await c.query( "delete from users" );
    await c.query( "commit" );
    await c.end();
    c.release();*/
    cron = new Cron( driver, {
      updateDelay: parseInt( CRON_UPDATE_DELAY ),
      updateLimit: parseInt( CRON_UPDATE_LIMIT )
    } );
    await cron.start();
    /*await cron.add( "clearCache", { settings: {
      success: { timeModifierSettings: [ "basic", CRON_CLEAR_CACHE_PERIOD ] },
      error: { timeModifierSettings: [ "basic", CRON_CLEAR_CACHE_PERIOD ] },
      onExpires: "update"
    } } );
    await cron.add( "updateStatus", { settings: {
      success: { timeModifierSettings: [ "basic", CRON_UPDATE_STATUS_PERIOD ] },
      error: { timeModifierSettings: [ "basic", CRON_UPDATE_STATUS_PERIOD ] },
      onExpires: "update"
    } } );*/
  }
}

function get(){
  return cron;
}
