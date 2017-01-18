REDIS LRU CACHE
---------------

*This composite cache has a memory LRU layer at the top for quick access - where a set amount of key value pairs are stored, then the data is cached in a redis instance or cluster, the redis cache has a configurable expiry, so that it does not grow uncontrollably. What makes this cache clever is that it also uses redis pub/sub to ensure that it can work nicely in clustered environments*

life-cycle of a SET request:

1. redis cache is updated, with configured expiry
2. lru cache is updated (item is bumped up if it already exists)
3. a listener is created with redis pub-sub to ensure changes that happen elsewhere result in a cache update
4. redis pub sub is called via an emit, to let everyone know

life-cycle of a GET request:

1. LRU cache is checked for item, if it exists item is returned
2. redis cache is checked for the item, if it exists LRU cache is updated and item is returned
3. if there is a retrieveItem method attached to the options, it is called to produce the missing item, REDIS cache and LRU cache are both updated and item is returned

life-cycle of a DEL request:

1. item is removed from LRU cache
2. unless called again, the item will eventually expire from the redis cache

dependancies:
-------------
- redis, v 2.8.3 and up

installation:
-------------

```javascript
npm install redis-lru-cache
```

usage:
-------------

```javascript

var RedisCache = require('redis-lru-cache');

var cache = new RedisCache({
    cacheId:'redis-lru-cache-redis-concurrent',//uniquely identifies your cache if it is used by multiple processes
    lru:{
      max:10000 //size of your memory cache, 5000 by default
    },
    clear:true //clear redis on instantiation, false by default
});

cache.set('/SET_TEST/1234', {test:"data"}, function(e){
...

cache.get('/SET_TEST/1234', function(e, data){
...

cache.remove('/SET_TEST/1234', function(e){
...

```