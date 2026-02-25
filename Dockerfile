FROM node:20.14.0-bullseye
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    make \
    g++ \
    curl \
    ca-certificates \
    openssl \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

RUN which ffmpeg && ffmpeg -version \
    && ln -sf /usr/bin/ffmpeg /usr/local/bin/ffmpeg \
    && chmod +x /usr/bin/ffmpeg

ENV PATH="$PATH:/usr/bin"

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/
RUN npm install
RUN npm install sharp --platform=linux --arch=x64
RUN npx prisma generate
COPY src ./src/

RUN mkdir -p /workspace/.fonts && \
    cp src/assets/font/*.ttf /workspace/.fonts/ && \
    fc-cache -f -v

RUN node -e "const ffmpeg = require('fluent-ffmpeg'); ffmpeg.setFfmpegPath('/usr/bin/ffmpeg'); console.log('FFmpeg configurado');"

EXPOSE 3000
CMD ["npm", "start"]