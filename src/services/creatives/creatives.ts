import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import path from "path";

import { promises as fs } from "fs";
import { Asset, assets, Svg, Video } from "@helper/assets";
import { uploadFile, uploadVideo, listFolders, deleteFolder } from "@action/minio/minio";
import { Medias, Media } from "@service/catalog/meta.types";
import { config } from "@/ecosystem.config";
import { Size, Identifier, Creative } from "./creatives.types";

export const fonts = [
  { name: "Geist Light", file: "Geist-Light.ttf", weight: 300, },
  { name: "Geist SemiBold", file: "Geist-SemiBold.ttf", weight: 600, },
  { name: "Gotham", file: "Gotham-Bold.ttf", weight: 700, },
  { name: "Gotham", file: "Gotham-Book.ttf", weight: 200, },
  { name: "Roboto", file: "Roboto-Bold.ttf", weight: 700, },
  { name: "Roboto", file: "Roboto-Regular.ttf", weight: 400, },
  { name: "Source Serif 4 18pt Light", file: "SourceSerif-Light.ttf", weight: 300, },
];

const sizes: Size[] = [
  {
    w: 1080,
    h: 1080,
    static: false,
  },
  {
    w: 1080,
    h: 1350,
    static: false,
  },
  {
    w: 1080,
    h: 1920,
    static: false,
  },
  {
    w: 300,
    h: 250,
    static: true,
  },
  {
    w: 160,
    h: 600,
    static: true,
  },
  {
    w: 728,
    h: 90,
    static: true,
  },
];

function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function animate() {
  return {
    fromLeft: (f: number, t: number, finalX: number, w?: number) => {
      const width = w ?? finalX;
      return -width + (finalX + width) * ease(Math.min(1, f / t));
    },
    fromRight: (f: number, t: number, finalX: number, w?: number, cW?: number) => {
      const width = w ?? finalX;
      const canvasWidth = cW ?? width;
      return canvasWidth + (finalX - canvasWidth) * ease(Math.min(1, f / t));
    },
    fromTop: (f: number, t: number, finalY: number, h?: number) => {
      const height = h ?? finalY;
      return -height + (finalY + height) * ease(Math.min(1, f / t));
    },
    fromBottom: (f: number, t: number, finalY: number, h?: number, cH?: number) => {
      const height = h ?? finalY;
      const canvasHeight = cH ?? height;
      return canvasHeight + (finalY - canvasHeight) * ease(Math.min(1, f / t));
    },
    opacity: (f: number, t: number, start = 0) =>
      f < start ? 0 : ease(Math.min(1, (f - start) / (t - start))),
    up: (f: number, t: number, finalY: number, distance: number) =>
      finalY + distance - distance * ease(Math.min(1, f / t)),
    down: (f: number, t: number, finalY: number, distance: number) =>
      finalY - distance + distance * ease(Math.min(1, f / t)),
    width: (f: number, t: number, finalWidth: number) =>
      finalWidth * ease(Math.min(1, f / t)),
  };
}

