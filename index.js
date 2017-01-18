var EventEmitter = require("events").EventEmitter
  , LRU = require("lru-cache")
  , redis_pubsub = require("node-redis-pubsub")
  , redis = require("redis")
  , util = require('util')
  , Promise = require('bluebird')
  , sift = require('sift')
  , shortid = require('shortid')
  , clone = require('clone')
  , async = require('async')
;

function CacheError(message, cause) {

  this.name = 'CacheError';
  this.code = 500;
  this.message = message;

  if (cause) this.cause = cause;
}

CacheError.prototype = Error.prototype;

function InternalCache(opts){

  var _this = this;

  try{

    if (opts == null) opts = {};

    if (!opts.cacheId) throw new CacheError('invalid or no cache id specified - caches must be identified to ensure continuity');

    if (!opts.redisExpire) opts.redisExpire = 1000 * 60 * 30; // redis values expire after 30 minutes

    _this.__redisExpire = opts.redisExpire;

    _this.__cacheNodeId = opts.cacheId + '_' + Date.now() + '_' + shortid.generate();

    _this.__cacheId = opts.cacheId;

    _this.__subscriptions = {};

    _this.__systemSubscriptions = {};

    _this.__stats = {
      memory:0,
      subscriptions:0,
      redis:0
    };

    if (!opts.lru) opts.lru = {};

    //handles cases where
    opts.lru.dispose = function(key){

      _this.__removeSubscription(key);

    }.bind(_this);

    if (!opts.lru.max) opts.lru.max = 5000; //caching 5000 data points in memory

    _this.__cache = LRU(opts.lru);

    _this.__eventEmitter = new EventEmitter();

    if (!opts.redis) opts.redis = {};

    opts.redis.prefix = _this.__cacheId;

    if (!opts.redis.port) opts.redis.port = 6379;

    var url = opts.redis.url || 'redis://127.0.0.1';

    delete opts.redis.url;

    var pubsubOpts;// for use with redis pubsub

    pubsubOpts = JSON.parse(JSON.stringify(opts.redis));

    if (opts.redis.password) pubsubOpts.auth = opts.redis.password;

    pubsubOpts.scope = _this.__cacheId + '_pubsub';//separate data-layer for pubsub

    delete pubsubOpts.password;

    delete pubsubOpts.prefix;

    pubsubOpts.url = url;

    _this.__redisClient = redis.createClient(url, opts.redis);

    _this.__redisPubsub = new redis_pubsub(pubsubOpts);

    _this.__systemSubscriptions['system/cache-reset'] = _this.__redisPubsub.on('system/cache-reset', function(message){

      if (message.origin != _this.cacheNodeId) _this.__cache.reset();

    });

    _this.__systemSubscriptions['system/cache-reset'] = _this.__redisPubsub.on('system/cache-reset', function(message){

      if (message.origin != _this.cacheNodeId) _this.__cache.reset();

    });

    _this.__systemSubscriptions['system/redis-error'] = _this.__redisClient.on('error', function(error){

        _this.emit('error', new CacheError('redis client error', error));
    });

    _this.__systemSubscriptions['system/redis-error'] = _this.__redisPubsub.on('error', function(error){

      _this.emit('error', new CacheError('redis pubsub error', error));
    });

    if (opts.clear) _this.reset(function(e){

      if (e) return _this.emit('error', new CacheError('cache clear on startup failed', e));
    });

  }catch(e){

    throw new CacheError('failed with cache initialization: ' + e.toString(), e);
  }
}

InternalCache.prototype.__removeSubscription = function(key, callback){

  var _this = this;

  if (_this.__subscriptions[key]) {

    _this.__subscriptions[key](function(e){

      if (e) {

        if (callback) callback(e);

        return _this.__emit('error', new CacheError('failure removing redis subscription, key: ' + key, e));
      }

      delete  _this.__subscriptions[key];

      _this.__stats.subscriptions --;

      _this.__emit('item-disposed', key);

      if (callback) callback();
    });
  }
};

InternalCache.prototype.__updateLRUCache = function(key, item, callback){

  var _this = this;

  //update our LRU cache
  _this.__cache.set(key, item);

  if (_this.__subscriptions[key]) {
    return callback(null, item);//we already have a change listener
  }

  //create a subscription to changes, gets whacked on the opts.dispose method
  _this.__subscriptions[key] = _this.__redisPubsub.on(key, function(message){

    //item has changed on a different node, we delete it from our cache, so the latest version can be re-fetched if necessary

    //origin introduced to alleviate tail chasing
    if (message.origin != _this.__cacheNodeId) return _this.del(key, function(e){
      if (e) _this.__emit('error', new CacheError('unable to clear cache after item was updated elsewhere, key: ' + key, e));
    });

  }, function(e){

    if (e) return callback(e);

    _this.__stats.subscriptions ++;

    callback(null, item);
  });
};

