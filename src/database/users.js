"use strict";

module.exports = {
  getTaskId,
  create,
  check,
  get,
  edit
};

async function getTaskId( client, fields ){
  const conditions = Object
    .keys( fields )
    .map( ( key, i ) => `${key} = $${i + 1}` )
    .join( " and " );

  const params = Object.values( fields );

  const { rows: [ row ] } = await client.query(
    `select task_id
    from users
    where ${conditions}`,
    params
  );

  if( row === undefined )
    return null;

  return row.task_id;
}

function create( client, oracleId, terraUserId, oracleUserId, userName, accessToken, expiresAt, createdAt, updatedAt, taskId ){
  return client.query(
    `insert into users( oracle_id, terra_user_id, oracle_user_id, username, access_token, expires_at, created_at, updated_at, task_id )
    values( $1, $2, $3, $4, $5, $6, $7, $8, $9 )`,
    [ oracleId, terraUserId, oracleUserId, userName, accessToken, expiresAt, createdAt, updatedAt, taskId ]
  );
}

async function check( client, oracleUserId ){
  const { rowCount } = await client.query(
    `select 1
    from users
    where oracle_user_id = $1`,
    [ oracleUserId ]
  );

  return rowCount === 1;
}

async function get( client, oracleUserId ){
  const { rows: [ row ] } = await client.query(
    `select *
    from users
    where oracle_user_id = $1`,
    [ oracleUserId ]
  );

  if( row === undefined )
    return null;

  return row;
}

function edit( client, oracleUserId, fields ){
  const sets = [];
  const params = [ oracleUserId ];
  let i = 2;

  for( let key in fields ){
    sets.push( `${key} = $${i++}` );
    params.push( fields[ key ] );
  }

  return client.query(
    `update users
    set ${sets}
    where oracle_user_id = $1`,
    params
  );
}
