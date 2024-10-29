#!/bin/bash

# Build the Docker image
docker build --build-arg SECRETS_DIR=./secrets/ -t article-embedder .

# Run the Docker container in the background
docker -D run --name embedding-job --env-file .env -it --rm --user root article-embedder