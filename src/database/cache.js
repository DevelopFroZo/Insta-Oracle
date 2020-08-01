"use strict";

module.exports = {
  create,
  remove,
  clearExpires
};

function create( client, oracleId, terraUserId, data, expiresAt ){
  return client.query(
    `insert into cache( oracle_id, terra_user_id, data, expires_at )
    values( $1, $2, $3, $4 )
    on conflict ( oracle_id, terra_user_id ) do update
    set
      data = excluded.data,
      expires_at = excluded.expires_at`,
    [ oracleId, terraUserId, data, expiresAt ]
  );
}

async function remove( client, oracleId, terraUserId ){
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

function clearExpires( client, timestamp ){
  return client.query(
    `delete from cache
    where expires_at <= $1`,
    [ timestamp ]
  );
}
