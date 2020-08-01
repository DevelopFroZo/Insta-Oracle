"use strict";

class PgError extends Error{
  constructor( detail ){
    super( detail );
  }
}

module.exports = PgError;
