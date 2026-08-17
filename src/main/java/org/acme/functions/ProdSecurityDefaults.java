package org.acme.functions;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;

import io.quarkus.runtime.StartupEvent;

/**
 * Fail-fast security defaults for the {@code %prod} profile (what the container image and
 * OpenShift Serverless Logic run).
 *
 * <p>The {@link ApiKeyAuthFilter} treats a blank {@code utility.api-key} as "auth disabled" so
 * that dev mode, the debug console, curl examples, and tests keep working unchanged. Any
 * non-development profile must fail fast instead of becoming an unauthenticated deployment
 * merely because an operator selected a custom profile name.
 */
@ApplicationScoped
public class ProdSecurityDefaults {

    void verifyProdSecurity(@Observes StartupEvent event) {
        Config config = ConfigProvider.getConfig();
        String profile = config.getOptionalValue("quarkus.profile", String.class).orElse("prod");
        if (isDevelopmentProfile(profile)) {
            return;
        }
        String apiKey = config.getOptionalValue("utility.api-key", String.class).orElse("");
        if (apiKey.isBlank()) {
            throw new IllegalStateException(
                    "UTILITY_API_KEY must be set in the %prod profile (container image / OpenShift Serverless Logic) "
                            + "- refusing to start with unauthenticated agent and workflow endpoints");
        }
    }

    private static boolean isDevelopmentProfile(String profile) {
        return "dev".equals(profile) || "test".equals(profile) || "test-with-reload".equals(profile);
    }
}
