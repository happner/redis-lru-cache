var commander = require('commander')
  , shortid = require('shortid')
  , RandomClient = require('./random-client')
  ;

var runId;

var trySend = function (event, data) {

  try {

    var message = {event:event, message:data, originId:runId, timestamp:Date.now()};

    process.send(JSON.stringify(message));
  } catch (e) {
    //do nothing
  }
};

commander

  .allowUnknownOption()//fixes the unknown option error
  .option('--mode [string]', 'fixed_throughput or throughput_over_duration') // ie. module.exports = {/* the config */}
  .option('--init [string]', 'amount of initial sets to happen')
  .option('--size [string]', 'size of throughput or duration in ms')
  .option('--defer', 'defer run wait for start command')
  .option('--id [string]', 'ID of this runner')
  .option('--cache_id [string]', 'ID of this runner')
  .option('--consistency [string]', 'do some consistency updates')
  .option('--delConsistency [string]', 'do some delete consistency operations')
  .parse(process.argv);

var mode = commander.mode ? commander.mode : 'throughput_over_duration';

var size = commander.size ? parseInt(commander.size) : 1000; //1 second or 1000 get operations

runId = commander.id ? commander.id : shortid.generate();

var init = commander.init ? parseInt(commander.init) : 1000;

var defer = commander.defer;

var consistency = commander.consistency ? parseInt(commander.consistency) : 0;

var delConsistency = commander.delConsistency ? parseInt(commander.delConsistency) : 0;

var cacheid = commander.cache_id;

var testId = commander.id?commander.id:Date.now() + '_' + require('shortid').generate();

trySend('UP', {mode:mode, size:size});

var clientOpts = {
  cache:{
    cacheId:cacheid
  }
};

var START = Date.now();

//console.log('starting random cache:::', clientOpts);

var randomClient = new RandomClient(clientOpts);

randomClient.on('set-activity-run-complete', function(message){
  trySend('set-activity-run-complete', message);

});

randomClient.on('get-activity-run-complete', function(message){

  message.duration = Date.now() - START;

  trySend('get-activity-run-complete', message);

  //console.log('RUN-COMPLETE');

});

var stop;

var doGet = function(message){

  randomClient.cache().get(message.key, function(e, data){

    if (e) return trySend('cache-get-failed', {message:message, error:e.toString()});

    trySend('cache-get-complete', {message:message, data:data});
  });
};

var doSet = function(message){

  randomClient.cache().set(message.key, message.data, function(e, response){

    if (e) return trySend('cache-set-failed', {message:message, error:e.toString()});

    trySend('cache-set-complete', {message:message, response:response});
  });
};

var doDelete = function(message){

  randomClient.deleteAll(message.items, function(e){

    //console.log('DELETED ALL:::', e);

    if (e) return trySend('delete-all-failed', {message:message, error:e.toString()});

    trySend('delete-all-complete', {message:message});

  });
};

var doRun = function(){

  if (mode == 'throughput_over_duration'){

    randomClient.on('initial-sets-complete', function(tesrun){

      setTimeout(tesrun.stop, size);
    });

    var testrun = randomClient.startGetActivity({
      testId:testId,
      initialSets:init,
      consistency:consistency,
      delConsistency:delConsistency,
      log:true
    });

  } else {

    stop = randomClient.startGetActivity({
      testId:testId,
      initialSets:init,
      limit:size,
      consistency:consistency,
      delConsistency:delConsistency,
      log:true
    });
  }
};

process.on('message', function(serialized){

  var message = JSON.parse(serialized);

  if (message.type == 'doRun') doRun();

  if (message.type == 'doSet') doSet(message);

  if (message.type == 'doGet') doGet(message);

  if (message.type == 'doDeleteAll') doDelete(message);

});

if (defer) return;

doRun();






