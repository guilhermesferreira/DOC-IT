import sys
import re
import subprocess
import shutil
import hashlib
import json
import os
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

def get_project_name():
    env_path = os.path.join("..", "backend", ".env")
    project_name = "Doc-IT"
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith("PROJECT_NAME="):
                    project_name = line.strip().split("=", 1)[1].strip('"').strip("'")
                    break
    return project_name.replace(" ", "-")

PROJECT_NAME = get_project_name()

MODULES = {
    "core": {"src": "Doc-IT-Core.py", "exe": f"{PROJECT_NAME}-Core.exe"},
    "inventory": {"src": "Doc-IT-Inventory.py", "exe": f"{PROJECT_NAME}-Inventory.exe"},
    "remote": {"src": "Doc-IT-Remote.py", "exe": f"{PROJECT_NAME}-Remote.exe"},
    "updater": {"src": "Doc-IT-Updater.py", "exe": f"{PROJECT_NAME}-Updater.exe"},
    "gui": {"src": "Doc-IT-GUI.py", "exe": f"{PROJECT_NAME}-GUI.exe"}
}

BACKEND_UPDATES_DIR = os.path.join("..", "backend", "updates")
VERSION_JSON_FILE = os.path.join(BACKEND_UPDATES_DIR, "version.json")
BUILD_CACHE_FILE = ".build_cache.json"

def bump_version(version_str):
    parts = version_str.split('.')
    if len(parts) == 3:
        parts[2] = str(int(parts[2]) + 1)
        return '.'.join(parts)
    return version_str

def calculate_sha256(filepath):
    if not os.path.exists(filepath): return None
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def load_build_cache():
    if os.path.exists(BUILD_CACHE_FILE):
        try:
            with open(BUILD_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return {}

def save_build_cache(cache):
    with open(BUILD_CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=4)

def load_manifest():
    if os.path.exists(VERSION_JSON_FILE):
        try:
            with open(VERSION_JSON_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return {"version": "2.0.0", "modules": {}}

def update_module_file_version(filepath, current_published_version=None):
    if not os.path.exists(filepath):
        print(f"Aviso: Arquivo {filepath} não encontrado para update.")
        return None

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Tenta achar AGENT_VERSION declarada no .py
    match = re.search(r'AGENT_VERSION\s*=\s*"([^"]+)"', content)
    
    if match:
        current_version = match.group(1)
        # new_version = bump_version(current_version)
        # print(f" -> Atualizando versão interna em {filepath} ({current_version} -> {new_version})")
        # content = content.replace(f'AGENT_VERSION = "{current_version}"', f'AGENT_VERSION = "{new_version}"')
        # with open(filepath, 'w', encoding='utf-8') as f:
        #     f.write(content)
        return current_version
    else:
        # Se não tiver string dentro, apenas incrementa baseado no manifesto
        ver_to_bump = current_published_version or "2.0.0"
        return bump_version(ver_to_bump)


def create_version_info_file(version, filename):
    """Gera o arquivo de texto version_info.txt que o PyInstaller usa para embutir metadados no .exe."""
    # Garante que a versão seja uma string limpa
    version = str(version).strip()
    # Garante que a versão tenha 4 partes para o tuple (major, minor, micro, build)
    parts = version.split('.')
    clean_parts = []
    for p in parts:
        m = re.match(r'(\d+)', p)
        if m:
            clean_parts.append(m.group(1))
        else:
            clean_parts.append('0')
            
    while len(clean_parts) < 4:
        clean_parts.append('0')
    version_tuple = f"({', '.join(clean_parts[:4])})"
    print(f"DEBUG: version='{version}', version_tuple='{version_tuple}'")
    
    content = f"""# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={version_tuple},
    prodvers={version_tuple},
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
    ),
  kids=[
    StringFileInfo(
      [
      StringTable(
        '040904B0',
        [StringStruct('CompanyName', 'Doc-IT by Guilherme S. Ferreira'),
        StringStruct('FileDescription', 'Doc-IT Agent Module'),
        StringStruct('FileVersion', '{version}'),
        StringStruct('InternalName', '{filename}'),
        StringStruct('LegalCopyright', 'Doc-IT by Guilherme S. Ferreira'),
        StringStruct('OriginalFilename', '{filename}'),
        StringStruct('ProductName', 'Doc-IT'),
        StringStruct('ProductVersion', '{version}')])
      ]), 
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)"""

    with open("version_info.txt", "w", encoding="utf-8") as f:
        f.write(content)

def process_modules():
    cache = load_build_cache()
    manifest = load_manifest()
    os.makedirs("dist", exist_ok=True)
    os.makedirs(BACKEND_UPDATES_DIR, exist_ok=True)
    
    modules_to_update = {}
    
    print("\n--- Verificando Alterações de Código ---")
    for mod_key, mod_info in MODULES.items():
        src = mod_info["src"]
        
        current_src_hash = calculate_sha256(src)
        cached_src_hash = cache.get(mod_key, {}).get("src_hash")
        dist_exe_path = os.path.join("dist", src.replace(".py", ".exe"))
        
        # O módulo precisa ser compilado se o hash do fonte mudou OU se o .exe não existir na pasta dist
        needs_build = (current_src_hash != cached_src_hash) or not os.path.exists(dist_exe_path)
        
        mod_manifest_info = manifest.get("modules", {}).get(mod_key, {})
        current_version = mod_manifest_info.get("version", "2.0.0")
        
        if needs_build:
            print(f"[{mod_key.upper()}] Modificações detectadas! Iniciando Build Diferencial.")
            
            # Incrementa Versão
            new_version = update_module_file_version(src, current_version)
            if not new_version: new_version = bump_version(current_version)
            
            print(f"[{mod_key.upper()}] New version: '{new_version}'")
            
            # Gera metadados de versão para o Windows
            create_version_info_file(new_version, mod_info["exe"])
            
            # Compila via Pyinstaller
            cmd = ["pyinstaller", "--onefile", "--clean", "--noconfirm", "--noupx", "--version-file=version_info.txt"]
            if mod_key == "core":
                cmd.append("--hidden-import=win32timezone")
            if mod_key != "core": cmd.append("--noconsole") 
            
            sep = ";" if os.name == "nt" else ":"
            if mod_key == "gui":
                cmd.append(f"--add-data=assets{sep}assets")
                cmd.append("--icon=assets/icon.ico")
                
            cmd.append(src)
            print(f"Executando: {' '.join(cmd)}")
            subprocess.run(cmd, check=True)
            
            # Limpa lixo do version_info
            if os.path.exists("version_info.txt"):
                os.remove("version_info.txt")
            
            # Atualiza Cache
            cache[mod_key] = {"src_hash": calculate_sha256(src)}
            modules_to_update[mod_key] = new_version
        else:
            print(f"[{mod_key.upper()}] Nenhuma alteração. Reutilizando build anterior (v{current_version}).")
            modules_to_update[mod_key] = current_version
            
    save_build_cache(cache)
    return modules_to_update


def generate_or_load_rsa_keys():
    keys_dir = os.path.join("..", "backend", "keys")
    os.makedirs(keys_dir, exist_ok=True)
    priv_path = os.path.join(keys_dir, "updater_private.pem")
    pub_path = os.path.join(keys_dir, "updater_public.pem")
    
    if not os.path.exists(priv_path):
        print("Gerando novo par de chaves RSA de segurança para o Updater...")
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        with open(priv_path, "wb") as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))
        with open(pub_path, "wb") as f:
            f.write(private_key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ))
            
    with open(priv_path, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)

