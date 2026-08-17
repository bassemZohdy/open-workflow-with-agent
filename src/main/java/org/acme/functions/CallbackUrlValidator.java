package org.acme.functions;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Validates callback destinations before the bundled mock agent makes a server-side
 * request. Hosts listed in {@code agent.callback.allowed-hosts} are explicit deployment
 * exceptions (for example, localhost in the local test profile); all other destinations
 * must resolve to publicly routable addresses.
 */
final class CallbackUrlValidator {

    static final int MAX_URL_LENGTH = 2_048;

    private final Set<String> allowedHosts;

    CallbackUrlValidator(String configuredAllowedHosts) {
        allowedHosts = Arrays.stream((configuredAllowedHosts == null ? "" : configuredAllowedHosts).split(","))
                .map(String::trim)
                .filter(host -> !host.isEmpty())
                .map(CallbackUrlValidator::normalizeHost)
                .collect(Collectors.toUnmodifiableSet());
    }

    URI validate(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new IllegalArgumentException("callback_url must not be blank");
        }
        if (rawUrl.length() > MAX_URL_LENGTH) {
            throw new IllegalArgumentException("callback_url exceeds the maximum length of " + MAX_URL_LENGTH);
        }

        final URI uri;
        try {
            uri = URI.create(rawUrl);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("callback_url is not a valid URI", e);
        }

        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("callback_url must use http or https");
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("callback_url must contain a hostname");
        }
        if (uri.getUserInfo() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("callback_url must not contain user info or a fragment");
        }

        String host = normalizeHost(uri.getHost());
        if (allowedHosts.contains(host)) {
            return uri;
        }

        try {
            InetAddress[] addresses = InetAddress.getAllByName(uri.getHost());
            if (addresses.length == 0 || Arrays.stream(addresses).anyMatch(CallbackUrlValidator::isNonPublicAddress)) {
                throw new IllegalArgumentException("callback_url resolves to a private, loopback, link-local, or reserved address");
            }
        } catch (java.net.UnknownHostException e) {
            throw new IllegalArgumentException("callback_url hostname cannot be resolved", e);
        }
        return uri;
    }

    private static String normalizeHost(String host) {
        String normalized = host.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("[") && normalized.endsWith("]")) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        return normalized.endsWith(".") ? normalized.substring(0, normalized.length() - 1) : normalized;
    }

    private static boolean isNonPublicAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        if (address instanceof Inet6Address) {
            byte[] bytes = address.getAddress();
            // IPv6 unique-local addresses (fc00::/7) are not covered consistently by
            // InetAddress.isSiteLocalAddress across JDK versions.
            return (bytes[0] & 0xfe) == 0xfc;
        }
        return false;
    }
}