InternalCache.prototype.__updateRedisCache = function(key, item, callback){

  var _this = this;

  _this.__redisClient.setex(key, _this.__redisExpire, JSON.stringify(item), callback);

};

InternalCache.prototype.__getFromRedisCache = function(key, callback){

  var _this = this;

  _this.__redisClient.get(key, function(e, found) {

    if (e) return callback(e);

    if (found) return callback(null, JSON.parse(found));

    callback(null, null);

  });
};

InternalCache.prototype.__publishChange = function(key, val, callback){

  var _this = this;

  try{
    _this.__redisPubsub.emit(key, {data:val, origin:_this.__cacheNodeId});
    callback();
  }catch(e){
    callback(e);
  }

};

InternalCache.prototype.get = function(key, callback){

  var _this = this;

  try{

    var returnValue = _this.__cache.get(key);

    //found something in memory
    if (returnValue) return callback(null, returnValue);

    //maybe in redis, but no longer in LRU
    _this.__getFromRedisCache(key, function(e, found){

      if (e) return callback(e);

      //exists in redis, so we update LRU
      if (found) return _this.__updateLRUCache(key, found, function(e, updated){
        if (e) return callback(e);
        callback(null, updated);
      });

      return callback(null, null);

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

InternalCache.prototype.values = function(){
  return this.__cache.values();
};

InternalCache.prototype.del = function(key, callback){

  var _this = this;
  //only remove the item from the LRU cache, and unsubscribe, redis will take care of itself, as it will eventually time out.
  var disposedTimeout;

  var disposedHandler = function(disposedKey){

    if (disposedKey === key) {

      clearTimeout(disposedTimeout);

      _this.off('item-disposed', disposedHandler);

      return callback();
    }
  };
  //wait 5 seconds, then call back with a failure
  disposedTimeout = setTimeout(function(){

    clearTimeout(disposedTimeout);

    callback(new CacheError('failed to remove item from the cache'));

  }, 5000);

  this.on('item-disposed', disposedHandler);

  this.__cache.del(key);
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

  _this.__redisClient.quit();

  _this.__redisPubsub.quit();

  callback();

});

InternalCache.prototype.reset = function(callback){

  var _this = this;

  _this.__redisClient.flushdb( function (e, succeeded) {

    if (e) return callback(e);

    if (!succeeded) return callback(new CacheError('redis flush failed'));

    _this.__redisPubsub.emit('system/cache-reset', {origin:_this.__cacheNodeId});

    _this.__cache.reset();

    callback();

  });
};

function RedisLRUCache(opts) {

  var _this = this;

  _this.__cache = new InternalCache(opts);

  _this.__eventEmitter = new EventEmitter();

  if (opts.clear){

    _this.clear(function(e){

      if (e) return _this.__emit('error', new CacheError('failed clearing cache on startup', e));

      _this.__emit('cleared-on-startup', opts)
    });
  }
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

RedisLRUCache.prototype.__tryCallback = function(callback, data, e, doClone){

  var callbackData = data;

  if (data && doClone) callbackData = clone(data);

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

    var _this = this;

    if (key == null || key == undefined) return callback(new CacheError('invalid key'));

    if (typeof opts == 'function'){
      callback = opts;
      opts = null;
    }

    if (!opts) opts = {};

    _this.__cache.get(key, function(e, cached){

      if (e) return callback(e);

      if (cached) return _this.__tryCallback(callback, cached.data, null, true);

      else {

        if (opts.retrieveMethod){

          opts.retrieveMethod.call(opts.retrieveMethod, function(e, result){

            if (e) return callback(e);

            // -1 and 0 are perfectly viable things to cache
            if (result == null || result == undefined) return _this.__tryCallback(callback, null, null);

            _this.set(key, result, function(e, value){

              return _this.__tryCallback(callback, value, e, true);
            });
          });

        } else if (opts.default){

          _this.set(key, opts.default, function(e, value){
            return _this.__tryCallback(callback, value, e, true);
          });

        } else return _this.__tryCallback(callback, null, null);
      }
    });

  }catch(e){

    _this.__tryCallback(callback, null, e)
  }
});

RedisLRUCache.prototype.clear = Promise.promisify(function(callback){
  if (this.__cache) this.__cache.reset(callback);
  else callback(new Error('no cache available for reset'));
});

RedisLRUCache.prototype.set = Promise.promisify(function(key, val, callback){
  try{

    if (key == null || key == undefined) return callback(new CacheError('invalid key'));

    var cacheItem = {data:clone(val), key:key};

    this.__cache.set(key, cacheItem, function(e){

      if (e) return callback(e);

      callback(null, cacheItem);
    });

  }catch(e){
    callback(e);
  }
});

RedisLRUCache.prototype.remove = Promise.promisify(function(key, callback){
  try{

    if (key == null || key == undefined) return callback(new CacheError('invalid key'));

    this.__cache.del(key, callback);

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

  return this.__cache.disconnect(callback);

});

module.exports = RedisLRUCache;
