# OpenShift Serverless Logic 1.38.0 workflow builder.
FROM registry.redhat.io/openshift-serverless-1/logic-swf-builder-rhel9:1.38.0 AS builder

COPY --chown=1001 . ./resources
RUN /home/kogito/launch/build-app.sh ./resources

FROM registry.access.redhat.com/ubi9/openjdk-17:latest

ENV LANG='en_US.UTF-8' LANGUAGE='en_US:en'
ENV AB_JOLOKIA_OFF=""
ENV JAVA_OPTS="-Dquarkus.http.host=0.0.0.0 -Djava.util.logging.manager=org.jboss.logmanager.LogManager"
ENV JAVA_APP_JAR="/deployments/quarkus-run.jar"

COPY --from=builder --chown=185 /home/kogito/serverless-workflow-project/target/quarkus-app/lib/ /deployments/lib/
COPY --from=builder --chown=185 /home/kogito/serverless-workflow-project/target/quarkus-app/*.jar /deployments/
COPY --from=builder --chown=185 /home/kogito/serverless-workflow-project/target/quarkus-app/app/ /deployments/app/
COPY --from=builder --chown=185 /home/kogito/serverless-workflow-project/target/quarkus-app/quarkus/ /deployments/quarkus/

EXPOSE 8080
USER 185
