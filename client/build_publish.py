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

MODULES = {
    "core": {"src": "Doc-IT-Core.py", "exe": f"{PROJECT_NAME}-Core.exe"},
    "inventory": {"src": "Doc-IT-Inventory.py", "exe": f"{PROJECT_NAME}-Inventory.exe"},
    "remote": {"src": "Doc-IT-Remote.py", "exe": f"{PROJECT_NAME}-Remote.exe"},
    "updater": {"src": "Doc-IT-Updater.py", "exe": f"{PROJECT_NAME}-Updater.exe"}
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
        new_version = bump_version(current_version)
        print(f" -> Atualizando versão interna em {filepath} ({current_version} -> {new_version})")
        content = content.replace(f'AGENT_VERSION = "{current_version}"', f'AGENT_VERSION = "{new_version}"')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return new_version
    else:
        # Se não tiver string dentro, apenas incrementa baseado no manifesto
        ver_to_bump = current_published_version or "2.0.0"
        return bump_version(ver_to_bump)


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
            
            # Compila via Pyinstaller
            cmd = ["pyinstaller", "--onefile", "--clean", "--noconfirm", "--noupx"]
            if mod_key == "core":
                cmd.append("--hidden-import=win32timezone")
            if mod_key != "core": cmd.append("--noconsole") 
            cmd.append(src)
            subprocess.run(cmd, check=True)
            
            # Atualiza Cache
            cache[mod_key] = {"src_hash": calculate_sha256(src)}
            modules_to_update[mod_key] = new_version
        else:
            print(f"[{mod_key.upper()}] Nenhuma alteração. Reutilizando build anterior (v{current_version}).")
            modules_to_update[mod_key] = current_version
            
    save_build_cache(cache)
    return modules_to_update


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
    with open(VERSION_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_manifest, f, indent=4)
    
    # Salva um JSON local simplificado na pasta dist/ para o Core ler em runtime
    local_versions = {}
    for mod_key in MODULES:
        local_versions[mod_key] = updated_modules.get(mod_key, "2.0.0")
    
    dist_versions_path = os.path.join("dist", "module_versions.json")
    with open(dist_versions_path, 'w', encoding='utf-8') as f:
        json.dump(local_versions, f, indent=4)
        
    print("Manifesto version.json modular gerado com sucesso!")


def copy_certs_to_dist():
    print("Atualizando pasta dist/ com config e certificados primários...")
    dist_dir = os.path.join("dist")
    dist_certs = os.path.join(dist_dir, "certs")
    os.makedirs(dist_certs, exist_ok=True)
    
    backend_certs = os.path.join("..", "backend", "certs")
    for cert_file in ["ca.crt", "agent.crt", "agent.key"]:
        src = os.path.join(backend_certs, cert_file)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dist_certs, cert_file))
    
    if os.path.exists("config.json"):
        shutil.copy2("config.json", os.path.join(dist_dir, "config.json"))


def build_installer():
    print("\n--- Empacotando Instalador GUI Nativo (Doc-IT-Setup.exe) ---")
    sep = ";" if os.name == "nt" else ":"
    cmd = [
        "pyinstaller", "--onefile", "--clean", "--noconfirm", "--noconsole", "--noupx",
        f"--add-data=dist/Doc-IT-Core.exe{sep}.",
        f"--add-data=dist/Doc-IT-Inventory.exe{sep}.",
        f"--add-data=dist/Doc-IT-Remote.exe{sep}.",
        f"--add-data=dist/Doc-IT-Updater.exe{sep}.",
        f"--add-data=dist/module_versions.json{sep}.",
        "Doc-IT-Setup.py"
    ]
    subprocess.run(cmd, check=True)
    
    setup_dist = os.path.join("dist", "Doc-IT-Setup.exe")
    setup_backend = os.path.join(BACKEND_UPDATES_DIR, "Doc-IT-Setup.exe")
    if os.path.exists(setup_dist):
        shutil.copy2(setup_dist, setup_backend)
        print("Instalador Doc-IT-Setup.exe gerado e copiado para o backend com sucesso!")


if __name__ == "__main__":
    print("=== Iniciando Build & Publish INCREMENTAL do Agente Doc-IT v2 ===")
    try:
        updated_modules = process_modules()
        copy_certs_to_dist()
        copy_to_backend_and_publish(updated_modules)
        build_installer()
        print("\n=== DEPLOYMENT INCREMENTAL CONCLUIDO COM SUCESSO! ===")
    except Exception as e:
        print(f"\nERRO FATAL DURANTE O DEPLOY INCREMENTAL: {e}")
        sys.exit(1)
