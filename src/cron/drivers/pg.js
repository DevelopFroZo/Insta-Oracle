"use strict";

module.exports = index;

async function grab( pool, table, timestamp, isFirst = false ){
  const client = await pool.connect();

  await client.query( "begin" );

  let { rows: tasks } = await client.query(
    `update ${table}
    set status = 'process'
    where
      timestamp <= $1
      ${!isFirst ? "and status = 'await'" : ""}
    returning id, type, timestamp, settings, params, success_runs, error_runs`,
    [ timestamp ]
  );

  let { rows: [ { timestamp: timestamp_ } ] } = await client.query(
    `select min( timestamp ) as timestamp
    from ${table}
    where
    	timestamp > $1 and
    	status = 'await'`,
    [ timestamp ]
  );

  await client.query( "commit" );
  await client.end();
  client.release();

  tasks = tasks.map( task => {
    task.timestamp = parseInt( task.timestamp );

    return task;
  } );

  timestamp_ = timestamp_ ? parseInt( timestamp_ ) : null;

  return [ tasks, timestamp_ ];
}

function del( pool, table, ids ){
  return pool.query(
    `delete from ${table}
    where id = any( $1 )`,
    [ ids ]
  );
}

function update( pool, table, id, timestamp, runFields ){
  const sets = [ "timestamp = $1", "status = 'await'" ];
  const params = [ timestamp, id ];
  let i = 3;

  for( let [ field, value ] of runFields ){
    sets.push( `${field} = $${i++}` );
    params.push( value );
  }

  return pool.query(
    `update ${table}
    set ${sets}
    where id = $2`,
    params
  );
}

async function add( pool, table, type, timestamp, settings, params ){
  const { rows: [ { id } ] } = await pool.query(
    `insert into ${table}( type, timestamp, settings, params )
    values( $1, $2, $3, $4 )
    returning id`,
    [ type, timestamp, settings, params ]
  );

  return id;
}

function index( pool, table ){
  if( typeof table !== "string" || table === "" )
    table = "tasks";

  return {
    grab: timestamp => grab( pool, table, timestamp ),
    grabFirst: timestamp => grab( pool, table, timestamp, true ),
    delete: ids => del( pool, table, ids ),
    update: ( id, timestamp, runFields ) => update( pool, table, id, timestamp, runFields ),
    add: ( type, timestamp, settings, params ) => add( pool, table, type, timestamp, settings, params )
  };
}
