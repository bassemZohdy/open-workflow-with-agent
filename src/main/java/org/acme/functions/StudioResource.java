package org.acme.functions;

import java.io.InputStream;
import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * Serves the packaged Studio shell and provides history fallback for extensionless Studio
 * routes. Hashed assets are served from the same classpath tree without exposing arbitrary
 * classpath resources; path traversal and backslash forms are rejected before lookup.
 */
@ApplicationScoped
@Path("/studio")
public class StudioResource {

    private static final String ROOT = "META-INF/resources/studio/";
    private static final String CONTENT_SECURITY_POLICY = String.join("; ",
            "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'self'",
            "form-action 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
            "font-src 'self'", "connect-src 'self'");
    private static final Map<String, String> MEDIA_TYPES = Map.of(
            ".css", "text/css",
            ".html", MediaType.TEXT_HTML,
            ".js", "text/javascript",
            ".json", MediaType.APPLICATION_JSON,
            ".map", "application/json",
            ".svg", "image/svg+xml",
            ".woff", "font/woff",
            ".woff2", "font/woff2"
    );

    @GET
    public Response index() {
        return serve("index.html", MediaType.TEXT_HTML);
    }

    @GET
    @Path("{path: .+}")
    public Response route(@PathParam("path") String path) {
        if (!isSafeRelativePath(path)) {
            throw new NotFoundException();
        }

        String normalized = path.endsWith("/") ? "index.html" : path;
        String extension = extensionOf(normalized);
        if (extension.isEmpty()) {
            return serve("index.html", MediaType.TEXT_HTML);
        }
        String mediaType = MEDIA_TYPES.get(extension);
        if (mediaType == null) {
            throw new NotFoundException();
        }
        return serve(normalized, mediaType);
    }

    private Response serve(String relativePath, String mediaType) {
        String resourceName = ROOT + relativePath;
        InputStream stream = Thread.currentThread().getContextClassLoader().getResourceAsStream(resourceName);
        if (stream == null) {
            throw new NotFoundException();
        }
        return Response.ok(stream).type(mediaType)
                .header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
                .header("X-Content-Type-Options", "nosniff")
                .header("Referrer-Policy", "same-origin")
                .build();
    }

    private static boolean isSafeRelativePath(String path) {
        return path != null
                && !path.isBlank()
                && !path.contains("\\")
                && !path.contains("\0")
                && !path.startsWith("/")
                && !path.contains("..")
                && !path.endsWith(".");
    }

    private static String extensionOf(String path) {
        int dot = path.lastIndexOf('.');
        return dot < 0 ? "" : path.substring(dot).toLowerCase();
    }
}
