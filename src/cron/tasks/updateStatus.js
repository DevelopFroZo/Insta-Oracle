"use strict";

// Libs
const fetch = require( "node-fetch" );

// Helpers
const sign = require( "../../helpers/sign" );

// Database
const { getPool } = require( "../../database/pool" );
const userMedia = require( "../../database/userMedia" );

module.exports = run;

/*
 * Функция отправляет данные в ODS
 */
async function send( body, oracleId, algorithm, secret, encoding ){
  body = JSON.stringify( body );

  const signature = sign( body, algorithm, secret, encoding );

  console.debug( `[TASK UPDATE STATUS] Signature for request: ${signature}` );

  try{
    const {
      ODS_URL,
      SEND_ACTIVITIES_URI
    } = process.env;

    console.log( "[TASK UPDATE STATUS] Send request for send activities" );

    // const response = await fetch( `${ODS_URL}${SEND_ACTIVITIES_URI.replace( "{ORACLE_ID}", oracleId )}`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Signature": signature
    //   },
    //   body
    // } );
    // #fix
    const response = { ok: true };

    if( !response.ok ){
      console.debug( response );

      return false;
    }
  } catch( e ) {
    console.error( e );

    return false;
  }
}

/*
 * Идея -- выделить все записи, у которых status
 * не NULL. Разделить эти данные на созданные/удалённые
 * по каждому пользователю (oracle_user_id)
 * и отправить в ODS
 */
async function run(){
  console.log( "[TASK UPDATE STATUS] Start" );

  const pool = getPool();
  let media;

  try{
    console.log( "[TASK UPDATE STATUS] Get media with not null status" );
    media = await userMedia.getWithNotNullStatus( pool );
  } catch( e ) {
    console.error( e );

    return false;
  }

  if( media.length === 0 ){
    console.log( "[TASK UPDATE STATUS] No media to send" );

    return true;
  }

  /*
   * Вспомогательная функция для добавления
   * записи на модификацию (БД) по пользователю
   * toModify -- ссылка на один из объектов:
   * * filtered.deleted.toModify
   * * filtered.other.toModify
   */
  const q = ( toModify, oracleUserId, oracleActivityId ) => {
    if( !( oracleUserId in toModify ) )
      toModify[ oracleUserId ] = [];

    toModify[ oracleUserId ].push( oracleActivityId );
  };

  const exclude = [ "id", "media_type", "status", "oracle_user_id" ];
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

  console.debug( `[TASK UPDATE STATUS] Count of deleted media: ${filtered.deleted.toSend.length}` );
  console.debug( `[TASK UPDATE STATUS] Count of other media: ${filtered.other.toSend.length}` );
  console.debug( `[TASK UPDATE STATUS] Total count of media: ${media.length}` );

  const {
    ORACLE_ID,
    HMAC_ALGORITHM,
    HMAC_SECRET,
    HMAC_SIGNATURE_ENCODING
  } = process.env;

  /*
   * В коде ниже, если происходит какая-либо
   * ошибка при отправке данных в ODS, то
   * процесс не останавливается. Сделано для
   * того, чтобы если даже часть данных не
   * отправится, отправилась другая часть
   * (попыталась отправиться)
   */
  if( filtered.deleted.toSend.length > 0 ){
    console.log( "[TASK UPDATE STATUS] Send deleted activities" );

    const result = await send( filtered.deleted.toSend, ORACLE_ID, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

    if( result !== false ){
      for( const oracleUserId in filtered.deleted.toModify ) try{
        console.log( "[TASK UPDTAE STATUS] Modify database" );
        await userMedia.deleteManyByOracleUserId( pool, oracleUserId, filtered.deleted.toModify[ oracleUserId ] );
      } catch( e ) {
        console.error( e );

        return false;
      }
    }
  }

  if( filtered.other.toSend.length > 0 ){
    console.log( "[TASK UPDATE STATUS] Send non deleted activities" );

    const result = await send( filtered.other.toSend, ORACLE_ID, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

    if( result !== false ){
      for( const oracleUserId in filtered.other.toModify ) try{
        console.log( "[TASK UPDTAE STATUS] Modify database" );
        await userMedia.setManyStatusesToNullByOracleUserId( pool, oracleUserId, filtered.other.toModify[ oracleUserId ] );
      } catch( e ) {
        console.error( e );

        return false;
      }
    }
  }
}