function tspan(
  text: string,
  x: number,
  maxLines = 3,
  fill?: string,
  weight?: number,
  size?: number,
  family?: string,
  lineHeight = 1.1,
  leadingDy?: number | string,
  maxWidth?: number
) {
  const words = text.split(' ');
  const lines: string[] = [];

  const estimateWidth = (str: string) =>
    str.split('').reduce((acc, char) => {
      if ('iIlj1|!.,;:\'"'.includes(char)) return acc + (size! * 0.3);
      if ('mwMW%'.includes(char)) return acc + (size! * 0.85);
      if (char >= 'A' && char <= 'Z' || char >= 'À' && char <= 'Ý') return acc + (size! * 0.72);
      if (char >= 'a' && char <= 'z' || char >= 'à' && char <= 'ÿ') return acc + (size! * 0.58);
      return acc + (size! * 0.6);
    }, 0);

  const splitEqual = () => {
    const totalWords = words.length;
    const base = Math.floor(totalWords / maxLines);
    const remainder = totalWords % maxLines;
    let cursor = 0;
    for (let i = 0; i < maxLines; i++) {
      const count = base + (i < remainder ? 1 : 0);
      const lineWords = words.slice(cursor, cursor + count);
      cursor += count;
      if (lineWords.length > 0) lines.push(lineWords.join(' '));
    }
  };

  if (maxWidth && size) {
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (currentLine && estimateWidth(test) > maxWidth) {
        if (lines.length < maxLines - 1) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = test;
        }
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length < maxLines) {
      lines.length = 0;
      splitEqual();
    }
  } else {
    splitEqual();
  }

  const lineHeightEm = `${lineHeight}em`;

  return lines.map((line, index) => {
    const dy = index === 0
      ? (leadingDy !== undefined ? (typeof leadingDy === 'number' ? `${leadingDy}em` : leadingDy) : 0)
      : lineHeightEm;

    return `<tspan
      x="${x}"
      dy="${dy}"
      fill="${fill}"
      font-weight="${weight}"
      font-size="${size}"
      font-family="${family}"
    >
      ${line}
    </tspan>`;
  }).join('\n');
}

async function deletion(folder: string, timestamp: string) {
  try {
    const folders = await listFolders(folder);

    if (!folders.length) {
      console.log(`Nenhuma pasta encontrada em "${folder}".`);
      return;
    }

    for (const f of folders) {
      const name = f.endsWith("/") ? f.slice(0, -1) : f;

      const parts = name.split("/");
      const lastSegment = parts[parts.length - 1];

      if (lastSegment !== String(timestamp)) {
        console.log(`🗑️ Deletando pasta antiga: ${name}`);
        await deleteFolder(name);
      } else {
        console.log(`✅ Mantendo pasta atual: ${name}`);
      }
    }
  } catch (error: any) {
    console.error("❌ Erro durante a exclusão de pastas:", error);
  }
}

async function render(
  dir: string,
  totalFrames: number,
  end: number,
  svg: (f: number, t: number) => string,
  w: number,
  h: number
) {
  let finalBuffer: Buffer | null = null;
  let staticFrameBuffer: Buffer | null = null;
  const framePaths: string[] = [];

  await fs.mkdir(dir, { recursive: true });

  for (let i = 0; i < totalFrames; i++) {
    const isStaticFrame = i >= end;
    const framePath = path.join(
      dir,
      `frame_${i.toString().padStart(4, "0")}.png`
    );
    framePaths.push(framePath);

    if (isStaticFrame && staticFrameBuffer) {
      await fs.writeFile(framePath, staticFrameBuffer);
      continue;
    }

    const template = svg(i, end);
    const buffer = await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    })
      .composite([{ input: Buffer.from(template), top: 0, left: 0 }])
      .png()
      .toBuffer();

    await fs.writeFile(framePath, buffer);
    
    finalBuffer = buffer;

    if (isStaticFrame && !staticFrameBuffer) {
      staticFrameBuffer = buffer;
    }
  }

  return { finalBuffer, framePaths };
}

async function video(
  pattern: string,
  out: string,
  fps: number,
  duration: number,
  backgroundVideo?: string,
  audio?: string
) {
  return new Promise<void>((res, rej) => {
    const cmd = ffmpeg();

    if (backgroundVideo) {
      cmd
        .input(backgroundVideo)
        .inputOptions(["-stream_loop", "-1"])
        .input(pattern)
        .inputOptions([`-framerate ${fps}`])
        .complexFilter([
          {
            filter: "overlay",
            options: { x: 0, y: 0 },
            inputs: ["0:v", "1:v"],
            outputs: "outv",
          },
        ])
        .outputOptions([
          "-map [outv]",
          "-map 0:a?",
        ]);
    } else {
      cmd
        .input(pattern)
        .inputOptions([`-framerate ${fps}`]);
      
      if (audio) {
        cmd
          .input(audio)
          .audioCodec("aac")
          .audioBitrate("128k");
      }
    }

    cmd
      .videoCodec("libx264")
      .outputOptions([
        "-pix_fmt yuv420p",
        "-preset veryfast",
        "-crf 23",
        "-movflags +faststart",
      ])
      .duration(duration)
      .output(out)
      .on("error", rej)
      .on("end", () => res())
      .run();
  });
}

