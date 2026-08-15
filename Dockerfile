# Stage 1: Build application with Maven & Temurin JDK 17
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

# Stage 2: Runtime image using Temurin JRE 17
FROM eclipse-temurin:17-jre-alpine
WORKDIR /deployments

ENV LANG='en_US.UTF-8' LANGUAGE='en_US:en'
ENV JAVA_OPTS="-Dquarkus.http.host=0.0.0.0 -Djava.util.logging.manager=org.jboss.logmanager.LogManager"

COPY --from=builder /workspace/target/quarkus-app/lib/ /deployments/lib/
COPY --from=builder /workspace/target/quarkus-app/*.jar /deployments/
COPY --from=builder /workspace/target/quarkus-app/app/ /deployments/app/
COPY --from=builder /workspace/target/quarkus-app/quarkus/ /deployments/quarkus/

# Runtime entrypoint: injects the scoped LiteLLM virtual key (see docker-compose.yml / litellm-keygen)
# before starting Quarkus.
COPY docker-entrypoint.sh /deployments/docker-entrypoint.sh
RUN chmod +x /deployments/docker-entrypoint.sh

EXPOSE 8080
USER 1001

ENTRYPOINT ["/deployments/docker-entrypoint.sh"]
