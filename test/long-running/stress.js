describe('stress tests', function() {

  this.timeout(20000);

  var testId = require('shortid').generate();

  it('checks throughput per second single process, limited sets and gets', function(callback) {

    this.timeout(60000);

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

    client.startGetActivity({initialSets:1000000, limit:1000000, log:false});

    //15k per second cache memory hits
  });

  var INITIAL_SETS = 1000000; //how many initial sets per node

  var GETS = 1000000; //how many gets per node

  var MULTIPLE_INSTANCE_COUNT = 5;

  it('checks random sets and gets, over ' + MULTIPLE_INSTANCE_COUNT + ' instances, ensuring there is consistency throughout the various nodes', function(callback) {

    var _this = this;

    _this.timeout(MULTIPLE_INSTANCE_COUNT * 30000);

    var testId = require('shortid').generate();

    var TestHelper = require('../lib/helper');

    var testHelper = new TestHelper();

    testHelper.getCluster(testId, MULTIPLE_INSTANCE_COUNT, INITIAL_SETS, GETS, function(e, cluster){

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