async function image(
  svg: string,
  w: number,
  h: number,
  output: string
): Promise<void> {
  const buffer = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  await fs.writeFile(output, buffer);
}

async function generate(
  identifier: Identifier,
  svg: (
    f: number,
    t: number,
    size: Size,
    assets: Record<string, Svg>,
    backgroundVideo: Video | null,
    backgroundStatic: Svg | null
  ) => string,
  svgVideoThumbnail: ((
    size: Size,
    assets: Record<string, Svg>,
    backgroundStatic: Svg | null
  ) => string) | undefined,
  svgStatic: (
    size: Size,
    assets: Record<string, Svg>,
    backgroundStatic: Svg | null
  ) => string,
  bg: (size: Size) => string,
  elements: Asset[]
): Promise<Medias> {
  const { id, timestamp } = identifier;

  console.log("Iniciou:", id, new Date());

  const images: Media[] = [];
  const videos: Media[] = [];

  const fps = 25;
  const duration = 15;
  const totalFrames = fps * duration;
  const end = totalFrames;

  const folder = `${config.minio.folder}/${id}`;
  const asset = await assets(elements);

  const temp = path.resolve("temp");
  const output = path.join(temp, id);

  await fs.mkdir(temp, { recursive: true });

  try {
    await fs.mkdir(output, { recursive: true });

    for (const size of sizes) {
      const { w, h } = size;
      const name = `${w}x${h}`;
      const sub = `${folder}/${timestamp}`;

      let backgroundVideo: Video | null = null;
      let backgroundStaticAsset: Record<string, Svg> = {};

      if (size.static) {
        const imagePath = path.join(output, `${name}.png`);

        let backgroundStatic: Svg | null = null;
        const bgFile = bg(size);
        if (bgFile && bgFile.trim() !== "") {
          const isVideo = /\.(mp4|mov|avi|webm|mkv)$/i.test(bgFile) || /drive\.google\.com/i.test(bgFile);
          const bgStaticFile = isVideo ? bgFile.replace(/\.(mp4|mov|avi|webm|mkv)$/i, ".png") : bgFile;
          try {
            const result = await assets([{ key: "backgroundStatic", file: bgStaticFile }]);
            backgroundStatic = result.backgroundStatic as Svg;
          } catch (e) {
            console.warn(`⚠️ Não foi possível carregar backgroundStatic para svgStatic: ${bgStaticFile}`);
          }
        }

        const finalSvg = svgStatic(size, asset as Record<string, Svg>, backgroundStatic);

        await image(finalSvg, w, h, imagePath);

        const uploadImage = await uploadFile(imagePath, `${sub}/${name}.png`);

        if (uploadImage) {
          images.push({
            url: uploadImage,
            tag: [name]
          });
        }

        continue;
      }

      const backgroundFile = bg(size);

      if (backgroundFile && backgroundFile.trim() !== "") {
        const isVideo =
          /\.(mp4|mov|avi|webm|mkv)$/i.test(backgroundFile) ||
          /drive\.google\.com/i.test(backgroundFile);

        if (isVideo) {
          const backgroundAssets: Asset[] = [
            {
              key: "background",
              file: backgroundFile,
              type: "video",
            },
          ];

          const backgroundResult = await assets(backgroundAssets);
          backgroundVideo = backgroundResult.background as Video;

          const bgStatic = backgroundFile.replace(/\.(mp4|mov|avi|webm|mkv)$/i, ".png");
          const backgroundStaticAssets: Asset[] = [
            {
              key: "backgroundStatic",
              file: bgStatic,
            },
          ];

          try {
            const backgroundStaticResult = await assets(backgroundStaticAssets);
            backgroundStaticAsset = backgroundStaticResult as Record<string, Svg>;
          } catch (e) {
            console.warn(`⚠️ Não foi possível carregar background estático para thumbnail: ${bgStatic}`);
          }
        } else {
          try {
            const backgroundStaticResult = await assets([{ key: "backgroundStatic", file: backgroundFile }]);
            backgroundStaticAsset = backgroundStaticResult as Record<string, Svg>;
          } catch (e) {
            console.warn(`⚠️ Não foi possível carregar background estático: ${backgroundFile}`);
          }
        }
      }

      const frames = path.join(output, "frames");
      await fs.mkdir(frames, { recursive: true });

      const { finalBuffer } = await render(
        frames,
        totalFrames,
        end,
        (f, t) =>
          svg(f, t, size, asset as Record<string, Svg>, backgroundVideo, (backgroundStaticAsset.backgroundStatic as Svg) ?? null),
        w,
        h
      );

      const videoPath = path.join(output, `${name}.mp4`);
      const imagePath = path.join(output, `${name}.png`);
      const framePattern = path.join(frames, "frame_%04d.png");

      try {
        await video(
          framePattern,
          videoPath,
          fps,
          duration,
          backgroundVideo?.path,
          backgroundVideo ? undefined : `${config.assets}/audio/music.mp3`
        );
      } catch (videoError) {
        console.error(`❌ Erro ao gerar vídeo ${name}:`, videoError);
        continue;
      }

      if (backgroundVideo && svgVideoThumbnail) {
        try {
          const thumbnailSvg = svgVideoThumbnail(size, asset as Record<string, Svg>, (backgroundStaticAsset.backgroundStatic as Svg) ?? null);
          await image(thumbnailSvg, w, h, imagePath);
        } catch (imageError) {
          console.error(`❌ Erro ao gerar imagem estática ${name}:`, imageError);
          if (finalBuffer) await fs.writeFile(imagePath, finalBuffer);
        }
      } else {
        if (finalBuffer) await fs.writeFile(imagePath, finalBuffer);
      }

      const [uploadImage, uploadMotion] = await Promise.all([
        uploadFile(imagePath, `${sub}/${name}.png`),
        uploadVideo(videoPath, `${sub}/${name}.mp4`),
      ]);

      if (uploadImage) {
        images.push({
          url: uploadImage,
          tag: [name]
        });
      }

      if (uploadMotion) {
        videos.push({
          url: uploadMotion,
          tag: [name]
        });
      }

      await fs.rm(frames, {
        recursive: true,
        force: true,
      });
    }

    await fs.rm(output, {
      recursive: true,
      force: true,
    });

    await deletion(folder, timestamp);
  } catch (error) {
    console.error("❌ Erro na geração dos criativos:", error);
  } finally {
    await fs.rm(temp, {
      recursive: true,
      force: true,
    });
  }

  console.log("Finalizou:", id, new Date());

  return { images, videos };
}

