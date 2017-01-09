describe('stress tests', function() {

  this.timeout(20000);

  var expect = require('expect.js');

  var service = require('../index');

  var testId = require('shortid').generate();

  var cacheService;

  var dataService = {

    clearItems: function(){

    },

    items:{},

    handleItemNotFound:function(key, callback){

    },
    handleItemSet:function(key, value, callback){

    }
  };

  before('should initialize the service', function(callback) {

    try{

      cacheService = new  service({
        cacheId:'redis-lru-cache'
      });

    }catch(e){

      callback(e);
    }

  });

  after('stops the service', function(done) {

    if (!cacheService) return done(new Error('service was not started, so cannot be stopped'));

    cacheService.disconnect(done);

  });


  it('sets data', function(callback) {

    cacheService.set('/SET_TEST/123', {test:"data"}, callback);

  });

  xit('gets data', function(callback) {

  });

  xit('removes data', function(callback) {

  });

  xit('adds until LRU full, checks cache-full event', function(callback) {

  });

  xit('gets data from from redis', function(callback) {

  });

  xit('starts 2 cache services pointing at same redis instance - changes item on 1 cache, ensure change is picked up on other cache', function(callback) {

  });

  xit('starts 2 cache services pointing at same redis instance - removes item on 1 cache, ensure change is picked up on other cache', function(callback) {

  });

});