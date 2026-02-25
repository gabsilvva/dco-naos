import { exec } from "child_process";
import { basename } from "path";
import { promises as fs } from "fs";
import { promisify } from "util";
import { homedir } from "os";

const execAsync = promisify(exec);

function normalizeFontName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w-]/g, "");
}

async function isFontInstalled(
  name: string,
  platform: string
): Promise<boolean> {
  const normalizedFontName = normalizeFontName(name);

  try {
    if (platform === "linux" || platform === "darwin") {
      const { stdout } = await execAsync(
        `fc-list : family | grep -i "${name}" || true`
      );
      const installedFonts = stdout.toLowerCase().split("\n");

      return installedFonts.some((line) => {
        const normalizedLine = normalizeFontName(line);
        return (
          normalizedLine.includes(normalizedFontName) ||
          line.toLowerCase().includes(name.toLowerCase())
        );
      });
    } else if (platform === "win32") {
      try {
        const { stdout: regOutput } = await execAsync(
          `reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /s | findstr /i "${name}"`
        );
        if (regOutput.trim()) return true;
      } catch {}

      try {
        const { stdout: dirOutput } = await execAsync(
          `dir /b "%WINDIR%\\Fonts\\*${name.replace(/\s+/g, "*")}*" 2>nul`
        );
        return dirOutput.trim().length > 0;
      } catch {}
    }
  } catch (error) {
    console.warn(`Erro ao verificar fonte instalada: ${error}`);
  }

  return false;
}

async function isFontFileInstalled(
  file: string,
  platform: string
): Promise<boolean> {
  const baseFileName = basename(file).toLowerCase();

  try {
    if (platform === "linux") {
      const userFontsDir = `${homedir()}/.local/share/fonts`;
      const systemFontsDir = "/usr/share/fonts";

      try {
        await fs.access(`${userFontsDir}/${basename(file)}`);
        return true;
      } catch {}

      const { stdout } = await execAsync(
        `find ${systemFontsDir} -name "${baseFileName}" 2>/dev/null || true`
      );
      return stdout.trim().length > 0;
    } else if (platform === "darwin") {
      const userFontsDir = `${homedir()}/Library/Fonts`;
      const systemFontsDir = "/System/Library/Fonts";

      try {
        await fs.access(`${userFontsDir}/${basename(file)}`);
        return true;
      } catch {}

      try {
        await fs.access(`${systemFontsDir}/${basename(file)}`);
        return true;
      } catch {}
    } else if (platform === "win32") {
      try {
        await fs.access(`${process.env.WINDIR}\\Fonts\\${basename(file)}`);
        return true;
      } catch {}
    }
  } catch (error) {
    console.warn(`Erro ao verificar arquivo de fonte: ${error}`);
  }

  return false;
}

export async function font(fonts: any[]) {
  const results: boolean[] = [];
  const platform = process.platform;
  let needsCacheUpdate = false;

  for (const fontDef of fonts) {
    const alreadyInstalled =
      (await isFontInstalled(fontDef.name, platform)) &&
      (await isFontFileInstalled(String(fontDef.file), platform));

    if (alreadyInstalled) {
      console.log(`✓ Já instalada: ${fontDef.name} (${fontDef.file})`);
      results.push(true);
      continue;
    }

    try {
      const fullPath = `src/assets/font/${fontDef.file}`;
      const fontFileName = basename(fullPath);

      await fs.access(fullPath);

      if (platform === "linux") {
        const userFontsDir = `${homedir()}/.local/share/fonts`;
        await execAsync(`mkdir -p "${userFontsDir}"`);
        await execAsync(`cp "${fullPath}" "${userFontsDir}/"`);
      } else if (platform === "darwin") {
        const dest = `${homedir()}/Library/Fonts/`;
        await execAsync(`cp "${fullPath}" "${dest}"`);
      } else if (platform === "win32") {
        const script = `
          $fontPath = "${fullPath}"
          $name = "${fontDef.name}"
          $file = "${fontFileName}"
          
          Copy-Item -Path $fontPath -Destination "$env:WINDIR\\Fonts\\$file" -Force
          
          $regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
          try {
            New-ItemProperty -Path $regPath -Name "$name (TrueType)" -Value $file -PropertyType String -Force -ErrorAction SilentlyContinue
          } catch {}
          try {
            New-ItemProperty -Path $regPath -Name "$name (OpenType)" -Value $file -PropertyType String -Force -ErrorAction SilentlyContinue
          } catch {}
        `;

        await execAsync(
          `powershell -ExecutionPolicy Bypass -Command "${script}"`
        );
      } else {
        throw new Error(`Plataforma não suportada: ${platform}`);
      }

      console.log(`✓ Instalada com sucesso: ${fontDef.name} (${fontDef.file})`);
      results.push(true);

      if (platform === "linux") {
        needsCacheUpdate = true;
      }
    } catch (err) {
      console.error(`✗ Erro ao instalar "${fontDef.name}":`, err);
      results.push(false);
    }
  }

  if (needsCacheUpdate && platform === "linux") {
    try {
      console.log("🔄 Atualizando cache de fontes...");
      await execAsync("fc-cache -f");
      console.log("✓ Cache de fontes atualizado");
    } catch (error) {
      console.log("⚠️  Ignorando atualização de cache (fc-cache ausente)");
    }
  }

  return results;
}