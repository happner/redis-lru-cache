var EventEmitter = require("events").EventEmitter
  , async = require('async')
  , path = require('path')
  ;

function TestCluster(){

  this.__events = new EventEmitter();
  this.__clients = {};
  this.__logs = {};
  this.__completed = [];
  this.__started = [];

  this.__totals = {};

  this.__setTotals = [];
  this.__getTotals = [];

  this.__consistencyTotals = {};

  this.__delConsistencyTotals = {};
}

TestCluster.prototype.__emit = function(event, message){
  return this.__events.emit(event, message);
};

TestCluster.prototype.on = function(event, handler){
  return this.__events.on(event, handler);
};

TestCluster.prototype.off = TestCluster.prototype.removeListener = function(event, handler){
  this.__events.removeListener(event, handler);
};

TestCluster.prototype.addClient = function(args, callback){

  this.__clients[args[1]] = {args:args};

  this.__logs[args[1]] = [];

  var client = this.__clients[args[1]];

  var fork = require('child_process').fork;

  client.remote = fork(path.resolve(__dirname, 'random_client_runner'), client.args);

  client.remote.on('message', this.__handleRemoteMessage.bind(this));

  callback();

};

TestCluster.prototype.__aggregateTotals = function(){

};

TestCluster.prototype.verifyConsistency = function(callback){

  var _this = this;

  var idDown = Object.keys(_this.__consistencyTotals);

  var idUp = Object.keys(_this.__consistencyTotals).reverse();

  var misses = 0;

  async.eachSeries(idDown, function(idDownItem, idDownItemCB){

    async.eachSeries(idUp, function(idUpItem, idUpItemCB){

      if (idDownItem != idUpItem){

        //console.log('checking consistency checking ' + idUpItem + '\'s data on ' + idDownItem);

        // //console.log('idDownItem:::', idDownItem);
        // //console.log('idUpItem:::', idUpItem);
        //
        // //console.log('totals:::', _this.__consistencyTotals[idUpItem]);

        var deduplicateMessages = {};

        async.eachSeries(_this.__consistencyTotals[idUpItem], function(logItem, logItemCB){

          ////console.log('checking consistency log item:::', logItem);

          var timedOut = false;

          var doGetTimeout = setTimeout(function(){
            //console.log('ttl miss:::');
            misses++;
            timedOut = true;
            logItemCB();
          }, 1000);

          _this.__clients[idDownItem].remote.on('message', function(serialized){

            var deserialized = JSON.parse(serialized);

            // //console.log('have cache-get-complete message:::?', deserialized);
            // //console.log('have cache-get-complete logItem:::?', logItem);

            // var logItemExample = {
            //   key: 'SkbYETsUl_1/0',
            //   value: { test: 0 },
            //   error: null
            // };

            // var desExample = {
            //   event: 'cache-get-complete',
            //   message: {
            //     message: {type: 'doGet', key: 'SkbYETsUl_1/0'},
            //     data: {test: 0}
            //   },
            //   originId: 'SkbYETsUl_0',
            //   timestamp: 1484670073249
            // };

            if (deserialized.event == 'cache-get-complete' &&

              deserialized.message.message.key == logItem.key){

              if (deduplicateMessages[deserialized.message.message.key]){

                //console.log('duplicate message:::', JSON.stringify(deserialized.message));
                clearTimeout(doGetTimeout);
              } else {

                deduplicateMessages[deserialized.message.message.key] = true;

                clearTimeout(doGetTimeout);

                if (deserialized.message.data == null || deserialized.message.data.test != logItem.value.test) misses++;

                logItemCB();
              }
            }
          });

          _this.__clients[idDownItem].remote.send(JSON.stringify({type:'doGet', key:logItem.key}));

        }, idUpItemCB);

      } else idUpItemCB();

    }, idDownItemCB);

  }, function(e){

    if (e) return callback(e);

    ////console.log('CALLING BACK WITH MISSES:::', misses);

    callback(null, misses);

  });
};

TestCluster.prototype.verifyDelConsistencyItemsDontExist = function(clientKey, items, callback){

  var _this = this;

  var client = _this.__clients[clientKey];

  var found = 0;

  var foundItems = [];

  var failed = 0;

  var deduplicateMessages = {};

  async.each(items, function(item, itemCB){

    var doGetTimeout = setTimeout(function(){

      //console.log('ttl del get miss:::');
      failed++;
      itemCB();

    }, 1000);

    client.remote.on('message', function(serialized){

      var deserialized = JSON.parse(serialized);

      if (deserialized.message.message.key === item.key){

        //console.log('deserialized:::', deserialized);

        if (deduplicateMessages[deserialized.message.message.key]){

          //console.log('duplicate message:::', JSON.stringify(deserialized.message));

          clearTimeout(doGetTimeout);

        } else {

          deduplicateMessages[deserialized.message.message.key] = true;

          clearTimeout(doGetTimeout);

          if (deserialized.message.data != null) {

            foundItems.push(deserialized.message.message);
            found++;
          }

          itemCB();
        }
      }
    });

    //console.log('item.key:::',item.key);
    client.remote.send(JSON.stringify({type:'doGet', key:item.key}));

  }, function(e){

    if (found > 0){
      console.log('DAMN FOUND THE FOLLOWING ON ' + clientKey + ':::', foundItems);
    }

    //console.log('verifyDelConsistencyItemsDontExist:::', e, found, failed);

    callback(e, found, failed);
  });

};

