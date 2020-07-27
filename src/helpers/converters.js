"use strict";

module.exports = {
  toNumber,
  toInt
};

// ==================== TO NUMBER ====================
function toNumber( el, type ){
  if( type !== "int" && type !== "float" )
    return null;

  if( typeof el === "number" )
    return el;

  if( typeof el !== "string" )
    return null;

  el = el.replace( / +/g, "" );

  if( el === "" )
    return null;

  el = type === "int" ? parseInt( el ) : parseFloat( el );

  if( typeof el !== "number" || isNaN( el ) )
    return null;

  return el;
}

// ==================== TO INT ====================
function toInt( el ){
  return toNumber( el, "int" );
}
