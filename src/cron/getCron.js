"use strict";

const { getPool } = require( "../database/pool" );
const Cron = require( "./index" );
let cron;

module.exports = { init, get };

async function init( driver ){
  if( !cron ){
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
    cron = new Cron( driver );
    /*await cron.add( "clearCache", { settings: {
      success: { timeModifierSettings: [ "basic", 24 * 60 * 60 ] },
      error: { timeModifierSettings: [ "basic", 24 * 60 * 60 ] },
      onExpires: "update"
    } } );
    await cron.add( "updateStatus", { settings: {
      // #fix вернуть время на 1 час
      success: { timeModifierSettings: [ "basic", 5 * 60 ] },
      error: { timeModifierSettings: [ "basic", 5 * 60 ] },
      onExpires: "update"
    } } );*/
    cron.start();
  }
}

function get(){
  return cron;
}
