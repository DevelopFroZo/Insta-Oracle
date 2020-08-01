"use strict";

const taskTemplates = require( "./tasks" );
const timeModifiers = require( "./timeModifiers" );

function getUnixTimestamp(){
  return Math.floor( Date.now() / 1000 );
}

// #fix DEBUG, REMOVE (tts => timestampToString)
function tts( timestamp ){
  const dt = new Date( timestamp * 1000 );
  let date = `${dt.getDate()}`;
  let month = `${dt.getMonth() + 1}`;
  const year = `${dt.getFullYear()}`;
  let hours = `${dt.getHours()}`;
  let minutes = `${dt.getMinutes()}`;
  let seconds = `${dt.getSeconds()}`;

  if( date.length === 1 ) date = `0${date}`;
  if( month.length === 1 ) month = `0${month}`;
  if( hours.length === 1 ) hours = `0${hours}`;
  if( minutes.length === 1 ) minutes = `0${minutes}`;
  if( seconds.length === 1 ) seconds = `0${seconds}`;

  return `${date}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

class Cron{
  constructor( driver, { updateDelay, updateLimit } ){
    this.driver = driver;
    // #fix check valid
    this.updateDelay = updateDelay;
    this.updateLimit = updateLimit;
    this.tasks = [];
    this.tasksInUpdate = 0;
    this.savedTimestamp = null;
  }

  updateTask( result, { id, timestamp, settings, success_runs, error_runs } ){
    this.tasksInUpdate++;

    const link = result ? settings.success : settings.error;
    const limitValue = link.limit.value;
    let runs = result ? success_runs : error_runs;
    const savedRuns = runs;
    let fn;
    let fnRuns = 0;

    if( limitValue === -1 || runs < limitValue || ( runs === limitValue && link.limit.action === "restart" ) ){
      const runFields = [];
      let timeModifierSettings;

      if( runs === limitValue ){
        timeModifierSettings = link.limit.timeModifierSettings;
        runs = 0;
      }
      else{
        timeModifierSettings = link.timeModifierSettings;
        runs++;
      }

      const timeModifier = timeModifiers[ timeModifierSettings[0] ];

      runFields.push( [ `${result ? "success" : "error"}_runs`, runs ] );

      if( link.isDrop && ( result && error_runs > 0 || !result && success_runs > 0 ) )
        runFields.push( [ `${result ? "error" : "success"}_runs`, 0 ] );

      const delta = timeModifierSettings[ savedRuns % ( timeModifierSettings.length - 1 ) + 1 ];

      fn = async () => {
        const timestamp_ = timeModifier( timestamp, getUnixTimestamp(), delta );

        console.log( `${tts( getUnixTimestamp() )} [UPDATE TASK] Update by driver (${id})` );
        await this.driver.update( id, timestamp_, runFields );

        if( this.savedTimestamp === null || this.savedTimestamp > timestamp_ ){
          this.savedTimestamp = timestamp_;

          console.debug( `${tts( getUnixTimestamp() )} [UPDATE TASK] Saved timestamp: ${timestamp_} (${tts( timestamp_ )})` );
        }
      };
    }
    else fn = () => this.driver.delete( [ id ] );

    const fnWrapper = async () => {
      let result = false;

      try{
        result = await fn();
      } catch( e ) {
        console.error( e );
      }

      if( result === false && ++fnRuns !== this.updateLimit )
        setTimeout( fnWrapper, this.updateDelay * 1000 );
        else this.tasksInUpdate--;

      // #fix remove, just for logging
      if( result === false && fnRuns === this.updateLimit ) console.debug( `${tts( getUnixTimestamp() )} [UPDATE TASK] Task RIP (${id})` );
      if( result ) console.debug( `${tts( getUnixTimestamp() )} [UPDATE TASK] Success (${id})` );
    };

    fnWrapper();
  }

  async grab( timestamp ){
    if( this.savedTimestamp !== null && timestamp >= this.savedTimestamp ) try{
      console.log( `${tts( timestamp )} [GRAB] Grabbing` );

      const [ tasks, savedTimestamp ] = await this.driver.grab( timestamp );

      console.debug( `${tts( timestamp )} [GRAB] Saved timestamp: ${savedTimestamp} (${tts( savedTimestamp )})` );

      this.savedTimestamp = savedTimestamp;
      this.tasks = [ ...this.tasks, ...tasks ];
    } catch( e ) {
      console.error( e );
    }
  }

  async runTask( task ){
    console.log( `${tts( getUnixTimestamp() )} [RUN TASK] Run task start (${task.id, tts( task.timestamp )})` );

    const { type, params, success_runs } = task;
    const run = taskTemplates[ type ];
    const result = await run( params, this, success_runs );

    console.log( `${tts( getUnixTimestamp() )} [RUN TASK] Run task end (${task.id})` );

    this.updateTask( result !== false, task );
  }

  async tick(){
    if( this.tasksInUpdate === 0 ){
      await this.grab( getUnixTimestamp() );

      while( this.tasks.length > 0 ){
        const task = this.tasks.shift();

        this.runTask( task );
      }
    }

    setTimeout( () => this.tick(), 1000 );
  }

  async start(){
    try{
      console.log( `[START] Grabbing first` );

      const [ tasks, savedTimestamp ] = await this.driver.grabFirst( getUnixTimestamp() );
      const toDelete = [];

      if( this.savedTimestamp === null || this.savedTimestamp > savedTimestamp ){
        this.savedTimestamp = savedTimestamp;

        console.debug( `[START] Saved timestamp: ${savedTimestamp} (${tts( savedTimestamp )})` );
      }

      for( const task of tasks ){
        const { id, timestamp, settings: { onExpires } } = task;

        switch( onExpires ){
          case "run": this.tasks.push( task ); break;
          case "update": this.updateTask( false, task ); break;
          default: toDelete.push( id );
        }
      }

      console.log( `[START] Tasks to run: ${this.tasks.length}` );
      console.log( `[START] Tasks in update: ${this.tasksInUpdate}` );
      console.log( `[START] Tasks to delete: ${toDelete.length}` );

      if( toDelete.length > 0 ){
        console.log( `[START] Delete tasks` );
        await this.driver.delete( toDelete );
      }

      this.tick();
    } catch( e ) {
      console.error( "[START] Database error" );
      console.log( e );
    }
  }

  async add( type, settings, client ){
    if( !settings ) settings = {};

    let { timestamp, settings: settings_, params } = settings;

    if( !timestamp ) timestamp = getUnixTimestamp();

    if( !settings_.success ) settings_.success = {};
    if( !settings_.success.limit ) settings_.success.limit = {};
    if( !settings_.success.limit.value ) settings_.success.limit.value = -1;
    if( typeof settings_.success.isDrop !== "boolean" ) settings_.success.isDrop = true;

    if( !settings_.error ) settings_.error = {};
    if( !settings_.error.limit ) settings_.error.limit = {};
    if( !settings_.error.limit.value ) settings_.error.limit.value = -1;
    if( typeof settings_.error.isDrop !== "boolean" ) settings_.error.isDrop = true;

    if( !settings_.onExpires ) settings_.onExpires = "delete";

    if( !params ) params = null;

    try{
      const id = await this.driver.add( type, timestamp, settings_, params, client );

      console.log( `${tts( getUnixTimestamp() )} [ADD] Add task to database (${id})` );

      if( this.savedTimestamp === null || this.savedTimestamp > timestamp ){
        this.savedTimestamp = timestamp;

        console.debug( `${tts( getUnixTimestamp() )} [ADD] Saved timestamp: ${timestamp} (${tts( timestamp )})` );
      }

      return id;
    } catch( e ) {
      console.error( "[ADD] Fail add task" );

      throw e;
    }
  }

  // #fix update savedTimestamp
  async delete( id, client ){
    try{
      await this.driver.delete( [ id ], client );

      console.log( `${tts( getUnixTimestamp() )} [DELETE] Delete task (${id})` );
    } catch( e ) {
      console.error( `[DELETE] Fail delete task (${id})` );

      throw e;
    }
  }
}

module.exports = Cron;