export async function bioderma(identifier: Identifier, creative: Creative) {
  return generate(
    identifier,
    (f, t, size, assets, video, background) => {
      const { w, h } = size;

      const positions: Record<number, any> = {
        1080: {
          logo: {
            y: 40,
          },
          text: {
            l: 650,
            y: 120,
          },
          image: {
            r: 450,
            b: 20,
            h: 650,
          },
        },
        1350: {
          logo: {
            y: 65,
          },
          text: {
            l: 650,
            y: 220,
          },
          image: {
            r: 450,
            b: 20,
            h: 780,
          },
        },
        1920: {
          logo: {
            y: 80,
          },
          text: {
            l: 100,
            y: 1140,
          },
          image: {
            r: 70,
            b: 32,
            h: 900,
          },
        },
      };
      const position = positions[h];
      const storie = h == 1920;
      
      return `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <image
            href="${assets.logo.base64}"
            x="0"
            height="80"
            width="${w}"
            y="${animate().fromTop(f, 25, position.logo.y)}"
            opacity="${animate().opacity(f, 25)}"
          />

          <image
            href="${assets.image.base64}"
            height="${position.image.h}"
            y="${h - position.image.h - position.image.b}"
            x="${animate().fromLeft(f, 50, storie ? w / 2 : 0)}"
            opacity="${animate().opacity(f, 25)}"
            width="${w - position.image.r}"
            preserveAspectRatio="${storie ? "xMinYMid meet" : "xMaxYMid meet"}"
          />

          <text
            dominant-baseline="text-before-edge"
            y="${animate().fromTop(f, 25, position.text.y)}"
            opacity="${animate().opacity(f, 25)}"
          >
            ${tspan(creative.text1, position.text.l, 2, "#003B70", 700, 40, fonts[2].name, 1.1, 1, 400)}
            ${tspan(creative.text2, position.text.l, 4, "#000000", 700, 28, fonts[2].name, 1.1, 2.5, 350)}
            ${tspan(creative.text3, position.text.l, 4, "#000000", 300, 24, fonts[2].name, 1.1, 2.5, 300)}
            ${tspan(creative.text4, position.text.l, 3, "#003B70", 700, 32, fonts[2].name, 1.1, storie ? 3 : 6, 350)}
          </text>
        </svg>
      `;
    },
    (size, assets, background) => {
      const { w, h } = size;

      const positions: Record<number, any> = {
        1080: {
          logo: {
            y: 40,
          },
          text: {
            l: 650,
            y: 120,
          },
          image: {
            r: 450,
            b: 20,
            h: 650,
          },
        },
        1350: {
          logo: {
            y: 65,
          },
          text: {
            l: 650,
            y: 220,
          },
          image: {
            r: 450,
            b: 20,
            h: 780,
          },
        },
        1920: {
          logo: {
            y: 80,
          },
          text: {
            l: 100,
            y: 1140,
          },
          image: {
            r: 70,
            b: 32,
            h: 900,
          },
        },
      };
      const position = positions[h];
      const storie = h == 1920;
      
      return `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <image
            href="${background?.base64}"
            y="0"
            x="0"
            height="${h}"
            width="${w}"
          />

          <image
            href="${assets.logo.base64}"
            y="${position.logo.y}"
            x="0"
            height="80"
            width="${w}"
          />

          <image
            href="${assets.image.base64}"
            height="${position.image.h}"
            y="${h - position.image.h - position.image.b}"
            x="${storie ? w / 1.8 : 0}"
            width="${w - position.image.r}"
            preserveAspectRatio="${storie ? "xMinYMid meet" : "xMaxYMid meet"}"
          />

          <text
            dominant-baseline="text-before-edge"
            y="${position.text.y}"
          >
            ${tspan(creative.text1, position.text.l, 2, "#003B70", 700, 45, fonts[2].name, 1.1, 1, 400)}
            ${tspan(creative.text2, position.text.l, 3, "#000000", 700, 28, fonts[2].name, 1.1, 2.5, 350)}
            ${tspan(creative.text3, position.text.l, 4, "#000000", 300, 24, fonts[2].name, 1.1, 2.5, 300)}
            ${tspan(creative.text4, position.text.l, 3, "#003B70", 700, 32, fonts[2].name, 1.1, storie ? 3 : 6, 350)}
          </text>
        </svg>
      `;
    },
    (size, assets, background) => {
      const { w, h } = size;

      const positions: Record<number, any> = {
        250: {
          text: {
            y: 50,
            l: 175,
            w: 100,
          },
          image: {
            r: 140,
            b: 10,
            h: 180,
          },
        },
        600: {
          text: {
            y: 340,
            l: 20,
            w: 100,
          },
          image: {
            r: w,
            b: 275,
            h: 180,
          },
        },
        90: {
          text: {
            y: 8,
            l: 210,
            w: 190,
          },
          image: {
            r: 540,
            b: -5,
            h: h,
          },
        },
      };
      const position = positions[h];
      const vertical = h == 600;
      
      return `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <image
            href="${background?.base64}"
            y="0"
            x="0"
            height="${h}"
            width="${w}"
          />

          <image
            href="${assets.image.base64}"
            height="${position.image.h}"
            y="${h - position.image.h - position.image.b}"
            x="0"
            width="${vertical ? w : w - position.image.r}"
            preserveAspectRatio="${vertical ? "xMidYMid meet" : "xMaxYMid meet"}"
          />

          ${
            h == 90 ?
            `
              <text
                dominant-baseline="text-before-edge"
                y="0"
              >
                ${tspan(creative.text1, position.text.l, 2, "#003B70", 700, 13, fonts[2].name, 1.1, 1, position.text.w)}
                ${tspan(creative.text2, position.text.l, 3, "#000000", 700, 9, fonts[2].name, 1.1, 2, position.text.w)}
              </text>
              <text
                dominant-baseline="text-before-edge"
                y="${position.text.y}"
              >
                ${tspan(creative.text3, position.text.l + position.text.w, 4, "#000000", 300, 7, fonts[2].name, 1.1, 1, position.text.w)}
                ${tspan(creative.text4, position.text.l + position.text.w, 2, "#003B70", 700, 11, fonts[2].name, 1.1, 1.5, position.text.w)}
              </text>
            `
            :
            `
              <text
                dominant-baseline="text-before-edge"
                y="${position.text.y}"
              >
                ${tspan(creative.text1, position.text.l, 2, "#003B70", 700, 13, fonts[2].name, 1.1, 1, position.text.w)}
                ${tspan(creative.text2, position.text.l, 4, "#000000", 700, 9, fonts[2].name, 1.1, 2, position.text.w)}
                ${tspan(creative.text3, position.text.l, 5, "#000000", 300, 7, fonts[2].name, 1.1, 2, position.text.w)}
                ${tspan(creative.text4, position.text.l, 3, "#003B70", 700, 11, fonts[2].name, 1.1, 2, position.text.w)}
              </text>
            `
          }
        </svg>
      `;
    },
    (size) => `/background/bioderma_${size.w}x${size.h}.mp4`,
    [
      { key: "image", file: creative.image },
      { key: "logo", file: `/logo/bioderma.png` },
    ]
  );
}

