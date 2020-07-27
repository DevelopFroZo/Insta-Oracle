"use strict";

module.exports = class{
  constructor( pool, maxQueries ){
    this.client = pool;
    this.state = 0;
    this.count = 0;
    this.maxQueries = 0;

    if( typeof Number.isInteger( maxQueries ) && maxQueries > 0 )
      this.maxQueries = maxQueries;
  }

  async open(){
    if( this.state > 0 ) return;

    this.client = await this.client.connect();
    await this.client.query( "begin" );
    this.state = 1;
  }

  async end( mode ){
    if( this.state === 0 || this.state === 2 ) return;

    if( mode === false ) await this.client.query( "rollback" );
    else await this.client.query( "commit" );

    await this.client.end();
    this.client.release();
    this.state = 2;
  }

  async query( sql, data ){
    if( this.state === 2 ) throw "Client released";

    await this.open();
    this.count++;

    const result = await this.client.query( sql, data ).catch( async error => {
      error.queryNumber = this.count;
      await this.end( false );

      throw error;
    } );

    if( this.count === this.maxQueries ) await this.end( true );

    return result;
  }
}
