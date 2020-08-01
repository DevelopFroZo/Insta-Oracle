"use strict";

const PgError = require( "./PgError" );

module.exports = class{
  constructor( pool ){
    this.pool = pool;
    this.client = null;
    this.state = 0;
    this.count = 0;
  }

  async end( mode ){
    if( this.state === 0 || this.state === 2 ) return;

    if( mode === false ) await this.client.query( "rollback" );
    else await this.client.query( "commit" );

    await this.client.end();
    this.client.release();

    this.state = 2;
  }

  async open(){
    if( this.state > 0 ) return;

    try{
      this.client = await this.pool.connect();
      this.state = 1;
      await this.client.query( "begin" );
    } catch( e ) {
      await this.end( false );

      throw new PgError( e );
    }
  }

  async query( sql, data ){
    if( this.state === 2 ) throw new Error( "Client released" );

    await this.open();
    this.count++;

    try{
      const result = await this.client.query( sql, data );

      return result;
    } catch( error ) {
      error.queryNumber = this.count;
      await this.end( false );

      throw new PgError( error );
    }
  }
}