def copy_to_backend_and_publish(updated_modules):
    print("\n--- Copiando Artefatos e Gerando Manifesto ---")
    manifest = load_manifest()
    
    # Prepara objeto do Core pra puxar a versão geral (opcional)
    core_ver = updated_modules.get("core", manifest.get("version", "2.0.0"))
    
    new_manifest = {
        "version": core_ver,
        "modules": {}
    }
    
    for mod_key, mod_info in MODULES.items():
        # Copia do Dist pro Backend
        dist_file = os.path.join("dist", mod_info["src"].replace(".py", ".exe"))
        target_backend_file = os.path.join(BACKEND_UPDATES_DIR, mod_info["exe"])
        
        if os.path.exists(dist_file):
            shutil.copy2(dist_file, target_backend_file)
            
        exe_hash = calculate_sha256(target_backend_file)
        
        new_manifest["modules"][mod_key] = {
            "version": updated_modules.get(mod_key, "2.0.0"),
            "file": mod_info["exe"],
            "hash": exe_hash
        }
    
    # Salva JSON Final (para o Backend servir ao Updater)
    # Mantemos este arquivo no backend porque o Updater ainda baixa o JSON do servidor
    # para saber se há novos arquivos, hash de validação e o nome do arquivo.
    # O que mudou é que a VERSÃO LOCAL agora é lida do .exe e não de um JSON local.
    # Adiciona a assinatura criptográfica ao JSON
    private_key = generate_or_load_rsa_keys()
    content_to_sign = json.dumps(new_manifest, sort_keys=True).encode('utf-8')
    
    signature = private_key.sign(
        content_to_sign,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
        hashes.SHA256()
    )
    
    new_manifest["_signature"] = base64.b64encode(signature).decode('utf-8')
    
    with open(VERSION_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_manifest, f, indent=4, sort_keys=True)
        
    print("Manifesto version.json modular assinado com RSA e gerado com sucesso!")


