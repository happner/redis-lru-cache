describe('functional tests', function() {

  this.timeout(20000);

  var async = require('async');

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

      cacheService = new  service({
        cacheId:'redis-lru-cache'
      });

      callback();

  });

  after('stops the service', function(done) {

    if (!cacheService) return done(new Error('service was not started, so cannot be stopped'));

    cacheService.disconnect(done);

  });


  it('sets data', function(callback) {

    cacheService.set('/SET_TEST/123', {test:"data"}, callback);

  });

  it('gets data', function(callback) {

    cacheService.set('/SET_TEST/1234', {test:"data"}, function(e){

      if (e) return callback(e);

      cacheService.get('/SET_TEST/1234', function(e, data){

        if (e) return callback(e);

        expect(data.test).to.be("data");

        callback();

      });
    });
  });

  it('removes data', function(callback) {

    cacheService.set('/SET_TEST/12345', {test:"data"}, function(e){

      if (e) return callback(e);

      cacheService.remove('/SET_TEST/12345', function(e){

        if (e) return callback(e);

        callback();

      });
    });
  });

  it('adds until LRU full', function(callback) {

    this.timeout(10000);

    var size = 50;

    var attempts = 60;

    cacheService = new  service({
      cacheId:'redis-lru-cache',
      lru:{
        max:size
      }
    });

    var setOK = 0;

    async.times(attempts, function(attempt, iCB){

      cacheService.set('/test/max/' + attempt.toString(), {test:attempt.toString()}, function(e){

        if (e) return iCB(e);

        setOK++;

        iCB();

      });

    }, function(e){

      if (e) return callback(e);

      expect(setOK).to.be(attempts);

      expect(cacheService.__cache.size()).to.be(size);

      expect(cacheService.__cache.size() < setOK).to.be(true);
      //should be able to get the latest item
      cacheService.get('/test/max/' + (attempts - 1).toString(), function(e, data){

        if (e) return callback(e);

        expect(data.test).to.be((attempts - 1).toString());

        callback();

      });
    });
  });

  it('gets data from from redis', function(callback) {

    this.timeout(10000);

    var size = 50;

    var attempts = 60;

    cacheService = new  service({
      cacheId:'redis-lru-cache-redis-test',
      lru:{
        max:size
      }
    });

    var setOK = 0;

    async.times(attempts, function(attempt, iCB){

      cacheService.set('/test/redis/' + attempt.toString(), {test:attempt.toString()}, function(e){

        if (e) return iCB(e);

        setOK++;

        iCB();

      });

    }, function(e){

      if (e) return callback(e);

      var check = cacheService.__cache.__cache.get('/test/redis/1');

      expect(check).to.be(undefined);

      cacheService.get('/test/redis/1', function(e, data){

        expect(e).to.be(null);

        expect(data.test).to.be('1');

        check = cacheService.__cache.__cache.get('/test/redis/1');

        expect(check.data.test).to.be('1');

        callback();
      });
    });
  });

  it('clears a cache', function(callback){

    var cacheServiceClear = new  service({
      cacheId:'redis-lru-cache-test-clear'
    });

    cacheServiceClear.set('/RESET_TEST/1234', {test:"data"}, function(e){

      if (e) return callback(e);

      cacheServiceClear.get('/RESET_TEST/1234', function(e, data){

        if (e) return callback(e);

        expect(data.test).to.be("data");

        cacheServiceClear.clear(function(e){

          if (e) return callback(e);

          cacheServiceClear.get('/RESET_TEST/1234', function(e, data) {

            if (e) return callback(e);

            expect(data).to.be(null);

            callback();
          });
        });
      });
    });

  });

  it('starts 2 cache services pointing at same redis instance - changes item on 1 cache, ensure change is picked up on other cache', function(callback) {

    var size = 50;

    var cacheService1 = new  service({
      cacheId:'redis-lru-cache-redis-concurrent',
      lru:{
        max:size
      },
      clear:true
    });

    var cacheService2 = new  service({
      cacheId:'redis-lru-cache-redis-concurrent',
      lru:{
        max:size,
        clear:true
      }
    });

    cacheService1.set('/a/test/value', {test:1}, function(e){

      if (e) return callback(e);

      cacheService2.set('/a/test/value', {test:2}, function(e){

        if (e) return callback(e);

        setTimeout(function(){

          cacheService1.get('/a/test/value', function(e, value){

            if (e) return callback(e);

            expect(value.test).to.be(2);

            callback();
          });

        }, 1000);
      });
    });
  });
});