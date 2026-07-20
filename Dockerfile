FROM node:20

# Instalar Oracle Instant Client
RUN apt-get update && apt-get install -y libaio1 unzip wget && \
    wget -q https://download.oracle.com/otn_software/linux/instantclient/2115000/instantclient-basic-linux.x64-21.15.0.0.0dbru.zip && \
    unzip -q instantclient-basic-linux.x64-21.15.0.0.0dbru.zip -d /opt/oracle && \
    rm instantclient-basic-linux.x64-21.15.0.0.0dbru.zip && \
    echo /opt/oracle/instantclient_21_15 > /etc/ld.so.conf.d/oracle-instantclient.conf && \
    ldconfig && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV ORACLE_IC=/opt/oracle/instantclient_21_15

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3046
CMD ["node", "api/server.js"]
