"use strict";

/*
 * CRON не зависит от базы данных,
 * поэтому пишется некий "драйвер",
 * который отвечает за действия,
 * которые нужны, чтобы демон
 * получил необходимые данные из БД
 */

const Transaction = require( "../../database/transaction" );

module.exports = index;

/*
 * isFirst -- если он будет указан как true,
 * а такое произойдёт только при старте
 * демона, то Pomise зарезолвится с
 * задачами, статус которых отличен от
 * "await"
 * Данное действие необходимо, чтобы
 * при выключении демона на долгое время,
 * либо при падении БД, либо при
 * непредвиденной ошибке восстановить
 * систему и выполнить/удалить/обновить
 * все задачи
 */
async function grab( pool, table, timestamp, isFirst = false ){
  const client = new Transaction( pool );

  const { rows: tasks } = await client.query(
    `update ${table}
    set status = 'process'
    where
      timestamp <= $1
      ${!isFirst ? "and status = 'await'" : ""}
    returning *`,
    [ timestamp ]
  );

  let { rows: [ { timestamp_ } ] } = await client.query(
    `select min( timestamp ) as timestamp_
    from ${table}
    where
    	timestamp > $1 and
    	status = 'await'`,
    [ timestamp ]
  );

  await client.end();

  for( const task of tasks )
    task.timestamp = parseInt( task.timestamp );

  timestamp_ = timestamp_ ? parseInt( timestamp_ ) : null;

  return [ tasks, timestamp_ ];
}

/*
 * runFields -- в этом параметре передаётся массив
 * массивов вида [ [ field, value ], [ ... ], ... ].
 * Если у задачи в settings.isDrop указано true,
 * то при успешном запуске задачи неуспешные запуски
 * будут сброшены в 0 и наоборот
 */
function update( pool, table, id, timestamp, runFields ){
  const sets = [ "timestamp = $1", "status = 'await'" ];
  const params = [ timestamp, id ];
  let i = 3;

  for( let [ field, value ] of runFields ){
    sets.push( `${field} = $${i++}` );
    params.push( value );
  }

  return pool.query(
    `update ${table}
    set ${sets}
    where id = $2`,
    params
  );
}

function del( client, table, ids ){
  return client.query(
    `delete from ${table}
    where id = any( $1 )`,
    [ ids ]
  );
}

/*
 * settings -- настройки выполнения задачи (JSON)
 * params -- переданные параметры задачи (JSON)
 */
async function add( client, table, type, timestamp, settings, params ){
  const { rows: [ { id } ] } = await client.query(
    `insert into ${table}( type, timestamp, settings, params )
    values( $1, $2, $3, $4 )
    returning id`,
    [ type, timestamp, settings, params ]
  );

  return id;
}

function index( pool, table ){
  if( typeof table !== "string" || table === "" )
    table = "tasks";

  return {
    grabFirst: timestamp => grab( pool, table, timestamp, true ),
    update: ( id, timestamp, runFields ) => update( pool, table, id, timestamp, runFields ),
    delete: ( ids, client ) => del( client || pool, table, ids ),
    grab: timestamp => grab( pool, table, timestamp ),
    add: ( type, timestamp, settings, params, client ) => add( client || pool, table, type, timestamp, settings, params )
  };
}
