var EventEmitter = require("events").EventEmitter
  , LRU = require("lru-cache")
  , redis_pubsub = require("node-redis-pubsub")
  , redis = require("redis")
  , util = require('util')
  , Promise = require('bluebird')
  , sift = require('sift')
  , shortid = require('shortid')

function InternalCache(opts){

  var _this = this;

  try{

    if (opts == null) opts = {};

    if (!opts.cacheId) throw new Error('invalid or no cache id specified - caches must be identified to ensure continuity');

    _this.__cacheNodeId = opts.cacheId + '_' + Date.now() + '_' + shortid.generate();

    _this.__cacheId = opts.cacheId;

    _this.__subscriptions = {};

    _this.__stats = {
      memory:0,
      subscriptions:0,
      redis:0
    };

    if (!opts.lru) opts.lru = {};

    //handles cases where
    opts.lru.dispose = _this.__removeSubscription;

    if (!opts.lru.max) opts.lru.max = 5000; //caching 5000 data points in memory

    _this.__cache = LRU(opts.lru);

    _this.__eventEmitter = new EventEmitter();

    if (!opts.redis) opts.redis = {};

    opts.redis.prefix = _this.cacheId;

    var port = opts.redis.port || 6379;

    var url = opts.redis.url || '127.0.0.1';

    delete opts.redis.url;

    delete opts.redis.port;

    var pubsubOpts;// for use with redis pubsub

    pubsubOpts = JSON.parse(JSON.stringify(opts.redis));

    if (opts.redis.password) pubsubOpts.auth = opts.redis.password;

    pubsubOpts.scope = _this.__cacheId + '_pubsub';//separate data-layer for pubsub

    delete pubsubOpts.password;

    delete pubsubOpts.prefix;

    pubsubOpts.url = url;

    pubsubOpts.port = port;

    _this.__redisClient = redis.createClient(url, port, opts.redis);

    _this.__redisPubsub = new redis_pubsub(pubsubOpts);

  }catch(e){
    throw new Error('failed with cache initialization: ' + e.toString(), e);
  }
}

InternalCache.prototype.__removeSubscription = function(key, callback){

  var _this = this;

  if (_this.__subscriptions[key]) {

    _this.__subscriptions[key](function(e){

      if (e) {

        callback(e);
        return _this.__emit('error', new Error('failure removing redis subscription', e))
      }

      delete  _this.__subscriptions[key];

      _this.__stats.subscriptions --;

      if (callback) callback();
    });
  }
};

InternalCache.prototype.__updateLRUCache = function(key, item, callback){

  var _this = this;

  //update our LRU cache
  _this.__cache.set(key, item);

  if (_this.__subscriptions[key]) return callback(null, item);

  //create a subscription to changes, gets whacked on the opts.dispose method
  _this.__subscriptions[key] = _this.__redisPubsub.on(key, function(message){

    //we dont want a circular calamity
    if (message.origin != _this.__cacheId) _this.__cache.set(key, message.data);

  }, function(e){

    if (e) return callback(e);

    _this.__stats.subscriptions ++;

    callback(null, item);

  });
};

InternalCache.prototype.__updateRedisCache = function(key, item, callback){

  var _this = this;

  _this.__redisClient.set(key, item, callback);

};

InternalCache.prototype.__getFromRedisCache = function(key, callback){

  var _this = this;

  _this.__redisClient.get(key, function(e, found) {

    if (e) return callback(e);

    callback(null, found);

  });
};

InternalCache.prototype.__publishChange = function(key, val){

  var _this = this;

  _this.__redisPubsub.emit(key, {data:val, origin:_this.cacheNodeId});

};

InternalCache.prototype.get = function(key, callback){

  var _this = this;

  try{

    var returnValue = _this.__cache.get(key);

    //found something in memory
    if (returnValue) return callback(null, returnValue);

    //maybe in redis, but no longer in LRU?
    _this.__getFromRedisCache(key, function(e, found){

      if (e) return callback(e);

      //exists in redis, so we update LRU
      if (found) _this.__updateLRUCache(key, found, callback);

    });

  }catch(e){
    callback(e);
  }
};

InternalCache.prototype.set = function(key, val, callback){

  var _this = this;

  _this.__updateRedisCache(key, val, function(e){

    if (e) return callback(e);

    _this.__updateLRUCache(key, val, function(e){

      if (e) return callback(e);

      _this.__publishChange(key, val, callback);
    });
  });
};

InternalCache.prototype.reset = function(){

};

InternalCache.prototype.values = function(){

};

InternalCache.prototype.del = function(key){

};

InternalCache.prototype.__emit = function (key, data) {
  return this.__eventEmitter.emit(key, data);
};

InternalCache.prototype.on = function (key, handler) {
  return this.__eventEmitter.on(key, handler);
};

InternalCache.prototype.off = InternalCache.prototype.removeListener = function (key, handler) {
  return this.__eventEmitter.removeListener(key, handler);
};

InternalCache.prototype.size = function(){
  return this.__cache.length;
};

InternalCache.prototype.each = function(eachHandler, doneHandler){

};

