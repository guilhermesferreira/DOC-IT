import os
import sys
import json
import time
import re
import socket
import datetime
import traceback
import hashlib
import subprocess
import psutil

import requests
import urllib3
import base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization

# urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning) # Removido por segurança v2.1.2


import win32pipe
import win32file
import pywintypes

# --- Configurações IPC ---
CORE_IPC_PIPE = r'\\.\pipe\DocIT_Core_IPC'

# Token de Autenticação (Lido da Variável de Ambiente em segurança)
LOG_FILE = "agent-updater.log"
AGENT_VERSION = "2.1.3"

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

def request_config_from_core():
    """Solicita a configuração ativa ao processo Core via Named Pipe."""
    try:
        payload = {
            "action": "get_config"
        }
        
        handle = win32file.CreateFile(
            CORE_IPC_PIPE,
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0, None,
            win32file.OPEN_EXISTING,
            0, None
        )
        win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
        win32file.WriteFile(handle, json.dumps(payload).encode('utf-8'))
        
        data = b""
        while True:
            resp, chunk = win32file.ReadFile(handle, 4096)
            data += chunk
            if resp == 0: break
            
        win32file.CloseHandle(handle)
        response = json.loads(data.decode('utf-8'))
        if response.get("status") == "success":
            return response.get("config", {})
    except Exception as e:
        log_event(f"Falha ao carregar config via IPC (Core offline?): {e}", "WARNING")
    finally:
        try: win32file.CloseHandle(handle)
        except: pass
    return {}

import ctypes

def get_file_version(path):
    """Lê a versão (ProductVersion) diretamente dos metadados do executável via API do Windows."""
    if not os.path.exists(path):
        return None
    try:
        size = ctypes.windll.version.GetFileVersionInfoSizeW(path, None)
        if not size: return None
        buffer = ctypes.create_string_buffer(size)
        ctypes.windll.version.GetFileVersionInfoW(path, None, size, buffer)
        length = ctypes.c_uint()
        ptr = ctypes.c_void_p()
        # Tenta obter a informação de tradução (idioma/codepage)
        ctypes.windll.version.VerQueryValueW(buffer, '\\VarFileInfo\\Translation', ctypes.byref(ptr), ctypes.byref(length))
        if length.value >= 4:
            data = ctypes.string_at(ptr, 4)
            lang = data[1] << 8 | data[0]
            cp = data[3] << 8 | data[2]
            key = f'\\StringFileInfo\\{lang:04x}{cp:04x}\\ProductVersion'
            ctypes.windll.version.VerQueryValueW(buffer, key, ctypes.byref(ptr), ctypes.byref(length))
            if length.value > 0:
                return ctypes.wstring_at(ptr, length.value).strip('\x00')
    except Exception as e:
        log_event(f"Erro ao extrair versão de {path}: {e}", "WARNING")
    return None

def read_local_module_version(mod_key):
    """Lê a versão do módulo diretamente do .exe no diretório atual."""
    # Mapeamento do mod_key para o nome real do arquivo (pode variar se o PROJECT_NAME mudar,
    # mas o default/atual é Doc-IT-*)
    exe_name = f"Doc-IT-{mod_key.capitalize()}.exe"
    
    # Se estiver rodando como script para testes locais
    if not getattr(sys, 'frozen', False):
        # Tenta achar no diretório atual ou fallback para AGENT_VERSION se for o próprio updater
        if mod_key == "updater":
            return AGENT_VERSION
        return "0.0.0"

    current_dir = os.path.dirname(sys.executable)
    exe_path = os.path.join(current_dir, exe_name)
    
    version = get_file_version(exe_path)
    if version:
        return version
        
    return "0.0.0"

# Lista de módulos locais para varredura de updates
MODULES_KEYS = ["core", "inventory", "remote", "updater", "gui"]

def get_install_dir():
    """Retorna o diretório real da instalação, lidando corretamente com o formato PyInstaller (--onefile)."""
    return os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))

# Mantemos a variável base (mas agora de forma segura para os outros locais se precisarem)
BASE_SCRIPT_DIR = get_install_dir()

