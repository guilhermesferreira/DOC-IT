import os
import sys
import json
import time
import re
import socket
import datetime
import traceback
import hashlib

import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# --- Configurações IPC ---
CORE_IPC_PORT = 49152
MY_IPC_PORT = 49155

CONFIG_FILE = "config.json"
LOG_FILE = "agent-updater.log"
AGENT_VERSION = "2.0.2"

config = {}


def log_event(message, level="INFO"):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"{timestamp} [{level.upper()}] [UPDATER] - {message}\n"
    try:
        with open(LOG_FILE, "a", encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip())
    except:
        pass

def handle_exception(exc_type, exc_value, exc_traceback):
    log_event(f"CRASH: " + "".join(traceback.format_exception(exc_type, exc_value, exc_traceback)), "CRITICAL")
    sys.exit(1)

sys.excepthook = handle_exception

def load_config():
    if not os.path.exists(CONFIG_FILE): return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def read_local_module_version(filepath):
    """Lê a AGENT_VERSION de um arquivo .py no disco para comparação dinâmica."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            match = re.search(r'AGENT_VERSION\s*=\s*"([^"]+)"', f.read())
            return match.group(1) if match else "0.0.0"
    except:
        return "0.0.0"


# Mapeamento dos módulos e seus fontes locais para leitura de versão
MODULE_SOURCES = {
    "core": "Doc-IT-Core.py",
    "inventory": "Doc-IT-Inventory.py",
    "remote": "Doc-IT-Remote.py",
    "updater": "Doc-IT-Updater.py"
}


# =========================================================
# LÓGICA DE ATUALIZAÇÕES E IPC
# =========================================================

def push_restart_to_core():
    """Avisa o Core via IPC que atualizações foram baixadas e requerem Restart Geral"""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(2)
        client.connect(('127.0.0.1', CORE_IPC_PORT))
        ipc_message = {"action": "restart_request", "data": "update_applied"}
        client.sendall(json.dumps(ipc_message).encode('utf-8'))
        client.close()
    except Exception as e:
        log_event(f"Erro ao pedir restart ao Core: {e}", "CRITICAL")


def push_self_update_to_core(target_file, expected_hash):
    """Pede ao Core para atualizar o Updater, já que ele não pode substituir a si próprio no Windows."""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(2)
        client.connect(('127.0.0.1', CORE_IPC_PORT))
        ipc_message = {
            "action": "update_module",
            "data": {
                "module": "updater",
                "file": target_file,
                "hash": expected_hash
            }
        }
        client.sendall(json.dumps(ipc_message).encode('utf-8'))
        client.close()
        log_event("Delegada atualização do próprio Updater ao Core via IPC.", "INFO")
    except Exception as e:
        log_event(f"Erro ao delegar self-update ao Core: {e}", "ERROR")


def check_and_apply_updates():
    """Varre o Manifesto da API buscando desvios de Hash/Versão em cada módulo"""
    log_event("Checando manifesto de versões modular...", "INFO")
    
    version_url = f"{config.get('server_base_url', 'https://localhost:3000')}/agent/version"
    cert_path = config.get("cert_path", "./certs/agent.crt")
    key_path = config.get("key_path", "./certs/agent.key")
    ca_path = config.get("ca_path", "./certs/ca.crt")

    try:
        if os.path.exists(cert_path) and os.path.exists(key_path) and os.path.exists(ca_path):
            response = requests.get(version_url, cert=(cert_path, key_path), verify=ca_path, timeout=10)
        else:
            response = requests.get(version_url, verify=False, timeout=10)
        
        if response.status_code == 200:
            manifest = response.json()
            
            modules_updated = False
            
            try:
                server_modules = manifest.get("modules", {})
                
                for mod_key, src_file in MODULE_SOURCES.items():
                    remote_info = server_modules.get(mod_key, {})
                    remote_ver = remote_info.get("version")
                    local_ver = read_local_module_version(src_file)
                    
                    if remote_ver and remote_ver != local_ver:
                        log_event(f"Desvio de versão no módulo '{mod_key}': Local {local_ver} -> Server {remote_ver}", "WARNING")
                        
                        target_file = remote_info.get("file")
                        expected_hash = remote_info.get("hash")
                        
                        # O Updater NÃO PODE substituir a si próprio (Windows trava o .exe em uso)
                        # Delega essa operação ao Core, que mata o Updater, troca o arquivo, e relança
                        if mod_key == "updater":
                            push_self_update_to_core(target_file, expected_hash)
                            continue
                        
                        success = download_module_safe(mod_key, target_file, expected_hash)
                        if success:
                            modules_updated = True
                            
            except Exception as e:
                log_event(f"Manifesto Incompativel ou Quebrado: {e}", "ERROR")

            if modules_updated:
                 log_event("Baixadas substituições de módulos. Engatilhando IPC restart no Core...", "CRITICAL")
                 push_restart_to_core()
            else:
                 log_event("Todos os módulos estão atualizados.", "INFO")
                 
        else:
             log_event(f"Não foi possivel verificar update. HTTP {response.status_code}", "WARNING")

    except Exception as e:
        log_event(f"Erro de rede ao buscar manifesto: {e}", "ERROR")


def download_module_safe(mod_key, target_file, expected_hash):
    log_event(f"Iniciando reposição segura do módulo [{mod_key}] ({target_file})...", "INFO")
    
    base_update_url = f"{config.get('server_base_url', 'https://localhost:3000')}/agent/update"
    file_url = f"{base_update_url}/{target_file}"
    
    temp_save = f"{target_file}.tmp"
    
    try:
        cert_path = config.get("cert_path", "./certs/agent.crt")
        key_path = config.get("key_path", "./certs/agent.key")
        ca_path = config.get("ca_path", "./certs/ca.crt")
        
        if os.path.exists(cert_path) and os.path.exists(key_path) and os.path.exists(ca_path):
            r = requests.get(file_url, cert=(cert_path, key_path), verify=ca_path, stream=True, timeout=30)
        else:
            r = requests.get(file_url, verify=False, stream=True, timeout=30)
        
        if r.status_code == 200:
            sha256 = hashlib.sha256()
            with open(temp_save, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    sha256.update(chunk)
            
            calc_hash = sha256.hexdigest()
            if calc_hash != expected_hash:
                log_event(f"SECURITY ALERT: Hash inválido para {target_file}. Abortando reposição.", "CRITICAL")
                os.remove(temp_save)
                return False
                
            if os.path.exists(target_file):
                os.remove(target_file)
            os.rename(temp_save, target_file)
            
            log_event(f"Módulo [{mod_key}] injetado e atualizado no disco.", "INFO")
            return True
            
        else:
             log_event(f"Falha HTTP ao baixar {target_file}: {r.status_code}", "ERROR")
             return False
    except Exception as e:
        log_event(f"Erro durante download de componente: {e}", "ERROR")
        # Limpa arquivo temporário se existir
        if os.path.exists(temp_save):
            try: os.remove(temp_save)
            except: pass
        return False
        
        
# =========================================================
# MAIN ENTRYPOINT
# =========================================================
if __name__ == "__main__":
    log_event("==== DOC-IT UPDATER INITIALIZED ====", "INFO")
    config = load_config()

    POLLING_MINUTES = 60
    
    while True:
        try:
            check_and_apply_updates()
        except:
             pass
        time.sleep(POLLING_MINUTES * 60)
