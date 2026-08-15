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
 * that dev mode, the debug console, curl examples, and tests keep working unchanged. In prod
 * that would ship the endpoints fully open, so this guard refuses to start the application
 * unless {@code UTILITY_API_KEY} is set. (SmallRye Config cannot express "optional in dev,
 * required in prod" through {@code Optional} injection - empty values are coerced to null - so
 * the check is an explicit startup guard instead.)
 */
@ApplicationScoped
public class ProdSecurityDefaults {

    void verifyProdSecurity(@Observes StartupEvent event) {
        Config config = ConfigProvider.getConfig();
        String profile = config.getOptionalValue("quarkus.profile", String.class).orElse("prod");
        if (!"prod".equals(profile)) {
            return;
        }
        String apiKey = config.getOptionalValue("utility.api-key", String.class).orElse("");
        if (apiKey.isBlank()) {
            throw new IllegalStateException(
                    "UTILITY_API_KEY must be set in the %prod profile (container image / OpenShift Serverless Logic) "
                            + "- refusing to start with unauthenticated /functions/* and workflow endpoints");
        }
    }
}
