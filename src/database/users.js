"use strict";

module.exports = {
  createOne,
  getByPrimaryKey,
  getByOracleUserId,
  editByOracleUserId,
  removeOne,
  removeOneByOracleUserId,
  removeOneByOracleIdTerraUserIdOrOracleUserId,
  checkByOracleUserId
};

async function createOne( client, oracleId, terraUserId, oracleUserId, userName, accessToken, expiresAt, createdAt, updatedAt, taskId ){
  let rowCount;

  try{
    const result = await client.query(
      `insert into users( oracle_id, terra_user_id, oracle_user_id, username, access_token, expires_at, created_at, updated_at, task_id )
      values( $1, $2, $3, $4, $5, $6, $7, $8, $9 )`,
      [ oracleId, terraUserId, oracleUserId, userName, accessToken, expiresAt, createdAt, updatedAt, taskId ]
    );

    rowCount = result.rowCount;
  } catch( e ) {
    if( e.code === "23505" )
      return `User with oracleId (${oracleId}) and terraUserId (${terraUserId}) already binded`;

    throw e;
  }

  return rowCount === 1;
}

async function getByPrimaryKey( client, oracleId, terraUserId ){
  const { rows: [ row ] } = await client.query(
    `select *
    from users
    where
      oracle_id = $1 and
      terra_user_id = $2`,
    [ oracleId, terraUserId ]
  );

  if( row === undefined )
    return null;

  return row;
}

async function getByOracleUserId( client, oracleUserId ){
  const { rows: [ row ] } = await client.query(
    `select *
    from users
    where oracle_user_id = $1`,
    [ oracleUserId ]
  );

  return row !== undefined ? row : null;
}

async function editByOracleUserId( client, oracleUserId, fields ){
  const sets = [];
  const params = [ oracleUserId ];
  let i = 2;

  for( let key in fields ){
    sets.push( `${key} = $${i++}` );
    params.push( fields[ key ] );
  }

  const { rowCount } = await client.query(
    `update users
    set ${sets}
    where oracle_user_id = $1`,
    params
  );

  return rowCount === 1;
}

async function removeOne( client, oracleId, terraUserId ){
  const { rows: [ row ] } = await client.query(
    `delete from users
    where
      oracle_id = $1 and
      terra_user_id = $2
    returning task_id`,
    [ oracleId, terraUserId ]
  );

  if( row === undefined )
    return null;

  return row.task_id;
}

async function removeOneByOracleUserId( client, oracleUserId ){
  const { rows: [ row ] } = await client.query(
    `delete from users
    where oracle_user_id = $1
    returning task_id`,
    [ oracleUserId ]
  );

  if( row === undefined )
    return null;

  return row.task_id;
}

async function removeOneByOracleIdTerraUserIdOrOracleUserId( client, oracleId, terraUserId, oracleUserId ){
  const { rows: [ row ] } = await client.query(
    `delete from users
    where
      ( oracle_id = $1 and
      terra_user_id = $2 ) or
      oracle_user_id = $3
    returning task_id`,
    [ oracleId, terraUserId, oracleUserId ]
  );

  if( row === undefined )
    return null;

  return row.task_id;
}

async function checkByOracleUserId( client, oracleUserId ){
  const { rowCount } = await client.query(
    `select *
    from users
    where oracle_user_id = $1`,
    [ oracleUserId ]
  );

  return rowCount === 1;
}
