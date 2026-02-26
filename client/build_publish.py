import sys
import re
import subprocess
import shutil
import hashlib
import json
import os

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
AGENT_FILE = "agent.py"
UPDATER_FILE = "updater.py"
AGENT_EXE_NAME = f"{PROJECT_NAME}-agent.exe"
UPDATER_EXE_NAME = f"{PROJECT_NAME}-updater.exe"

BACKEND_UPDATES_DIR = os.path.join("..", "backend", "updates")
VERSION_JSON_FILE = os.path.join(BACKEND_UPDATES_DIR, "version.json")

def bump_version(version_str):
    parts = version_str.split('.')
    if len(parts) == 3:
        # Incrementa o numero de patch (ex: 1.2.0 -> 1.2.1)
        parts[2] = str(int(parts[2]) + 1)
        return '.'.join(parts)
    return version_str

def update_agent_file_version():
    if not os.path.exists(AGENT_FILE):
        print(f"Erro: Arquivo {AGENT_FILE} nao encontrado.")
        sys.exit(1)

    with open(AGENT_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    match = re.search(r'AGENT_VERSION\s*=\s*"([^"]+)"', content)
    if not match:
        print("Erro: AGENT_VERSION nao encontrado em agent.py")
        sys.exit(1)

    current_version = match.group(1)
    new_version = bump_version(current_version)

    print(f"Atualizando versão de {current_version} para {new_version}...")
    content = content.replace(f'AGENT_VERSION = "{current_version}"', f'AGENT_VERSION = "{new_version}"')

    with open(AGENT_FILE, 'w', encoding='utf-8') as f:
        f.write(content)

    return new_version

def build_executables():
    print("Compilando agent.exe via PyInstaller...")
    subprocess.run(["pyinstaller", "--clean", "-y", "agent.spec"], check=True)
    
    print("Compilando updater.exe via PyInstaller...")
    subprocess.run(["pyinstaller", "--onefile", "--clean", "updater.py"], check=True)

def copy_to_backend():
    print("Copiando executaveis para o servidor Node.js backend/updates... ")
    os.makedirs(BACKEND_UPDATES_DIR, exist_ok=True)
    
    agent_dist = os.path.join("dist", "agent.exe")
    updater_dist = os.path.join("dist", "updater.exe")
    
    if not os.path.exists(agent_dist) or not os.path.exists(updater_dist):
        print("Erro: Executaveis nao encontrados na pasta dist/. O build falhou?")
        sys.exit(1)

    # Renomeia os arquivos no momento da cópia para o backend
    shutil.copy2(agent_dist, os.path.join(BACKEND_UPDATES_DIR, AGENT_EXE_NAME))
    shutil.copy2(updater_dist, os.path.join(BACKEND_UPDATES_DIR, UPDATER_EXE_NAME))

    # Também atualiza client/dist/ com tudo pronto para deploy
    print("Atualizando client/dist/ com executaveis, certs e config...")
    dist_dir = os.path.join("dist")
    dist_certs = os.path.join(dist_dir, "certs")
    os.makedirs(dist_certs, exist_ok=True)
    
    # Copia certs do backend/certs para dist/certs
    backend_certs = os.path.join("..", "backend", "certs")
    for cert_file in ["ca.crt", "agent.crt", "agent.key"]:
        src = os.path.join(backend_certs, cert_file)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dist_certs, cert_file))
    
    # Copia config.json se existir
    if os.path.exists("config.json"):
        shutil.copy2("config.json", os.path.join(dist_dir, "config.json"))

def calculate_sha256(filepath):
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def update_version_json(new_version):
    print("Calculando Hashes SHA-256 matematicos e publicando version.json...")
    agent_path = os.path.join(BACKEND_UPDATES_DIR, AGENT_EXE_NAME)
    updater_path = os.path.join(BACKEND_UPDATES_DIR, UPDATER_EXE_NAME)
    
    agent_hash = calculate_sha256(agent_path)
    updater_hash = calculate_sha256(updater_path)
    
    version_data = {
        "version": new_version,
        "agentHash": agent_hash,
        "updaterHash": updater_hash,
        "agentFileName": AGENT_EXE_NAME,
        "updaterFileName": UPDATER_EXE_NAME
    }
    
    with open(VERSION_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(version_data, f, indent=4)
        
    print(f"version.json atualizado e implantado com sucesso!")
    print(json.dumps(version_data, indent=2))

if __name__ == "__main__":
    print("=== Iniciando Build & Publish Automatico do Agente Doc-IT ===")
    try:
        new_version = update_agent_file_version()
        build_executables()
        copy_to_backend()
        update_version_json(new_version)
        print("=== DEPLOYMENT CONCLUIDO COM SUCESSO! ===")
        print(f"Nova versao disponivel: v{new_version}")
    except Exception as e:
        print(f"ERRO FATAL DURANTE O DEPLOY: {e}")
        sys.exit(1)
