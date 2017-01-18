describe('stress tests', function() {

  this.timeout(20000);

  var testId = require('shortid').generate();

  var INITIAL_SETS = 10000; //how many initial sets per node

  var GETS = 100000; //how many gets per node

  it('checks throughput per second single process, limited sets and gets', function(callback) {

    this.timeout(600000);

    var RandomClient = require('../lib/random-client');

    var client = new RandomClient(
      {testId:testId, cache:{cacheId:'test cache'}}
    );

    client.on('set-activity-run-complete', function(message){
      console.log('SETS-COMPLETE:::', message);
    });

    client.on('get-activity-run-complete', function(message){
      console.log('GETS-COMPLETE:::', message);
      callback();
    });

    client.startGetActivity({initialSets:INITIAL_SETS, limit:GETS, log:false});

    //15k per second cache memory hits
  });

  var MULTIPLE_INSTANCE_COUNT = 10;

  var MULTIPLE_INSTANCE_GETS = 10000;

  it('does ' + INITIAL_SETS + ' initial sets and ' + MULTIPLE_INSTANCE_GETS + ' gets, over ' + MULTIPLE_INSTANCE_COUNT + ' instances', function(callback) {

    var _this = this;

    _this.timeout(MULTIPLE_INSTANCE_COUNT * 600000);

    var testId = require('shortid').generate();

    var TestHelper = require('../lib/helper');

    var testHelper = new TestHelper();

    testHelper.getCluster(testId, MULTIPLE_INSTANCE_COUNT, INITIAL_SETS, MULTIPLE_INSTANCE_GETS, function(e, cluster){

      if (e) return callback(e);

      cluster.on('cluster-run-complete', function(){

        cluster.end();
        callback();
      });

      cluster.start(function(e){

        if (e) return callback(e);
        console.log('STARTED:::');
      });

    });
  });

});