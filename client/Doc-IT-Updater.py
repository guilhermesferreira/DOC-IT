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
AGENT_VERSION = "2.0.11"

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

def read_local_module_version(mod_key):
    """Lê a versão do módulo a partir do module_versions.json gerado no build no diretório atual."""
    try:
        mv_path = os.path.join(os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else '.', "module_versions.json")
        if os.path.exists(mv_path):
            with open(mv_path, 'r', encoding='utf-8') as f:
                return json.load(f).get(mod_key, "0.0.0")
    except:
        pass
    return "0.0.0"

# Lista de módulos locais para varredura de updates
MODULES_KEYS = ["core", "inventory", "remote", "updater"]


# =========================================================
# LÓGICA DE ATUALIZAÇÕES E IPC
# =========================================================

def push_restart_to_core():
    """Avisa o Core via IPC que atualizações foram baixadas e requerem Restart Geral"""
    """Avisa o Core via IPC que atualizações foram baixadas e requerem Restart"""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(2)
        client.connect(('127.0.0.1', CORE_IPC_PORT))
        ipc_message = {"action": "restart_request", "data": "update_applied"}
        client.sendall(json.dumps(ipc_message).encode('utf-8'))
        client.close()
    except Exception as e:
        log_event(f"Erro ao pedir restart ao Core: {e}", "CRITICAL")


def check_and_apply_updates():
    """Varre o Manifesto da API buscando desvios de Hash/Versão em cada módulo. Itera por server_urls."""
    log_event("Checando manifesto de versões modular...", "INFO")
    
    cert_path = config.get("cert_path", "./certs/agent.crt")
    key_path = config.get("key_path", "./certs/agent.key")
    ca_path = config.get("ca_path", "./certs/ca.crt")
    
    server_urls = config.get("server_urls", [config.get('server_base_url', 'https://localhost:3000')])
    response = None
    working_url = None
    
    for url in server_urls:
        try:
            version_url = f"{url}/agent/version"
            if os.path.exists(cert_path) and os.path.exists(key_path) and os.path.exists(ca_path):
                response = requests.get(version_url, cert=(cert_path, key_path), verify=ca_path, timeout=10)
            else:
                response = requests.get(version_url, verify=False, timeout=10)
            
            if response.status_code == 200:
                working_url = url
                break
        except Exception as e:
            log_event(f"Tentativa de check em {url} falhou: {e}", "WARNING")
            continue
    
    if not response or response.status_code != 200:
        log_event(f"Nenhum servidor respondeu ao check de versao.", "WARNING")
        return
    
    manifest = response.json()
    modules_updated = False
    
    try:
        server_modules = manifest.get("modules", {})
        
        for mod_key in MODULES_KEYS:
            remote_info = server_modules.get(mod_key, {})
            remote_ver = remote_info.get("version")
            local_ver = read_local_module_version(mod_key)
            
            if remote_ver and remote_ver != local_ver:
                log_event(f"Desvio de versão no módulo '{mod_key}': Local {local_ver} -> Server {remote_ver}", "WARNING")
                
                target_file = remote_info.get("file")
                expected_hash = remote_info.get("hash")
                
                success = download_module_safe(mod_key, target_file, expected_hash, working_url)
                if success:
                    modules_updated = True
                    
    except Exception as e:
        log_event(f"Manifesto Incompativel ou Quebrado: {e}", "ERROR")

    if modules_updated:
         log_event("Reposições aplicadas. Notificando Core para auto-restart...", "CRITICAL")
         push_restart_to_core()
    else:
         log_event("Todos os módulos estão atualizados.", "INFO")


def download_module_safe(mod_key, target_file, expected_hash, base_url=None):
    log_event(f"Iniciando reposição segura do módulo [{mod_key}] ({target_file})...", "INFO")
    
    if not base_url:
        base_url = config.get('server_base_url', 'https://localhost:3000')
    base_update_url = f"{base_url}/agent/update"
    file_url = f"{base_update_url}/{target_file}"
    
    temp_save = f"{target_file}.tmp"
    old_save = f"{target_file}.old"
    
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
                
            # 1. Espera o antivírus liberar o arquivo .tmp
            # Faz um loop de 15 segundos tentando abrir para append (gravação restrita), se funcionar o lock sumiu.
            lock_cleared = False
            for _ in range(15):
                try:
                    with open(temp_save, 'ab'):
                        pass
                    lock_cleared = True
                    break
                except OSError:
                    time.sleep(1)
                    
            if not lock_cleared:
                log_event(f"Antivirus bloqueou {temp_save} por muito tempo. Abortando reposicao.", "ERROR")
                try: os.remove(temp_save)
                except: pass
                return False

            # Substituição Eficiente sem BAT
            # 2. Deleta o .old anterior se existir
            if os.path.exists(old_save):
                try: os.remove(old_save)
                except Exception as e: log_event(f"Aviso: Nao conseguiu deletar {old_save}: {e}", "WARNING")
            
            # 3. Renomeia o executavel VIVO para .old (O Windows permite renomear arquivos em uso)
            if os.path.exists(target_file):
                try:
                    os.rename(target_file, old_save)
                except Exception as e:
                    log_event(f"Falha ao renomear {target_file} para .old: {e}. Abortando.", "ERROR")
                    return False
                
            # 4. Coloca o arquivo novo no lugar
            try:
                os.rename(temp_save, target_file)
                log_event(f"Módulo [{mod_key}] substituído com sucesso através de rename (.old).", "INFO")
                return True
            except Exception as e:
                log_event(f"Falha ao renomear novo binario {temp_save}: {e}. Rollback acionado.", "ERROR")
                try: os.rename(old_save, target_file)
                except: pass
                return False
                
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
    
    while True:
        try:
            check_and_apply_updates()
        except Exception as e:
            pass
            
        polling_minutes = 60 # Fallback default
        try:
            server_urls = config.get("server_urls", [config.get('server_base_url')])
            cert_path = config.get("cert_path", "./certs/agent.crt")
            key_path = config.get("key_path", "./certs/agent.key")
            ca_path = config.get("ca_path", "./certs/ca.crt")
            
            for url in server_urls:
                try:
                    settings_url = f"{url}/settings/agent"
                    if os.path.exists(cert_path) and os.path.exists(key_path) and os.path.exists(ca_path):
                        r = requests.get(settings_url, cert=(cert_path, key_path), verify=ca_path, timeout=15)
                    else:
                        r = requests.get(settings_url, verify=False, timeout=15)
                        
                    if r.status_code == 200:
                        settings_data = r.json()
                        if "updateCheckIntervalMinutes" in settings_data:
                            polling_minutes = int(settings_data["updateCheckIntervalMinutes"])
                        break
                except:
                    continue
        except Exception as e:
            log_event(f"Aviso: Nao foi possivel buscar o intervalo de atualizacao do painel ({e}). Usando {polling_minutes} min.", "WARNING")
            
        time.sleep(polling_minutes * 60)
