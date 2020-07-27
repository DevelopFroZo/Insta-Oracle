"use strict";

const taskTemplates = require( "./tasks" );
const timeModifiers = require( "./timeModifiers" );

function getUnixTimestamp(){
  return Math.floor( Date.now() / 1000 );
}

class Cron{
  constructor( driver ){
    this.driver = driver;
    this.savedTimestamp = null;
    this.tasks = [];
  }

  async grab( ignore, isFirst = false ){
    const t = getUnixTimestamp();

    if( ignore === true || this.savedTimestamp !== null && t >= this.savedTimestamp ){
      const grab = !isFirst ? this.driver.grab : this.driver.grabFirst;

      console.log( `[GRAB] ${t}, ${( new Date( t * 1000 ) ).toString()}` );

      const [ tasks, timestamp ] = await grab( t );

      this.tasks = [ ...this.tasks, ...tasks ];
      this.savedTimestamp = timestamp ? timestamp : null;
    }
  }

  async filterExpires(){
    let isGrab = false;
    let i = 0;
    const toDelete = [];
    const t = getUnixTimestamp();

    while( i < this.tasks.length ){
      const { id, timestamp, settings: { onExpires } } = this.tasks[i];

      if( t > timestamp && onExpires !== "run" ){
        const task = this.tasks.shift();

        if( onExpires === "delete" ) toDelete.push( id );
        else{
          isGrab = true;
          await this.updateTask( false, task );
        }
      }
      else i++;
    }

    if( toDelete.length > 0 )
      await this.driver.delete( toDelete );

    return isGrab;
  }

  updateTask( result, { id, timestamp, settings, success_runs, error_runs } ){
    console.log( `[UPDATE] ${( new Date() ).getTime()} ${( new Date() ).toString()}` );

    let runs = result ? success_runs : error_runs;
    const limitValue = result ? settings.success.limit.value : settings.error.limit.value;
    const limitAction = result ? settings.success.limit.action : settings.error.limit.action;
    const savedRuns = runs;

    runs++;

    if( limitValue === -1 || runs < limitValue || ( runs === limitValue && limitAction === "restart" ) ){
      let timeModifierSettings;
      let runFields;

      if( result ){
        if( runs === limitValue ){
          timeModifierSettings = settings.success.limit.timeModifierSettings;
          runs = 0;
        }
        else timeModifierSettings = settings.success.timeModifierSettings;

        runFields = [ [ "success_runs", runs ] ];

        if( settings.success.isDrop && error_runs > 0 ) runFields.push( [ "error_runs", 0 ] );
      } else {
        if( runs === limitValue ){
          timeModifierSettings = settings.error.limit.timeModifierSettings;
          runs = 0;
        }
        else timeModifierSettings = settings.error.timeModifierSettings;

        runFields = [ [ "error_runs", runs ] ];

        if( settings.error.isDrop && success_runs > 0 ) runFields.push( [ "success_runs", 0 ] );
      }

      const delta = timeModifierSettings[ savedRuns % ( timeModifierSettings.length - 1 ) + 1 ];

      timestamp = timeModifiers[ timeModifierSettings[0] ]( timestamp, getUnixTimestamp(), delta );

      return this.driver.update( id, timestamp, runFields );
    }

    return this.driver.delete( [ id ] );
  }

  async runTask( task ){
    let result;
    const { type, params, success_runs } = task;
    const { before, run, after } = taskTemplates[ type ];

    if( before ) result = await before( params, this, success_runs );
    if( result !== false ) result = await run( params, this, success_runs );
    if( result !== false && after ) result = await after( params, this, success_runs );

    await this.updateTask( result !== false, task );
    await this.grab( true );
  }

  async tick(){
    await this.grab();

    while( this.tasks.length > 0 ){
      const task = this.tasks.shift();

      console.log( `[RUN] ${task.id} (${getUnixTimestamp()}, ${( new Date() ).toString()})` );

      this.runTask( task );
    }

    setTimeout( () => this.tick(), 1000 );
  }

  async start(){
    await this.grab( true, true );

    if( await this.filterExpires() ) await this.grab( true );

    this.tick();
  }

  async add( type, settings ){
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

    const id = await this.driver.add( type, timestamp, settings_, params );

    if( this.savedTimestamp === null || this.savedTimestamp > timestamp )
      this.savedTimestamp = timestamp;

    console.log( `[ADD] NOW SAVEV TIMESTAMP IS ${this.savedTimestamp}` );

    return id;
  }

  delete( id ){
    return this.driver.delete( [ id ] );
  }
}

module.exports = Cron;
