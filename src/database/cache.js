"use strict";

module.exports = {
  create,
  removeOne
};

async function create( client, oracleId, terraUserId, data, expiresAt ){
  try{
    await client.query(
      `insert into cache( oracle_id, terra_user_id, data, expires_at )
      values( $1, $2, $3, $4 )
      on conflict ( oracle_id, terra_user_id ) do update
      set
        data = excluded.data,
        expires_at = excluded.expires_at`,
      [ oracleId, terraUserId, data, expiresAt ]
    );

    return true;
  } catch( e ) {
    if( e.code === "23505" )
      return false;

    throw e;
  }
}

async function removeOne( client, oracleId, terraUserId ){
  const { rows: [ row ] } = await client.query(
    `delete from cache
    where
      oracle_id = $1 and
      terra_user_id = $2
    returning data`,
    [ oracleId, terraUserId ]
  );

  if( row === undefined )
    return null;

  return row.data;
}
