FROM node:18.15.0

WORKDIR /app

# Install Google Cloud SDK Dependencies
RUN apt-get update
RUN apt-get install apt-transport-https ca-certificates gnupg curl

COPY package*.json ./
COPY src/ ./src/

RUN npm install

# Install Google Cloud SDK
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && apt-get update -y && apt-get install google-cloud-cli -y

COPY . .

CMD ["node", "./entrypoint.js"]