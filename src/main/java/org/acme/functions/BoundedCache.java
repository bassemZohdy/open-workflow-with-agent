package org.acme.functions;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Size-capped, TTL-evicting in-memory map used as the backing store for the mock memory
 * store and HITL request registry.
 *
 * <p>Eviction is LRU once the cap is hit, and TTL expiry is lazy (read-triggered):
 * expired-but-unread entries linger until they are read or evicted by the size cap. That is
 * an acceptable trade-off for a mock store; use a real cache (e.g. Redis-backed) for
 * production-scale retention.
 */
final class BoundedCache<K, V> {
    private final long ttlMillis;
    private final Map<K, CacheEntry<V>> map;

    BoundedCache(int maxSize, long ttlMillis) {
        this.ttlMillis = ttlMillis;
        this.map = new LinkedHashMap<K, CacheEntry<V>>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, CacheEntry<V>> eldest) {
                return size() > maxSize;
            }
        };
    }

    synchronized void put(K key, V value) {
        map.put(key, new CacheEntry<>(value, System.currentTimeMillis()));
    }

    /** Returns the value for {@code key}, or {@code defaultValue} when absent or expired. */
    synchronized V getOrDefault(K key, V defaultValue) {
        CacheEntry<V> entry = map.get(key);
        if (entry == null) {
            return defaultValue;
        }
        if (System.currentTimeMillis() - entry.timestamp > ttlMillis) {
            map.remove(key);
            return defaultValue;
        }
        return entry.value;
    }

    /** Replaces an existing entry; returns the previous value or {@code null} when the key is unknown. */
    synchronized V replace(K key, V value) {
        CacheEntry<V> entry = map.get(key);
        if (entry == null) {
            return null;
        }
        V previous = entry.value;
        map.put(key, new CacheEntry<>(value, System.currentTimeMillis()));
        return previous;
    }

    synchronized boolean containsKey(K key) {
        return map.containsKey(key);
    }

    synchronized int size() {
        return map.size();
    }

    private static final class CacheEntry<V> {
        final V value;
        final long timestamp;

        CacheEntry(V value, long timestamp) {
            this.value = value;
            this.timestamp = timestamp;
        }
    }
}
