// Libs
const fetch = require( "node-fetch" );

// Heleprs
const { getManyMediaUrl, getOneMediaUrl } = require( "../../helpers/urlFactory" );
const sign = require( "../../helpers/sign" );

// Database
const { getPool } = require( "../../database/pool" );
const Transaction = require( "../../database/transaction" );
const users = require( "../../database/users" );
const tempTable = require( "../../database/tempTable" );

module.exports = run;

/*
 * Функция, инициализируя которую можно получать
 * данные из аккаунта инстаграма частями.
 * Возвращает JSON из двух полей:
 * * fetch:
 * *    асинхронная функция, возвращающая Promise,
 * *    который зарезолвится либо с ошибкой, либо
 * *    с данными
 * * hasNextPart:
 * *    функция, возвращающая true/false
 * *    в зависимости от того, можно ли
 * *    получить что-то ещё, или нет
 */
function initMediaFetcher( accessToken ){
  let next = getManyMediaUrl( accessToken );

  return ( {
    fetch: async () => {
      const media = [];
      let response;

      try{
        console.log( "[TASK SCRAP] Get part of media" );
        response = await fetch( next );

        if( !response.ok ){
          console.debug( response );

          return { error: { custom: true } };
        }
      } catch( e ) {
        console.error( e );

        return { error: { custom: true } };
      }

      const { error, data: media_, paging } = await response.json();

      if( error ){
        console.debug( error );

        return { error: {
          ...error,
          custom: false
        } };
      }

      if( typeof paging === "object" && "next" in paging ) next = paging.next;
      else next = undefined;

      if( Array.isArray( media_ ) ) for( const el of media_ ){
        const { id, children } = el;

        media.push( el );

        if( children ) for( const { id: childrenId } of children.data ){
          try{
            console.log( "[TASK SCRAP] Get one media" );
            response = await fetch( getOneMediaUrl( childrenId, accessToken, "id,media_type,media_url,permalink,thumbnail_url,timestamp,username" ) );

            if( !response.ok ){
              console.debug( response );

              // continue;
              return { error: { custom: true } };
            }
          } catch( e ) {
            console.error( e );

            // continue;
            return { error: { custom: true } };
          }

          const result = await response.json();

          media.push( {
            ...result,
            parent_id: id
          } );
        }
      }
      else return { media: [] };

      return { media };
    },
    hasNextPart: () => next !== undefined
  } );
}

/*
 * Идея -- получать данные пачками, сохранять
 * во временную таблицу, затем выявлять созданные записи
 * и записывать их в основную таблицу, удалять записи из
 * основной таблицы, которые были в аккаунте, но были
 * удалены
 */
async function run( { oracleUserId }, cron ){
  console.log( "[TASK SCRAP] Start" );

  const pool = getPool();
  let result;

  try{
    console.log( `[TASK SCRAP] Get user` );
    result = await users.get( pool, oracleUserId );
    console.log( `[TASK SCRAP] Clear temp table by oracle user id (${oracleUserId})` );
    await tempTable.clearByOracleUserId( pool, oracleUserId );
  } catch( e ) {
    console.error( e );

    return false;
  }

  const { expires_at, access_token, updated_at, task_id } = result;
  const mediaFetcher = initMediaFetcher( access_token );

  while( mediaFetcher.hasNextPart() ){
    const { error, media } = await mediaFetcher.fetch();

    if( error ){
      if( !error.custom && ( error.code === 100 || error.code === 190 ) ){
        try{
          const {
            HMAC_ALGORITHM,
            HMAC_SECRET,
            HMAC_SIGNATURE_ENCODING,
            ODS_URL,
            UNBIND_URI,
            ORACLE_ID
          } = process.env;

          const body = JSON.stringify( { oracle_user_id: `${oracleUserId}` } );
          const signature = sign( body, HMAC_ALGORITHM, HMAC_SECRET, HMAC_SIGNATURE_ENCODING );

          console.debug( `[TASK SCRAP] Data for request. Signature: ${signature}, body: ${body}` );
          console.log( "[TASK SCRAP] Send request for unbind" );

          // const response = await fetch( `${ODS_URL}${UNBIND_URI.replace( "{ORACLE_ID}", ORACLE_ID )}`, {
          //   method: "DELETE",
          //   headers: {
          //     "Accept": "application/json",
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

        try{
          console.log( `[TASK SCRAP] Delete from cron` );
          await cron.delete( task_id );

          return true;
        } catch( e ) {
          console.error( e );

          return false;
        }
      }

      return false;
    }

    try{
      console.log( `[TASK SCRAP] Add part of media to temp table (${media.length})` );
      await tempTable.create( pool, oracleUserId, media, Math.floor( Date.now() / 1000 ) );
    } catch( e ) {
      console.error( e );

      return false;
    }
  }

  try{
    const client = new Transaction( pool );

    console.log( "[TASK SCRAP] Merge with main table" );
    await tempTable.merge( client, oracleUserId, updated_at );
    console.log( `[TASK SCRAP] Clear temp table by oracle user id` );
    await tempTable.clearByOracleUserId( client, oracleUserId );
    console.log( "[TASK SCRAP] Update user last updated time" );
    await users.edit( client, oracleUserId, { updated_at: Math.floor( Date.now() / 1000 ) } );
    await client.end();
  } catch( e ) {
    console.error( e );

    return false;
  }
}
