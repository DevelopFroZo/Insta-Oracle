"use strict";

const { getPool } = require( "../../database/pool" );

module.exports = {
  run
};

async function run(){
  await getPool().query(
    `delete from cache
    where expires_at <= $1`,
    [ Math.floor( Date.now() / 1000 ) ]
  );
}
