#!/bin/bash

# Ensures Docker BuildKit is enabled

# Build the Docker image
docker build --build-arg GCLOUD_PROJECT_ID=cms-misc-workloads \
             -t article-embedder . &> log-build.log

# Run the Docker container in the background
docker -D run --name embedding-job --env-file .env -it --rm --user root article-embedder &> log-run.log