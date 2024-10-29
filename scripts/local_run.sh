#!/bin/bash

# Ensures Docker BuildKit is enabled

export GCLOUD_CONFIG=$(cat ./secrets/gcloud-config.json)

# Build the Docker image
docker build --no-cache --progress=plain --secret id=GCLOUD_CONFIG \
             --build-arg GCLOUD_PROJECT_ID=cms-misc-workloads \
             -t article-embedder . &> build.log

# Run the Docker container in the background
docker -D run --name embedding-job --env-file .env -it --rm --user root article-embedder