export async function esthederm(identifier: Identifier, creative: Creative) {
  return generate(
    identifier,
    (f, t, size, assets, video, background) => {
      const { w, h } = size;

      const positions: Record<number, any> = {
        1080: {
          logo: {
            y: 50,
          },
          image: {
            y: 360,
            h: h * 0.5,
          },
          text1: {
            y: 130,
          },
          text2: {
            l: 455,
            y: 600,
          },
          text3: {
            l: 625,
          },
        },
        1350: {
          logo: {
            y: 130,
          },
          image: {
            y: 425,
            h: h * 0.5,
          },
          text1: {
            y: 210,
          },
          text2: {
            l: 430,
            y: 730,
          },
          text3: {
            l: 650,
          },
        },
        1920: {
          logo: {
            y: 380,
          },
          image: {
            y: 680,
            h: h * 0.43,
          },
          text1: {
            y: 460,
          },
          text2: {
            l: 400,
            y: 1060,
          },
          text3: {
            l: 680,
          },
        },
      };
      const position = positions[h];
      
      return `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <image
            href="${background?.base64}"
            x="0"
            y="0"
            height="${h}"
            width="${w}"
          />

          <image
            href="${assets.logo.base64}"
            x="0"
            height="80"
            width="${w}"
            y="${position.logo.y}"
            opacity="${animate().opacity(f, 25)}"
          />

          <image
            href="${assets.image.base64}"
            x="0"
            width="${w}"
            height="${position.image.h}"
            y="${animate().fromTop(f, 50, position.image.y)}"
          />

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${position.text1.y}"
            opacity="${animate().opacity(f, 25)}"
            font-style="italic"
          >
            ${tspan(creative.text1, w / 2, 2, "#000000", 300, 45, fonts[6].name, 1.1, 1, w / 1.5)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="end"
            y="${position.text2.y}"
            opacity="${animate().opacity(f, 25)}"
            letter-spacing="3px"
          >
            ${tspan(creative.text2, position.text2.l, 3, "#000000", 300, 22, fonts[0].name, 1.2, 1, 200)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            y="${position.text2.y - 50}"
            opacity="${animate().opacity(f, 25)}"
            letter-spacing="3px"
          >
            ${tspan(creative.text3, position.text3.l, 6, "#000000", 700, 24, fonts[1].name, 1.2, 1, 180)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${position.image.y + position.image.h + 90}"
            opacity="${animate().opacity(f, 25)}"
            letter-spacing="3px"
          >
            ${tspan(creative.text4, w / 2, 1, "#000000", 700, 24, fonts[1].name, 1, 1, w / 1.5)}
          </text>
        </svg>
      `;
    },
    undefined,
    (size, assets, background) => {
      const { w, h } = size;

      const positions: Record<number, any> = {
        250: {
          image: {
            y: 85,
            h: h * 0.55,
          },
          text1: {
            y: 30,
          },
          text2: {
            y: 130,
            l: 120,
          },
          text3: {
            l: 180,
          },
        },
        600: {
          image: {
            y: 200,
            h: h * 0.35,
          },
          text1: {
            y: 110,
          },
          text2: {
            y: 450,
            l: w / 2,
          },
          text3: {
            l: w / 2,
          },
        },
        90: {
          image: {
            y: 0,
            h: h,
          },
          text1: {
            y: 15,
          },
          text2: {
            y: 25,
            l: 500,
          },
          text3: {
            l: 800,
          },
        },
      };
      const position = positions[h];
      const vertical = h == 600;
      const horizontal = h == 90;
      
      return `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <image
            href="${background?.base64}"
            y="0"
            x="0"
            height="${h}"
            width="${w}"
          />

          <image
            href="${assets.image.base64}"
            height="${position.image.h}"
            y="${position.image.y}"
            x="0"
            width="${w}"
          />

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${position.text1.y}"
            font-style="italic"
          >
            ${tspan(creative.text1, horizontal ? 180 : w / 2, vertical ? 4 : 2, "#000000", 300, 14, fonts[6].name, 1.1, 1, w / 1.5)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="${vertical ? "middle" : "end"}"
            y="${position.text2.y}"
            letter-spacing="3px"
          >
            ${tspan(creative.text2, position.text2.l, 3, "#000000", 300, 8, fonts[0].name, 1.2, 1, w / 1.5)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="${vertical ? "middle" : "start"}"
            y="${vertical ? position.text2.y + 50 : position.text2.y - 10}"
            letter-spacing="3px"
          >
            ${tspan(creative.text3, position.text3.l, 6, "#000000", 700, 7, fonts[1].name, 1.2, 1, 50)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${position.image.y + position.image.h + 5}"
            letter-spacing="3px"
          >
            ${tspan(creative.text4, w / 2, vertical ? 2 : 1, "#000000", 700, 6, fonts[1].name, 1.2, 1, w / 1.2)}
          </text>
        </svg>
      `;
    },
    (size) => `/background/esthederm_${size.w}x${size.h}.png`,
    [
      { key: "image", file: creative.image },
      { key: "logo", file: `/logo/esthederm.png` },
    ]
  );
}

