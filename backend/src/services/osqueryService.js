// backend/src/services/osqueryService.js
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const OSQUERY_RELEASES_URL = 'https://api.github.com/repos/osquery/osquery/releases';
const OSQUERY_DIR = path.join(__dirname, '..', '..', 'updates', 'osquery');
const VERSIONS_DIR = path.join(OSQUERY_DIR, 'versions');

// Garante que os diretórios existam
if (!fs.existsSync(OSQUERY_DIR)) fs.mkdirSync(OSQUERY_DIR, { recursive: true });
if (!fs.existsSync(VERSIONS_DIR)) fs.mkdirSync(VERSIONS_DIR, { recursive: true });

/**
 * Busca as últimas 5 versões estáveis do Osquery no GitHub.
 */
async function getLatestReleases() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'Doc-IT-Server' }
    };
    https.get(OSQUERY_RELEASES_URL, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const releases = JSON.parse(data);
          if (!Array.isArray(releases)) return resolve([]);
          
          const versions = releases.slice(0, 5).map(r => {
            // Busca o asset .zip para Windows (x86_64)
            const zipAsset = r.assets.find(a => a.name.endsWith('.zip') && a.name.includes('x86_64'));
            return {
              version: r.tag_name,
              published_at: r.published_at,
              zip_url: zipAsset ? zipAsset.browser_download_url : null
            };
          }).filter(v => v.zip_url); // Garante que temos a URL do ZIP
          
          resolve(versions);
        } catch (e) {
          reject(new Error('Falha ao processar lista do GitHub: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Sincroniza uma versão específica: baixa o ZIP e extrai o osqueryi.exe.
 */
async function syncVersion(version) {
  const versionDir = path.join(VERSIONS_DIR, version);
  const exePath = path.join(versionDir, 'osqueryi.exe');

  if (fs.existsSync(exePath)) {
    return { success: true, message: 'Versão já disponível.', version, path: exePath };
  }

  if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

  const releases = await getLatestReleases();
  const target = releases.find(r => r.version === version);
  
  if (!target || !target.zip_url) {
    throw new Error(`Versão ${version} não encontrada ou sem pacote ZIP Windows.`);
  }

  const zipPath = path.join(versionDir, `osquery-${version}.zip`);
  
  console.log(`[OsqueryService] Iniciando download da versão ${version} (ZIP)...`);
  await _downloadFile(target.zip_url, zipPath);

  console.log(`[OsqueryService] Extraindo binários do ZIP...`);
  await _extractZip(zipPath, versionDir);

  // Localiza o executável na estrutura extraída e traz para a raiz da versão
  const foundExe = _findFileRecursive(versionDir, 'osqueryi.exe');
  if (foundExe) {
    if (foundExe !== exePath) {
      fs.copyFileSync(foundExe, exePath);
    }
    console.log(`[OsqueryService] Binário osqueryi.exe pronto em ${exePath}`);
  } else {
    throw new Error('Binário osqueryi.exe não encontrado no pacote extraído.');
  }

  // Limpar arquivos temporários
  try { 
    fs.unlinkSync(zipPath); 
    // Opcional: remover pastas vazias ou subpastas criadas pela extração se necessário
  } catch(_) {}

  return { success: true, version, path: exePath };
}

// --- Helpers Privados ---

function _downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return _downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Erro HTTP ${res.statusCode} ao baixar arquivo.`));
      }

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function _extractZip(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(targetDir, true);
      resolve();
    } catch (e) {
      console.error(`[OsqueryService] Erro extração ZIP:`, e);
      reject(new Error('Falha na extração do ZIP: ' + e.message));
    }
  });
}

function _findFileRecursive(dir, filename) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const found = _findFileRecursive(fullPath, filename);
        if (found) return found;
      } else if (file.toLowerCase() === filename) {
        return fullPath;
      }
    } catch (e) {
      // Ignora erros de acesso a arquivos específicos
    }
  }
  return null;
}

module.exports = {
  getLatestReleases,
  syncVersion
};
