#!/bin/bash

# Build the Docker image
docker build -t article-embedder .

# Run the Docker container in the background
docker run --name embedding-job --env-file .env -it --rm article-embedder