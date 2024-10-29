#!/bin/bash

# Name of the running container
CONTAINER_NAME="embedding-job"

# Check if the container is running
if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "Connecting to the running container: $CONTAINER_NAME"
    docker exec -it $CONTAINER_NAME /bin/bash
else
    echo "Container $CONTAINER_NAME is not running."
fi