export async function etatpur(identifier: Identifier, creative: Creative) {
  return generate(
    identifier,
    (f, t, size, assets, video, background) => {
      const { w, h } = size;

      const position: Record<string, any> = {
        logo: {
          y: 50,
        },
        image: {
          y: 270,
          h: h == 1920 ? h * 0.5 : h * 0.62,
        },
        text1: {
          y: 120,
        },
        text2: {
          y: 600,
        },
      };
      const margins: Record<number, number> = {
        1080: 0,
        1350: 20,
        1920: 350,
      };
      const margin = (y: number) => y + margins[h];
      
      return `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <image
            href="${background?.base64}"
            x="0"
            y="0"
            height="${h}"
            width="${w}"
          />

          <image
            href="${assets.logo.base64}"
            x="0"
            height="64"
            width="${w}"
            y="${margin(position.logo.y)}"
            opacity="${animate().opacity(f, 25)}"
          />

          <image
            href="${assets.image.base64}"
            x="0"
            width="${w}"
            height="${position.image.h}"
            y="${animate().fromTop(f, 50, margin(position.image.y))}"
          />

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${margin(position.text1.y)}"
            opacity="${animate().opacity(f, 25)}"
            letter-spacing="3px"
          >
            ${tspan(creative.text1, w / 2, 1, "#000000", 700, 45, fonts[4].name, 1, 1, w / 1.5)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${margin(position.text2.y)}"
            opacity="${animate().opacity(f, 25)}"
            letter-spacing="3px"
          >
            ${tspan(creative.text2, (w / 4) - 40, 4, "#000000", 400, 26, fonts[4].name, 1.2, 1, 250)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${margin(position.text2.y - 150)}"
            opacity="${animate().opacity(f, 25)}"
            letter-spacing="3px"
          >
            ${tspan(creative.text3, ((w / 4) * 3) + 40, 4, "#000000", 400, 26, fonts[4].name, 1.2, 1, 250)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${margin(position.image.y) + position.image.h + 30}"
            opacity="${animate().opacity(f, 25)}"
            letter-spacing="3px"
          >
            ${tspan(creative.text4, w / 2, 1, "#000000", 700, 28, fonts[4].name, 1, 1, w / 1.5)}
          </text>
        </svg>
      `;
    },
    undefined,
    (size, assets, background) => {
      const { w, h } = size;

      const positions: Record<number, any> = {
        250: {
          text1: {
            y: 27,
          },
          image: {
            l: 0,
            y: 65,
            h: h * 0.63,
            w: w,
          },
          text2: {
            y: 120,
            x: 65,
          },
          text3: {
            y: 120,
            x: 240,
          },
        },
        600: {
          text1: {
            y: 85,
          },
          image: {
            l: 0,
            y: 150,
            h: h * 0.4,
            w: w,
          },
          text2: {
            y: 430,
            x: w / 2,
          },
          text3: {
            y: 530,
            x: w / 2,
          },
        },
        90: {
          text1: {
            y: 45,
          },
          image: {
            l: 20,
            y: 0,
            h: h,
            w: h,
          },
          text2: {
            y: 20,
            x: w / 1.7,
          },
          text3: {
            y: 20,
            x: w / 1.2,
          },
        },
      };
      const position = positions[h];
      const horizontal = h == 90;
      const vertical = h == 600;
      
      return `
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <image
            href="${background?.base64}"
            y="0"
            x="0"
            height="${h}"
            width="${w}"
          />

          <image
            href="${assets.image.base64}"
            height="${position.image.h}"
            y="${position.image.y}"
            x="${position.image.l}"
            width="${position.image.w}"
          />

          <text
            dominant-baseline="text-before-edge"
            text-anchor="${horizontal ? "start" : "middle"}"
            y="${position.text1.y}"
            letter-spacing="3px"
          >
            ${tspan(creative.text1, horizontal ? 130 : w / 2, vertical ? 2 : 1, "#000000", 700, 14, fonts[4].name, 1, 1, w / 1.5)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${horizontal ? 1000 : position.image.y + position.image.h + 5}"
            letter-spacing="3px"
          >
            ${tspan(creative.text4, w / 2, vertical ? 2 : 1, "#000000", 700, 6, fonts[4].name, 1.2, 1, w / 1.5)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${position.text2.y}"
            letter-spacing="3px"
          >
            ${tspan(creative.text2, position.text2.x, 4, "#000000", 400, 8, fonts[4].name, 1.2, 1, 80)}
          </text>

          <text
            dominant-baseline="text-before-edge"
            text-anchor="middle"
            y="${position.text3.y}"
            letter-spacing="3px"
          >
            ${tspan(creative.text3, position.text3.x, 4, "#000000", 400, 8, fonts[4].name, 1.2, 1, 80)}
          </text>
        </svg>
      `;
    },
    (size) => `/background/etatpur_${size.w}x${size.h}.png`,
    [
      { key: "image", file: creative.image },
      { key: "logo", file: `/logo/etatpur.png` },
    ]
  );
}