def check_and_update_osquery(working_url, remote_version):
    """Verifica se a versão do OsqueryEngine local diverge do selecionado no servidor."""
    if not remote_version:
        return False
        
    log_event(f"Verificando motor Osquery: Versão Alvo {remote_version}...", "INFO")
    
    install_dir = get_install_dir()
    
    # Caminho real para o binário do agente dentro de client/assets/bin
    bin_dir = os.path.join(install_dir, "assets", "bin")
    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir, exist_ok=True)
    
    target_path = os.path.join(bin_dir, "osqueryi.exe")
    temp_path = target_path + ".tmp"
    
    local_version = "None"
    if os.path.exists(target_path):
        try:
            output = subprocess.check_output([target_path, "--version"], text=True, creationflags=subprocess.CREATE_NO_WINDOW)
            parts = output.strip().split(" ")
            local_version = parts[2] if len(parts) > 2 else parts[1]
        except:
            local_version = "Corrupt"

    if remote_version == "latest":
        if local_version not in ["None", "Corrupt"]:
            return False
    elif local_version == remote_version:
        log_event(f"Osquery Engine v{local_version} já está atualizado no Agente.", "INFO")
        return False

    log_event(f"Atualizando Osquery: {local_version} -> {remote_version}", "WARNING")
    
    try:
        download_url = f"{working_url}/agent/osquery/{remote_version}"
        
        # Certificados absolutos via config ou default do install_dir
        cert_path = config.get("cert_path", os.path.join(install_dir, "certs", "agent.crt"))
        key_path = config.get("key_path", os.path.join(install_dir, "certs", "agent.key"))
        ca_path = config.get("ca_path", os.path.join(install_dir, "certs", "ca.crt"))
        
        verify_ssl = ca_path if (ca_path and os.path.exists(ca_path)) else True

        certs = None
        if cert_path and key_path and os.path.exists(cert_path) and os.path.exists(key_path):
            certs = (cert_path, key_path)

        r = requests.get(download_url, cert=certs, verify=verify_ssl, stream=True, timeout=60)
        
        if r.status_code == 200:
            expected_hash = r.headers.get('X-Osquery-Hash')
            sha256 = hashlib.sha256()
            
            with open(temp_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
                    sha256.update(chunk)
            
            if expected_hash:
                calc_hash = sha256.hexdigest()
                if calc_hash != expected_hash:
                    log_event(f"INTEGRITY ERROR: Hash do Osquery ({calc_hash}) não confere com server ({expected_hash}). Abortando.", "CRITICAL")
                    if os.path.exists(temp_path): os.remove(temp_path)
                    return False
            
            if os.path.exists(target_path):
                try: 
                    os.remove(target_path)
                except:
                    log_event("Detectado binário em uso. Tentando encerrar processos osqueryi...", "WARNING")
                    for proc in psutil.process_iter(['name']):
                        if proc.info['name'] == 'osqueryi.exe':
                            try: proc.kill()
                            except: pass
                    time.sleep(2)
                    try: os.remove(target_path)
                    except: 
                        log_event("Não foi possível deletar o binário ativo. Usando extensão .old", "WARNING")
                        if os.path.exists(target_path + ".old"): os.remove(target_path + ".old")
                        os.rename(target_path, target_path + ".old")

            os.rename(temp_path, target_path)
            log_event(f"Osquery Engine atualizado com sucesso! Alvo: {remote_version}", "INFO")
            return True
        else:
            log_event(f"Falha ao baixar Osquery: status {r.status_code}. Verifique se a versão está sincronizada no servidor.", "ERROR")
            return False
    except Exception as e:
        log_event(f"Erro Crítico na atualização do Osquery: {e}", "ERROR")
        if os.path.exists(temp_path): os.remove(temp_path)
        return False


# =========================================================
# LÓGICA DE ATUALIZAÇÕES E IPC
# =========================================================

def push_restart_to_core():
    """Avisa o Core via Named Pipe que atualizações foram baixadas e requerem Restart Geral"""
    try:
        ipc_message = {
            "action": "restart_request", 
            "data": "update_applied",
        }
        
        handle = win32file.CreateFile(
            CORE_IPC_PIPE,
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0, None,
            win32file.OPEN_EXISTING,
            0, None
        )
        win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
        win32file.WriteFile(handle, json.dumps(ipc_message).encode('utf-8'))
        win32file.CloseHandle(handle)
    except Exception as e:
        log_event(f"Erro ao pedir restart ao Core via Pipe {CORE_IPC_PIPE}: {e}", "CRITICAL")
    finally:
        try: win32file.CloseHandle(handle)
        except: pass

def verify_manifest_signature(manifest, public_key_path):
    """Verifica a assinatura digital RSA do manifesto version.json."""
    if not os.path.exists(public_key_path):
        log_event(f"SECURITY ERROR: Chave pública RSA não encontrada em {public_key_path}. Bloqueando update.", "CRITICAL")
        return False
        
    try:
        # Extrai a assinatura
        sig_b64 = manifest.get("_signature")
        if not sig_b64:
            log_event("SECURITY ALERT: Manifesto sem assinatura digital. Abortando.", "CRITICAL")
            return False
            
        signature = base64.b64decode(sig_b64)
        
        # Cria cópia do manifesto sem a assinatura para validar o conteúdo original
        manifest_to_verify = manifest.copy()
        del manifest_to_verify["_signature"]
        
        # O build_publish.py usa sort_keys=True para garantir consistência
        content_to_verify = json.dumps(manifest_to_verify, sort_keys=True).encode('utf-8')
        
        with open(public_key_path, "rb") as f:
            public_key = serialization.load_pem_public_key(f.read())
            
        public_key.verify(
            signature,
            content_to_verify,
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
            hashes.SHA256()
        )
        return True
    except Exception as e:
        log_event(f"INTEGRITY FAILURE: Assinatura do manifesto inválida ou corrompida! {e}", "CRITICAL")
        return False

def cleanup_old_files():
    """Varre a pasta instalada e exclui arquivos .old ou .tmp de atualizações passadas consolidadadas."""
    try:
        current_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else '.'
        count = 0
        for filename in os.listdir(current_dir):
            if filename.endswith(".old") or filename.endswith(".tmp"):
                filepath = os.path.join(current_dir, filename)
                try:
                    os.remove(filepath)
                    count += 1
                except:
                    pass
        if count > 0:
            log_event(f"Limpeza concluída. {count} arquivos de atualização antigos (.old/.tmp) foram removidos do disco.", "INFO")
    except Exception as e:
        pass


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
            verify_ssl = ca_path if (ca_path and os.path.exists(ca_path)) else True
            response = requests.get(version_url, cert=(cert_path, key_path), verify=verify_ssl, timeout=10)
            
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
    
    # VERIFICAÇÃO DE ASSINATURA RSA (Passo C.2 / C.3)
    pub_key_path = os.path.join(get_install_dir(), "certs", "updater_public.pem")
    if not verify_manifest_signature(manifest, pub_key_path):
        return

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
        base_url = config.get('server_base_url')
    base_update_url = f"{base_url}/agent/update"
    file_url = f"{base_update_url}/{target_file}"
    
    temp_save = f"{target_file}.tmp"
    old_save = f"{target_file}.old"
    
    try:
        cert_path = config.get("cert_path", "./certs/agent.crt")
        key_path = config.get("key_path", "./certs/agent.key")
        ca_path = config.get("ca_path", "./certs/ca.crt")
        
        verify_ssl = ca_path if (ca_path and os.path.exists(ca_path)) else True
        r = requests.get(file_url, cert=(cert_path, key_path), verify=verify_ssl, stream=True, timeout=30)
        
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
                
            # Substituição Eficiente sem BAT
            # 1. Deleta o .old anterior se existir
            if os.path.exists(old_save):
                try: os.remove(old_save)
                except Exception as e: log_event(f"Aviso: Nao conseguiu deletar {old_save}: {e}", "WARNING")
            
            # 2. Renomeia o executável VIVO para .old (O Windows permite renomear arquivos em uso)
            if os.path.exists(target_file):
                try:
                    os.rename(target_file, old_save)
                except Exception as e:
                    log_event(f"Falha ao renomear {target_file} para .old: {e}. Abortando.", "ERROR")
                    return False
                
            # 3. Coloca o arquivo novo no lugar iterando para aguardar liberação final do Sistema Operacional (File Lock)
            rename_success = False
            for _ in range(30):
                try:
                    os.rename(temp_save, target_file)
                    rename_success = True
                    break
                except OSError as e:
                    time.sleep(1)
                    
            if rename_success:
                log_event(f"Módulo [{mod_key}] substituído com sucesso através de rename (.old).", "INFO")
                return True
            else:
                log_event(f"Falha ao renomear novo binário {temp_save} após 30 tentativas. Timeout de I/O. Rollback acionado.", "ERROR")
                try: os.rename(old_save, target_file)
                except: pass
                
                try: os.remove(temp_save)
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
    
    while True:
        # Puxa o config fresquinho a cada ciclo via IPC
        config = request_config_from_core()
        
        try:
            cleanup_old_files()
            check_and_apply_updates()
        except Exception as e:
            pass
            
        # Garante um valor padrão (agora tratado como o valor 'bruto' desejado pelo usuário)
        try:
            polling_interval = int(config.get("update_check_interval_minutes", 60))
        except:
            polling_interval = 60

        try:
            server_urls = config.get("server_urls", [config.get('server_base_url')])
            cert_path = config.get("cert_path", "./certs/agent.crt")
            key_path = config.get("key_path", "./certs/agent.key")
            ca_path = config.get("ca_path", "./certs/ca.crt")
            
            for url in server_urls:
                try:
                    settings_url = f"{url}/settings/agent"
                    verify_ssl = ca_path if (ca_path and os.path.exists(ca_path)) else True
                    r = requests.get(settings_url, cert=(cert_path, key_path), verify=verify_ssl, timeout=10)
                        
                    if r.status_code == 200:
                        settings_data = r.json()
                        if "updateCheckIntervalMinutes" in settings_data:
                            polling_interval = int(settings_data["updateCheckIntervalMinutes"])
                        
                        remote_osq_ver = settings_data.get("selectedOsqueryVersion")
                        if remote_osq_ver:
                            check_and_update_osquery(url, remote_osq_ver)
                        break
                except:
                    continue
        except:
            pass
            
        
        # O painel/config guarda em MINUTOS. Multiplicamos por 60 para sleep em segundos.
        actual_sleep = max(1, polling_interval)
        time.sleep(actual_sleep * 60)
