"use strict";

module.exports = {
  editForResend
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
