FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

# Backup initial content outside volume mount point
RUN mkdir -p /tmp/seed && \
    cp -r concepts scenes meta scripts dashboard index.json /tmp/seed/

EXPOSE 3000

CMD ["sh", "start.sh"]
