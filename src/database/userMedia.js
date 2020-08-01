"use strict";

module.exports = {
  editForResend,
  getWithNotNullStatus,
  deleteManyByOracleUserId,
  setManyStatusesToNullByOracleUserId
};

function editForResend( client, createdFrom, createdTo, oracleUserId ){
  let conditions = [ "created_at between $1 and $2" ];
  const params = [ createdFrom, createdTo ];

  if( oracleUserId ){
    conditions.push( "oracle_user_id = $3" );
    params.push( oracleUserId );
  }

  conditions = conditions.join( " and " );

  return client.query(
    `update user_media
    set status = 'resend'
    where ${conditions}`,
    params
  );
}

async function getWithNotNullStatus( client ){
  const { rows } = await client.query(
    `select *
    from user_media
    where not status is null`
  );

  return rows;
}

function deleteManyByOracleUserId( client, oracleUserId, ids ){
  return client.query(
    `delete from user_media
    where
      oracle_user_id = $1 and
      id = any( $2 )`,
    [ oracleUserId, ids ]
  );
}

function setManyStatusesToNullByOracleUserId( client, oracleUserId, ids ){
  return client.query(
    `update user_media
    set status = null
    where
      oracle_user_id = $1 and
      id = any( $2 )`,
    [ oracleUserId, ids ]
  );
}
