package org.acme.functions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

/** Unit coverage for the {@link BoundedCache} size-eviction and TTL-expiry behavior. */
class BoundedCacheTest {

    @Test
    void evictsEldestEntryWhenSizeCapIsExceeded() {
        BoundedCache<String, String> cache = new BoundedCache<>(2, 60_000);
        cache.put("a", "1");
        cache.put("b", "2");
        cache.put("c", "3"); // exceeds cap -> "a" (insertion-order eldest) evicted

        assertEquals(2, cache.size());
        assertNull(cache.getOrDefault("a", null));
        assertEquals("2", cache.getOrDefault("b", null));
        assertEquals("3", cache.getOrDefault("c", null));
    }

    @Test
    void refreshMovesEntryToMostRecentlyUsedPosition() {
        BoundedCache<String, String> cache = new BoundedCache<>(2, 60_000);
        cache.put("a", "1");
        cache.put("b", "2");
        cache.getOrDefault("a", null); // touch "a" -> LRU order becomes b, a
        cache.put("c", "3"); // exceeds cap -> "b" evicted

        assertNull(cache.getOrDefault("b", null));
        assertEquals("1", cache.getOrDefault("a", null));
        assertEquals("3", cache.getOrDefault("c", null));
    }

    @Test
    void returnsDefaultForExpiredEntriesAfterTtl() throws InterruptedException {
        BoundedCache<String, String> cache = new BoundedCache<>(10, 50);
        cache.put("key", "value");
        assertEquals("value", cache.getOrDefault("key", "missing"));

        Thread.sleep(100); // exceed the 50ms TTL

        assertNull(cache.getOrDefault("key", null));
        assertEquals("missing", cache.getOrDefault("key", "missing"));
    }

    @Test
    void replaceUpdatesExistingEntryAndReturnsPreviousValue() {
        BoundedCache<String, String> cache = new BoundedCache<>(10, 60_000);
        assertNull(cache.replace("missing", "x"));

        cache.put("key", "old");
        assertEquals("old", cache.replace("key", "new"));
        assertEquals("new", cache.getOrDefault("key", null));
    }
}
