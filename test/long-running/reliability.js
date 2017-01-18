describe('reliability tests', function() {

  this.timeout(20000);

  var INITIAL_SETS = 2000; //how many initial sets per node

  var GETS = 1000; //how many gets per node

  var MULTIPLE_INSTANCE_COUNT = 8;

  var CONSISTENCY = 250; // how many sets are logged for consistency verification, per node

  require('events').EventEmitter.defaultMaxListeners = Infinity;

  it('checks random sets and gets, over ' + MULTIPLE_INSTANCE_COUNT + ' instances, ensuring there is consistency throughout the various nodes', function(callback) {

    var _this = this;

    _this.timeout(MULTIPLE_INSTANCE_COUNT * 600000);

    var testId = require('shortid').generate();

    var TestHelper = require('../lib/helper');

    var testHelper = new TestHelper();

    testHelper.getCluster(testId, MULTIPLE_INSTANCE_COUNT, INITIAL_SETS, GETS, function(e, cluster){

      if (e) return callback(e);

      cluster.on('cluster-run-complete', function(){

        console.log('did cluster run, checking consistency:::');

        cluster.verifyConsistency(function(e, misses){

          cluster.end();

          if (e) return callback(e);

          if (misses > 0) return callback(new Error('consistency check failed, with ' + misses + ' misses.'));

          callback();
        });
      });

      cluster.start(function(e){
        if (e) return callback(e);
        console.log('STARTED:::');
      });

    }, CONSISTENCY);
  });

});