InternalCache.prototype.disconnect =  Promise.promisify(function(callback){

  var _this = this;

  if (_this.__cache.length == 0) return callback();

  async.eachSeries(_this.__cache.keys(),
    function(key, keyCallback){
      _this.__removeSubscription(key, keyCallback);
    },
    callback
  );
});


function RedisLRUCache(opts) {

  this.__cache = new InternalCache(opts);

  this.__eventEmitter = new EventEmitter();
}

RedisLRUCache.prototype.__emit = function (key, data) {
  return this.__eventEmitter.emit(key, data);
};

RedisLRUCache.prototype.on = function (key, handler) {
  return this.__eventEmitter.on(key, handler);
};

RedisLRUCache.prototype.off = RedisLRUCache.prototype.removeListener = function (key, handler) {
  return this.__eventEmitter.removeListener(key, handler);
};

RedisLRUCache.prototype.__tryCallback = function(callback, data, e, clone){

  var callbackData = data;

  if (data && clone) callbackData = this.utilities.clone(data);

  if (e){
    if (callback) return callback(e);
    else throw e;
  }

  if (callback) return callback(null, callbackData);

  return callbackData;

};

RedisLRUCache.prototype.update = Promise.promisify(function(key, data, callback){

  try{

    if (typeof data == 'function'){
      callback = data;
      data = cache;
    }

    var result = this.__cache.get(key);

    if (result != null){

      result.data = data;
      this.__cache.set(key, result, result.ttl);
      return this.__tryCallback(callback, this.__cache.get(key), null);
    }

    this.__tryCallback(callback, null, null);

  }catch(e){
    return this.__tryCallback(callback, null, e);
  }
});

RedisLRUCache.prototype.increment = Promise.promisify(function(key, by, callback){

  try{

    var result = this.__cache.get(key);

    if (typeof result.data == 'number') {
      result.data += by;
      this.__cache.set(key, result);
      return this.__tryCallback(callback, result.data, null);
    }

    return this.__tryCallback(callback, null, null);
  }catch(e){
    return this.__tryCallback(callback, null, e);
  }
});

RedisLRUCache.prototype.get = Promise.promisify(function(key, opts, callback){

  try{

    if (key == null || key == undefined) return callback(new Error('invalid key'));

    if (typeof opts == 'function'){
      callback = opts;
      opts = null;
    }

    if (!opts) opts = {};

    var cached = this.__cache.get(key);

    if (cached) return this.__tryCallback(callback, cached.data, null, true);

    else {

      var _this = this;

      if (opts.retrieveMethod){

        opts.retrieveMethod.call(opts.retrieveMethod, function(e, result){

          if (e) return callback(e);

          // -1 and 0 are perfectly viable things to cache
          if (result == null || result == undefined) return _this.__tryCallback(callback, null, null);

          _this.set(key, result, opts, function(e){

            return _this.__tryCallback(callback, result, e, true);
          });
        });

      } else if (opts.default){

        var value = opts.default.value;

        delete opts.default.value;

        _this.set(key, value, opts.default, function(e){
          return _this.__tryCallback(callback, value, e, true);
        });

      } else return _this.__tryCallback(callback, null, null);
    }

  }catch(e){
    this.__tryCallback(callback, null, e)
  }
});

RedisLRUCache.prototype.clear = Promise.promisify(function(callback){
  if (this.__cache) this.__cache.reset();
  callback();
});

RedisLRUCache.prototype.set = Promise.promisify(function(key, data, opts, callback){
  try{

    if (key == null || key == undefined) return callback(new Error('invalid key'));

    if (typeof opts == 'function'){
      callback = opts;
      opts = null;
    }

    if (!opts) opts = {};

    var maxAge = undefined;
    if (opts.ttl) maxAge = opts.ttl;

    var cacheItem = {data:this.utilities.clone(data), key:key, ttl:opts.ttl};

    this.__cache.set(key, cacheItem, maxAge);

    callback(null, cacheItem);

  }catch(e){
    callback(e);
  }
});

RedisLRUCache.prototype.remove = Promise.promisify(function(key, opts, callback){
  try{

    if (key == null || key == undefined) return callback(new Error('invalid key'));

    if (typeof opts == 'function'){
      callback = opts;
      opts = null;
    }

    var existed = this.__cache.get(key);
    var removed = existed != null && existed != undefined;

    this.__cache.del(key);

    callback(null, removed);

  }catch(e){
    callback(e);
  }
});

RedisLRUCache.prototype.__all = function(){

  var returnItems = [];
  var values = this.__cache.values();

  values.forEach(function(value){
    returnItems.push(value.data);
  });

  return returnItems;
};

RedisLRUCache.prototype.all = Promise.promisify(function(filter, callback){

  try{

    if (typeof filter == 'function'){
      callback = filter;
      filter = null;
    }

    try{

      if (filter) return callback(null, sift({$and:[filter]}, this.__all()));
      else return callback(null, this.__all());

    }catch(e){
      return callback(e);
    }
  }catch(e){
    callback(e);
  }
});

RedisLRUCache.prototype.disconnect =  Promise.promisify(function(callback){

  return _this.__cache.disconnect(callback);

});

module.exports = RedisLRUCache;
