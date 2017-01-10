REDIS LRU CACHE
---------------

*This composite cache has an LRU layer - where a set amount of key value pairs are stored in memory, then the data is cached in a redis instance or cluster, the redis cache has a configurable expiry, so that it does not grow uncontrollably. What makes this cache clever is that it also uses redis pub/sub to ensure that it can work nicely in clustered environments*

life-cycle of a SET request:

1. redis cache is updated, with configured expiry
2. lru cache is updated (item is bumped up if it already exists)
3. a listener is created with redis pub-sub to ensure changes that happen elsewhere result in a cache update
4. redis pub sub is called via an emit, to let everyone know

life-cycle of a GET request:

1. LRU cache is checked for item, if it exists item is returned
2. redis cache is checked for the item, if it exists LRU cache is updated and item is returned
3. if there is a retrieveItem method attached to the options, it is called to produce the missing item, REDIS cache and LRU cache are both updated and item is returned


dependancies:
-------------
- redis, v 2.8.3 and up

installation:
-------------

```javascript

```

usage:
-------------

```javascript

```