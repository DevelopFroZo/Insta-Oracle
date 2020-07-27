"use strict";

module.exports = ( url, query, options ) => {
  if( options === null || typeof options !== "object" || Array.isArray( options ) )
    options = {};

  const { exclude, isSort } = options;

  let entries = Object.entries( query );

  if( Array.isArray( exclude ) )
    entries = entries.filter( entry => !exclude.includes( entry[0] ) );

  if( isSort === true )
    entries = entries.sort( ( a, b ) => {
      if( a[0] > b[0] ) return 1;
      if( a[0] < b[0] ) return -1;

      return 0;
    } );

  entries = entries.map( entry => `${encodeURIComponent( entry[0] )}=${encodeURIComponent( entry[1] )}` ).join( "&" );

  return `${url}?${entries}`;
};
