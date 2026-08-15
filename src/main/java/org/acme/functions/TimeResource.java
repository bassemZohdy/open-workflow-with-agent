package org.acme.functions;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.jboss.logging.Logger;

/** Local time function backing {@code utility-functions.yaml#getCurrentTime}. */
@Path("/functions/time")
@Produces(MediaType.APPLICATION_JSON)
public class TimeResource {
    private static final Logger LOG = Logger.getLogger(TimeResource.class);

    @GET
    public Map<String, String> time(@QueryParam("timezone") String timezone) {
        if (timezone == null || timezone.isBlank()) {
            throw new BadRequestException("timezone is required");
        }
        try {
            ZoneId zone = ZoneId.of(timezone);
            LOG.infof("utility time executed timezone=%s", LogSanitizer.safe(timezone));
            return Map.of("timezone", timezone, "datetime", ZonedDateTime.now(zone).toString());
        } catch (java.time.DateTimeException e) {
            throw new BadRequestException("invalid IANA timezone: " + timezone);
        }
    }
}
