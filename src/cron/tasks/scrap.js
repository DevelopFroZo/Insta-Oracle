"use strict";

const fetch = require( "node-fetch" );
const { getPool } = require( "../../database/pool" );
const Transaction = require( "../../database/transaction" );
const users = require( "../../database/users" );
const { getManyMediaUrl, getOneMediaUrl } = require( "../../helpers/urlFactory" );
const sign = require( "../../helpers/sign" );

module.exports = {
  run
};

async function getAllMedia( accessToken ){
  let next = getManyMediaUrl( accessToken );
  const media = [];

  while( next !== undefined ) try{
    const response = await fetch( next );
    const { error, data: media_, paging } = await response.json();

    if( error ) return { error: {
      ...error,
      custom: false
    } };

    if( typeof paging === "object" && "next" in paging ) next = paging.next;
    else next = undefined;

    if( Array.isArray( media_ ) ) for( const el of media_ ){
      const { id, children } = el;

      media.push( el );

      if( children ) for( const { id: childrenId } of children.data ){
        const response = await fetch( getOneMediaUrl( childrenId, accessToken, "id,media_type,media_url,permalink,thumbnail_url,timestamp,username" ) );
        const result = await response.json();

        media.push( {
          ...result,
          parent_id: id
        } );
      }
    }
  } catch( e ) {
    console.log( "[TASK SCRAP] INVALID REQUEST TO INSTAGRAM" );
    console.log( e );

    return { error: { custom: true } };
  }

  return { media };
}

async function filter( client, oracleUserId, media, updatedAt ){
  const mediaIds = media.map( ( { id } ) => id );
  let { rows: mediaIds_ } = await client.query(
    `select caption, id
    from user_media
    where
      oracle_user_id = $1 and
      ( status != 'deleted' or status is null )`,
    [ oracleUserId ]
  );

  mediaIds_ = mediaIds_.map( ( { id } ) => id );

  // const q = media
  //   .map( ( { caption, timestamp } ) => [
  //     caption,
  //     ( new Date( timestamp ) ).toString(),
  //     Math.floor( ( new Date( timestamp ) ).getTime() / 1000 )
  //   ] )
  //   .sort( ( { timestamp: at }, { timestamp: bt } ) => {
  //     if( ( new Date( at ) ) < ( new Date( bt ) ) ) return 1;
  //     else if( ( new Date( at ) ) > ( new Date( bt ) ) ) return -1;
  //
  //     return 0;
  //   } );
  //
  // console.log( q );

  const created = media.filter( ( { id, timestamp } ) =>
    !mediaIds_.includes( id ) &&
    Math.floor( ( new Date( timestamp ) ).getTime() / 1000 ) > updatedAt
  );
  const deleted = mediaIds_.filter( id => !mediaIds.includes( id ) );

  return { created, deleted };
}

function save( client, oracleUserId, media, createdAt ){
  const fields = [
    "oracle_user_id",
    "caption",
    "id",
    "media_type",
    "media_url",
    "permalink",
    "thumbnail_url",
    "timestamp",
    "username",
    "parent_id",
    "created_at"
  ];

  const values = media.map( ( {
    caption,
    thumbnail_url,
    parent_id,
    id,
    media_type,
    media_url,
    permalink,
    timestamp,
    username
  } ) => {
    caption = caption ? `'${caption}'` : "null";
    thumbnail_url = thumbnail_url ? `'${thumbnail_url}'` : "null";
    parent_id = parent_id ? `'${parent_id}'` : "null";

    return "(" +
      `${oracleUserId},` +
      `${caption},` +
      `'${id}',` +
      `'${media_type}',` +
      `'${media_url}',` +
      `'${permalink}',` +
      `${thumbnail_url},` +
      `'${timestamp}',` +
      `'${username}',` +
      `${parent_id},` +
      createdAt +
    ")";
  } );

  return client.query(
    `insert into user_media( ${fields} )
    values ${values}`
  );
}

function del( client, oracleUserId, ids ){
  return client.query(
    `update user_media
    set status = 'deleted'
    where
      oracle_user_id = $1 and
      id = any( $2 )`,
    [ oracleUserId, ids ]
  );
}

async function run( { oracleUserId }, cron ){
  const pool = getPool();
  const { expires_at, access_token, updated_at } = await users.getByOracleUserId( pool, oracleUserId );

  console.log( "[TASK SCRAP] START" );

  const { error, media } = await getAllMedia( access_token );

  if( error ){
    console.log( `[TASK SCRAP] ERROR (${error.code}, ${error.custom})` );

    if( !error.custom && ( error.code === 100 || error.code === 190 ) ){
      console.log( "[TASK SCRAP] REMOVE USER, DELETE TASK && SEND REQUEST FOR UNBIND" );

      const {
        ORACLE_ID,
        HMAC_ALGORITHM: algorithm,
        HMAC_SECRET: secret,
        HMAC_SIGNATURE_ENCODING: encoding
      } = process.env;

      const body = JSON.stringify( { oracle_user_id: `${oracleUserId}` } );
      const signature = sign( body, algorithm, secret, encoding );
      const taskId = await users.removeOneByOracleUserId( pool, oracleUserId );

      await cron.delete( taskId );
      console.log( `[TASK SCRAP] DATA FOR REQUEST TO ODS. SIGNATURE: ${signature}, BODY: ${body}` );

      const response = await fetch( `https://dev.oracle.iterra.world/api/v1/oracle/${ORACLE_ID}/unbind`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Signature": signature
        },
        body
      } );

      console.log( "[TASK SCRAP] RESPONSE FROM ODS" );
      console.log( response );

      if( !response.ok ){
        console.log( "[TASK SCRAP] ERROR" );

        return false;
      }

      console.log( "[TASK SCRAP] SUCCESS" );

      return true;
    }

    return false;
  }

  const client = new Transaction( pool );

  if( media.length > 0 ){
    const { created, deleted } = await filter( client, oracleUserId, media, updated_at );

    console.log( `[TASK SCRAP] CREATED: ${created.length}` );
    console.log( `[TASK SCRAP] DELETED: ${deleted.length}` );

    if( created.length > 0 ) await save( client, oracleUserId, created, Math.floor( Date.now() / 1000 ) );
    if( deleted.length > 0 ) await del( client, oracleUserId, deleted );
  }

  await users.editByOracleUserId( client, oracleUserId, { updated_at: Math.floor( Date.now() / 1000 ) } );
  await client.end();

  console.log( "[TASK SCRAP] USER LAST UPDATED TIME *UPDATED*" );
}
