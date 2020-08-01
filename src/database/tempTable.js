"use strict";

module.exports = {
  clearByOracleUserId,
  create,
  merge
};

function clearByOracleUserId( client, oracleUserId ){
  return client.query(
    `delete from temp_table
    where oracle_user_id = $1`,
    [ oracleUserId ]
  );
}

function create( client, oracleUserId, media, createdAt ){
  const fields = [
    "oracle_user_id",
    "caption",
    "id",
    "media_type",
    "media_url",
    "permalink",
    "thumbnail_url",
    "timestamp",
    "timestamp_",
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
      `${Math.floor( ( new Date( timestamp ) ).getTime() / 1000 )},` +
      `'${username}',` +
      `${parent_id},` +
      createdAt +
    ")";
  } );

  return client.query(
    `insert into temp_table( ${fields} )
    values ${values}`
  );
}

async function merge( client, oracleUserId, updatedAt ){
  await client.query(
    `insert into user_media( caption, id, media_type, media_url, permalink, thumbnail_url, timestamp, username, parent_id, oracle_user_id, created_at )
    select tt.caption, tt.id, tt.media_type, tt.media_url, tt.permalink, tt.thumbnail_url, tt.timestamp, tt.username, tt.parent_id, tt.oracle_user_id, tt.created_at
    from
    	(
    		select *
    		from temp_table
    		where
    			oracle_user_id = $1 and
    			timestamp_ > $2
    	) as tt
    	left join (
    		select *
    		from user_media
    		where oracle_user_id = $1
    	) as um
    	on tt.id = um.id
    where um.id is null`,
    [ oracleUserId, updatedAt ]
  );

  await client.query(
    `update user_media
    set status = 'deleted'
    where id in (
    	select um.id
    	from
    		(
    			select *
    			from user_media
    			where oracle_user_id = $1
    		) as um
    		left join (
    			select *
    			from temp_table
    			where oracle_user_id = $1
    		) as tt
    		on um.id = tt.id
    	where tt.id is null
    )`,
    [ oracleUserId ]
  );
}