TestCluster.prototype.verifyDelConsistency = function(callback){

  var _this = this;

  var idDown = Object.keys(_this.__delConsistencyTotals);

  var idUp = Object.keys(_this.__delConsistencyTotals).reverse();

  var pairs = [];

  idDown.forEach(function(idDownItem, i){
    pairs.push([idDownItem, idUp[i]]);
  });

  var found = 0;

  var failed = 0;

  async.eachSeries(pairs, function(pair, pairCB){

    var idDownItem = pair[0];

    var idUpItem = pair[1];

    console.log('del consistency deleting ' + idUpItem + '\'s from ' + idDownItem);

    var toDeleteItems = _this.__delConsistencyTotals[idUpItem];

    console.log('TO DELETE:::', toDeleteItems);

    var timedOut = false;

    var doDelTimeout = setTimeout(function(){
      //console.log('ttl del miss:::');
      misses++;
      timedOut = true;
      pairCB();
    }, 300000);

    _this.__clients[idDownItem].remote.on('message', function(serialized){

      var deserialized = JSON.parse(serialized);

      if (deserialized.event == 'delete-all-failed' &&
        deserialized.message.message.key === idUpItem){

        clearTimeout(doDelTimeout);

        return pairCB(new Error('delete all failed: ' + deserialized.message.error));
      }

      if (deserialized.event == 'delete-all-complete' &&
        deserialized.message.message.key === idUpItem){

        clearTimeout(doDelTimeout);

        setTimeout(function(){

          _this.verifyDelConsistencyItemsDontExist(idUpItem, toDeleteItems, function(e, vfound, vfailed){

            if (e) return pairCB(e);

            found += vfound;

            failed += vfailed;

            pairCB();
          });

        }, 5000);
      }
    });

    _this.__clients[idDownItem].remote.send(JSON.stringify({type:'doDeleteAll', key:idUpItem, items:toDeleteItems}));

  }, function(e){

    if (e) return callback(e);
    ////console.log('CALLING BACK WITH MISSES:::', misses);
    callback(null, found, failed);
  });
};

TestCluster.prototype.__handleRemoteMessage = function(serialized){

  var _this = this;

  var message = JSON.parse(serialized);

  _this.__logs[message.originId].push(message);

  _this.__emit(message.event, message);

  if (message.event == "set-activity-run-complete"){

    //console.log('did set run:::', message.originId);

    _this.__started.push(message.originId);

    _this.__setTotals.push(message.message.totals);

  }

  if (message.event == "get-activity-run-complete"){

    //console.log('did get run', message.originId);

    _this.__completed.push(message.originId);

    _this.__getTotals.push(message.message.totals);

    if (message.message.consistency)
      _this.__consistencyTotals[message.originId] = message.message.consistency;

    if (message.message.delConsistency)
      _this.__delConsistencyTotals[message.originId] = message.message.delConsistency;

    if (_this.__completed.length == Object.keys(_this.__clients).length)
      _this.__emit('cluster-run-complete', _this.__aggregateTotals());
  }

};

TestCluster.prototype.start = function(callback){

  var _this = this;

  async.each(Object.keys(this.__clients), function(clientId, clientCB){

    try{

      var client = _this.__clients[clientId];

      client.remote.send(JSON.stringify({type:'doRun'}));

      clientCB();

    }catch(e){

      clientCB(e);
    }

  }, function(e){

    if (e) return callback(e);

    callback();
  });
};

TestCluster.prototype.end = function(){

  var _this = this;

  Object.keys(_this.__clients).forEach(function(clientId){

    var client = _this.__clients[clientId];

    try{

      client.remote.kill();
      //console.log('killed remote:::', clientId);
    }catch(e){
      console.warn('failed killing remote client: ' + clientId);
    }
  });
};

function TestHelper(){

}

TestHelper.prototype.getCluster = function(testId, size, init, clientSize, callback, consistency, delConsistency){

  var testCluster = new TestCluster();

  async.times(size, function(time, timeCB){

    var id = testId + '_' + time;

    var arguments = [];

    arguments.push('--id');

    arguments.push(id);

    arguments.push('--cache_id');

    arguments.push(testId);

    arguments.push('--mode');

    arguments.push('fixed_throughput');

    arguments.push('--init');

    arguments.push(init);

    arguments.push('--size');

    arguments.push(clientSize);

    arguments.push('--defer');

    if (consistency){
      // will do consistency amount of random sets and add them to the final log

      arguments.push('--consistency');
      arguments.push(consistency);
    }

    if (delConsistency){
      // will do consistency amount of random sets and add them to the final log

      arguments.push('--delConsistency');
      arguments.push(delConsistency);
    }

    testCluster.addClient(arguments, timeCB);

  }, function(e){

    if (e) return callback(e);

    callback(null, testCluster);

  });
};

module.exports = TestHelper;