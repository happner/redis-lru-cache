describe('benchmark tests', function() {

  this.timeout(20000);

  var expect = require('expect.js');

  var testId = require('shortid').generate();

  var COUNT = 1000;

  // before('should initialize the service', function(callback) {
  //   callback();
  // });
  //
  // after(function(done) {
  //   done();
  // });

  it('checks throughput per second single process, limited sets and gets', function(callback) {

    this.timeout(60000);

    var START;

    var RandomClient = require('./lib/random-client');

    var client = new RandomClient(
      {testId:testId, cache:{cacheId:'test cache'}}
    );

    client.on('set-activity-run-complete', function(message){

      var SET_DURATION = (Date.now() - START);

      console.log(COUNT + ' SETS COMPLETE IN ' + SET_DURATION + ' ms');

      console.log('TOTALS:::', message.totals);
    });

    client.on('get-activity-run-complete', function(message){

      var GET_DURATION = (Date.now() - START);

      console.log(COUNT + ' GETS COMPLETE IN ' + GET_DURATION + ' ms');

      console.log('TOTALS:::', message.totals);
      callback();
    });

    START = Date.now();

    client.startGetActivity({initialSets:COUNT, limit:COUNT, log:true});

    //15k per second cache memory hits
  });

  var MULTIPLE_INSTANCE_COUNT = 10;

  var MULTIPLE_INSTANCE_OPCOUNT = 10;

  var randomCluster;

  it('checks throughput per second, ' + MULTIPLE_INSTANCE_COUNT + ' instances limited sets and gets', function(callback) {

    var _this = this;

    _this.timeout(MULTIPLE_INSTANCE_COUNT * 30000);

    var testId = require('shortid').generate();

    var TestHelper = require('./lib/helper');

    var testHelper = new TestHelper();

    // function(testId, size, init, clientSize, callback){

    testHelper.getCluster(testId, MULTIPLE_INSTANCE_COUNT, MULTIPLE_INSTANCE_OPCOUNT, MULTIPLE_INSTANCE_OPCOUNT, function(e, cluster){

      if (e) return callback(e);

      randomCluster = cluster;

      cluster.on('cluster-run-complete', function(data){

        callback();
      });

      cluster.start(function(e){
        if (e) return callback(e);
        console.log('STARTED:::');
      });
    });
  });

  after('kills the remote cluster instances', function(callback){

    this.timeout(60000);

    if (randomCluster != null) randomCluster.end();

    callback();

  });

});