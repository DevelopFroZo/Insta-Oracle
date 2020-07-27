module.exports = {
  getShortAccessTokenUrl,
  getLongAccessTokenUrl,
  getMeUrl,
  getManyMediaUrl,
  getOneMediaUrl
};

function getShortAccessTokenUrl(){
  return "https://api.instagram.com/oauth/access_token";
}

function getLongAccessTokenUrl( clientSecret, accessToken ){
  return "https://graph.instagram.com/access_token" +
    "?grant_type=ig_exchange_token" +
    `&client_secret=${clientSecret}` +
    `&access_token=${accessToken}`;
}

function getMeUrl( accessToken ){
  return "https://graph.instagram.com/me" +
    "?fields=account_type,id,media_count,username" +
    `&access_token=${accessToken}`;
}

function getManyMediaUrl( accessToken ){
  return "https://graph.instagram.com/me/media" +
    "?fields=caption,id,media_type,media_url,permalink,thumbnail_url,timestamp,username,children" +
    `&access_token=${accessToken}`;
}

function getOneMediaUrl( mediaId, accessToken, fields ){
  if( typeof fields === "string" )
    fields = fields.replace( / +/g, "" ).split( "," );
  else if( !Array.isArray( fields ) )
    fields = [ "caption", "id", "media_type", "media_url", "permalink", "thumbnail_url", "timestamp", "username", "children" ];

  return `https://graph.instagram.com/${mediaId}` +
    `?fields=${fields}` +
    `&access_token=${accessToken}`;
}
