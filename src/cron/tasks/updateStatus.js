"use strict";

const fetch = require( "node-fetch" );
const { getPool } = require( "../../database/pool" );
const Transaction = require( "../../database/transaction" );
const sign = require( "../../helpers/sign" );

module.exports = {
  run
};

async function send( body, oracleId, algorithm, secret, encoding ){
  body = JSON.stringify( body );

  const signature = sign( body, algorithm, secret, encoding );

  try{
    // const response = await fetch( `https://dev.oracle.iterra.world/api/v1/oracle/${oracleId}/activities`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Signature": signature
    //   },
    //   body
    // } );
    const response = { ok: true };

    if( !response.ok ){
      console.log( "[TASK UPDATE STATUS] FAIL TO SEND ACTIVITIES" );
      console.log( response );

      return false;
    }
  } catch( e ) {
    console.log( "[TASK UPDATE STATUS] FAIL TO SEND ACTIVITIES (FATAL)" );
    console.log( e );

    return false;
  }

  return true;
}

async function run(){
  console.log( "[TASK UPDATE STATUS] START" );

  const pool = getPool();
  const { rows: media } = await pool.query(
    `select *
    from user_media
    where not status is null`
  );

  if( media.length === 0 ){
    console.log( "[TASK UPDATE STATUS] NO MEDIA TO SEND" );

    return true;
  }

  const {
    ORACLE_ID: oracleId,
    HMAC_ALGORITHM: algorithm,
    HMAC_SECRET: secret,
    HMAC_SIGNATURE_ENCODING: encoding
  } = process.env;
  const exclude = [ "id", "media_type", "status", "oracle_user_id" ];

  const q = ( toModify, oracleUserId, oracleActivityId ) => {
    if( !( oracleUserId in toModify ) )
      toModify[ oracleUserId ] = [];

    toModify[ oracleUserId ].push( oracleActivityId );
  };

  const filtered = media.reduce( ( res, el ) => {
    const el_ = {
      oracle_activity_id: el.id,
      oracle_user_id: el.oracle_user_id,
      action: el.status
    };

    if( el.status === "deleted" ){
      res.deleted.toSend.push( el_ );
      q( res.deleted.toModify, el.oracle_user_id, el.id );
    }
    else{
      el_.type = `media/${el.media_type}`;

      for( let key in el ) if( !exclude.includes( key ) )
        el_[ key ] = el[ key ];

      res.other.toSend.push( el_ );
      q( res.other.toModify, el.oracle_user_id, el.id );
    }

    return res;
  }, {
    deleted: {
      toSend: [],
      toModify: {}
    },
    other: {
      toSend: [],
      toModify: {}
    }
  } );

  console.log( `[TASK UPDATED STATUS] COUNT OF DELETED MEDIA: ${filtered.deleted.toSend.length}` );
  console.log( `[TASK UPDATED STATUS] COUNT OF OTHER MEDIA: ${filtered.other.toSend.length}` );
  console.log( `[TASK UPDATE STATUS] TOTAL COUNT OF MEDIA: ${media.length}` );

  if( filtered.deleted.toSend.length > 0 ){
    console.log( "[TASK UPDATE STATUS] TRY TO SEND DELETED ACTIVITIES" );

    const result = await send( filtered.deleted.toSend, oracleId, algorithm, secret, encoding );

    if( !result ) return false;

    console.log( "[TASK UPDATE STATUS] SUCCESS" );

    for( const oracleUserId in filtered.deleted.toModify ) await pool.query(
      `delete from user_media
      where
        oracle_user_id = $1 and
        id = any( $2 )`,
      [ oracleUserId, filtered.deleted.toModify[ oracleUserId ] ]
    );

    console.log( "[TASK UPDATE STATUS] DATABASE MODIFIED SUCCESSFULLY" );
  }

  if( filtered.other.toSend.length > 0 ){
    console.log( "[TASK UPDATE STATUS] TRY TO SEND NON DELETED ACTIVITIES" );

    const result = await send( filtered.other.toSend, oracleId, algorithm, secret, encoding );

    if( !result ) return false;

    console.log( "[TASK UPDATE STATUS] SUCCESS" );

    for( const oracleUserId in filtered.other.toModify ) await pool.query(
      `update user_media
      set status = null
      where
        oracle_user_id = $1 and
        id = any( $2 )`,
      [ oracleUserId, filtered.other.toModify[ oracleUserId ] ]
    );

    console.log( "[TASK UPDATE STATUS] DATABASE MODIFIED SUCCESSFULLY" );
  }
}
