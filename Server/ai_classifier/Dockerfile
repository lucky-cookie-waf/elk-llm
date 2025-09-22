FROM node:18-alpine
WORKDIR /app

RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    gcc \
    g++ \
    musl-dev \
    linux-headers

RUN ln -sf python3 /usr/bin/python

COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

COPY model_inference.py ./

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3002

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

RUN chown -R nodejs:nodejs /app

USER nodejs

CMD ["npm", "start"]