package org.acme.functions;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;

import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.jboss.logging.Logger;

@Path("/functions")
@Produces(MediaType.APPLICATION_JSON)
public class UtilityResource {
    private static final Logger LOG = Logger.getLogger(UtilityResource.class);

    @GET
    @Path("/time")
    public Map<String, String> time(@QueryParam("timezone") String timezone) {
        if (timezone == null || timezone.isBlank()) {
            throw new BadRequestException("timezone is required");
        }
        try {
            ZoneId zone = ZoneId.of(timezone);
            LOG.infof("utility time executed timezone=%s", timezone);
            return Map.of("timezone", timezone, "datetime", ZonedDateTime.now(zone).toString());
        } catch (java.time.DateTimeException e) {
            throw new BadRequestException("invalid IANA timezone: " + timezone);
        }
    }

    @POST
    @Path("/calculator")
    @Consumes(MediaType.APPLICATION_JSON)
    public Map<String, Object> calculate(Map<String, String> request) {
        String expression = request == null ? null : request.get("expression");
        if (expression == null || expression.isBlank()) {
            throw new BadRequestException("expression is required");
        }
        try {
            double result = new ExpressionParser(expression).parse();
            LOG.infof("utility calculator executed expression=%s result=%s", expression, result);
            return Map.of("expression", expression, "result", result);
        } catch (RuntimeException e) {
            throw new BadRequestException("invalid arithmetic expression");
        }
    }

    private static final class ExpressionParser {
        private final String input;
        private int position;

        ExpressionParser(String input) { this.input = input; }

        double parse() {
            double value = expression();
            skipWhitespace();
            if (position != input.length()) throw new IllegalArgumentException();
            return value;
        }

        private double expression() {
            double value = term();
            while (true) {
                skipWhitespace();
                if (match('+')) value += term();
                else if (match('-')) value -= term();
                else return value;
            }
        }

        private double term() {
            double value = factor();
            while (true) {
                skipWhitespace();
                if (match('*')) value *= factor();
                else if (match('/')) value /= factor();
                else return value;
            }
        }

        private double factor() {
            skipWhitespace();
            if (match('(')) {
                double value = expression();
                if (!match(')')) throw new IllegalArgumentException();
                return value;
            }
            int start = position;
            if (match('-')) return -factor();
            while (position < input.length() && (Character.isDigit(input.charAt(position)) || input.charAt(position) == '.')) position++;
            if (start == position) throw new IllegalArgumentException();
            return Double.parseDouble(input.substring(start, position));
        }

        private boolean match(char expected) {
            if (position < input.length() && input.charAt(position) == expected) { position++; return true; }
            return false;
        }

        private void skipWhitespace() { while (position < input.length() && Character.isWhitespace(input.charAt(position))) position++; }
    }
}