def get_server_urls():
    """Gera uma lista de URLs do servidor para o config.json do agente.
    Inclui: 1) SERVER_URL do .env (se existir)  2) Todos os IPs reais da máquina automaticamente."""
    import socket
    env_path = os.path.join("..", "backend", ".env")
    urls = []
    
    # Lê a porta do .env
    port = "3000"
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip().startswith("PORT="):
                    port = line.strip().split("=", 1)[1].strip('"').strip("'")
    
    # Prioridade 1: SERVER_URL explícita
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip().startswith("SERVER_URL="):
                    val = line.strip().split("=", 1)[1].strip('"').strip("'")
                    if val:
                        urls.append(val)
                        print(f" -> SERVER_URL do .env adicionada: {val}")
    
    # Prioridade 2: Auto-detectar TODOS os IPs reais
    try:
        hostname = socket.gethostname()
        ips = socket.getaddrinfo(hostname, None, socket.AF_INET)
        for info in ips:
            ip = info[4][0]
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                url = f"https://{ip}:{port}"
                if url not in urls:
                    urls.append(url)
                    print(f" -> IP auto-detectado adicionado: {url}")
    except Exception as e:
        print(f" -> Aviso: Falha ao auto-detectar IPs: {e}")
    
    if not urls:
        fallback = f"https://localhost:{port}"
        urls.append(fallback)
        print(f" -> AVISO: Nenhum IP detectado, usando fallback: {fallback}")
    
    return urls


def copy_certs_to_dist():
    print("Atualizando pasta dist/ com config e certificados primários...")
    dist_dir = os.path.join("dist")
    dist_certs = os.path.join(dist_dir, "certs")
    os.makedirs(dist_certs, exist_ok=True)
    
    backend_certs = os.path.join("..", "backend", "certs")
    for cert_file in ["ca.crt"]:
        src = os.path.join(backend_certs, cert_file)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dist_certs, cert_file))
    
    # Gera config.json dinamicamente com lista de URLs
    server_urls = get_server_urls()
    config_data = {
        "server_urls": server_urls,
        "server_base_url": server_urls[0],
        "log_level": "INFO",
        "cert_path": "./certs/agent.crt",
        "key_path": "./certs/agent.key",
        "ca_path": "./certs/ca.crt"
    }
    config_path = os.path.join(dist_dir, "config.json")
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config_data, f, indent=4)
    print(f" -> config.json gerado com {len(server_urls)} URL(s) de servidor")

    # --- COPIA A CHAVE PÚBLICA PARA O DIST PARA IR JUNTO NO INSTALADOR ---
    keys_dir = os.path.join("..", "backend", "keys")
    pub_key_src = os.path.join(keys_dir, "updater_public.pem")
    if os.path.exists(pub_key_src):
        shutil.copy2(pub_key_src, os.path.join(dist_certs, "updater_public.pem"))



def build_installer():
    print("\n--- Empacotando Instalador GUI Nativo (Doc-IT-Setup.exe) ---")
    sep = ";" if os.name == "nt" else ":"
    cmd = [
        "pyinstaller", "--onefile", "--clean", "--noconfirm", "--noconsole", "--noupx",
        f"--add-data=dist/Doc-IT-Core.exe{sep}.",
        f"--add-data=dist/Doc-IT-Inventory.exe{sep}.",
        f"--add-data=dist/Doc-IT-Remote.exe{sep}.",
        f"--add-data=dist/Doc-IT-Updater.exe{sep}.",
        f"--add-data=dist/Doc-IT-GUI.exe{sep}.",
        f"--add-data=dist/config.json{sep}.",
        f"--add-data=dist/certs{sep}certs",
        f"--add-data=assets{sep}assets",
        "--icon=assets/icon.ico",
        "Doc-IT-Setup.py"
    ]
    subprocess.run(cmd, check=True)
    
    setup_dist = os.path.join("dist", "Doc-IT-Setup.exe")
    setup_backend = os.path.join(BACKEND_UPDATES_DIR, "Doc-IT-Setup.exe")
    if os.path.exists(setup_dist):
        shutil.copy2(setup_dist, setup_backend)
        print("Instalador Doc-IT-Setup.exe gerado e copiado para o backend com sucesso!")


if __name__ == "__main__":
    print("=== Iniciando Build & Publish COM BLINDAGEM RSA ===")
    try:
        updated_modules = process_modules()
        generate_or_load_rsa_keys() # Garante que as chaves existem antes de copiar
        copy_certs_to_dist()
        copy_to_backend_and_publish(updated_modules)
        build_installer()
        print("\n=== DEPLOYMENT SEGURO CONCLUIDO COM SUCESSO! ===")
    except Exception as e:
        print(f"\nERRO FATAL DURANTE O DEPLOY INCREMENTAL: {e}")
        sys.exit(1)
